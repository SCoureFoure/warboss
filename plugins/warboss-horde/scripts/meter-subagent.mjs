#!/usr/bin/env node
// warboss-horde automatic worker meter — runs as a SubagentStop hook.
//
// This is the structural fix for the metering hole: the manual `ledger.mjs add`
// path depends on the WARBOSS remembering to log. This script fires on EVERY
// subagent finish (no model discipline) and reads the authoritative source — the
// SUBAGENT's own transcript, which records per-message `usage` with the full
// input / output / cache split. That makes the USD accurate, not blended.
//
// Wired by hooks/hooks.json:
//   SubagentStop -> node "${CLAUDE_PLUGIN_ROOT}/scripts/meter-subagent.mjs"
// The hook hands us JSON on stdin: { transcript_path, cwd, session_id,
// agent_type, hook_event_name, ... }.
//
// IMPORTANT — which transcript to read. Some clients pass `transcript_path` =
// the SUBAGENT's own transcript; others pass the PARENT session transcript
// (basename == session_id) and store each subagent's transcript separately at
//   <dir>/<session_id>/subagents/agent-<id>.jsonl
// If we naively summed `transcript_path` when it is the parent, we would meter
// the WARBOSS's own (orchestrator) tokens at the wrong model AND re-sum the
// growing parent on every fire — multi-counting a dispatch by 50-100x. So:
//   - if transcript_path is the parent, redirect to its subagents/*.jsonl files;
//   - meter each subagent transcript under its OWN model;
//   - dedup by agent_id against the existing ledger so re-fires are no-ops.
//
// Invariant: a hook must NEVER break the session. Any error -> log to stderr and
// exit 0. A metering failure is a lost data point, not a broken turn.
//
// Env knobs:
//   WARBOSS_LEDGER          override ledger file path
//   WARBOSS_METER_DOER_ONLY  if "1", only meter subagents whose agent_type
//                            contains "doer" (default: meter every subagent)

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function loadPricing() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'tiers.json'), 'utf8'));
    return cfg.pricing && typeof cfg.pricing === 'object' ? cfg.pricing : {};
  } catch {
    return {};
  }
}

// Match a full model id ('claude-sonnet-4-6') to a pricing key by substring.
function priceForModel(pricing, model) {
  if (!model) return null;
  const m = model.toLowerCase();
  for (const key of Object.keys(pricing)) {
    if (key === '$comment') continue;
    if (m.includes(key.toLowerCase())) {
      const p = pricing[key];
      return p && typeof p === 'object' ? p : null;
    }
  }
  return null;
}

function usd(price, u) {
  if (!price) return null;
  const v =
    (u.input / 1e6) * (price.input || 0) +
    (u.output / 1e6) * (price.output || 0) +
    (u.cache_read / 1e6) * (price.cache_read || 0) +
    (u.cache_creation / 1e6) * (price.cache_write || 0);
  return Number(v.toFixed(6));
}

// Sum usage per model across the assistant messages of one transcript file.
function sumByModel(file) {
  const byModel = new Map();
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return byModel;
  }
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    const msg = rec.message || rec;
    if (!msg || msg.role !== 'assistant' || !msg.usage) continue;
    const model = msg.model || 'unknown';
    const acc = byModel.get(model) || { input: 0, output: 0, cache_read: 0, cache_creation: 0 };
    acc.input += msg.usage.input_tokens || 0;
    acc.output += msg.usage.output_tokens || 0;
    acc.cache_read += msg.usage.cache_read_input_tokens || 0;
    acc.cache_creation += msg.usage.cache_creation_input_tokens || 0;
    byModel.set(model, acc);
  }
  return byModel;
}

// agent_id for a transcript file: 'agent-a78f….jsonl' -> 'agent-a78f…'.
function agentIdFor(file) {
  return path.basename(file, path.extname(file));
}

// agent_type for a subagent file from its sibling meta.json, if present.
function agentTypeFor(file) {
  try {
    const meta = JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
    return meta.agentType || meta.agent_type || '';
  } catch {
    return '';
  }
}

// Decide which transcript file(s) actually belong to subagents.
function resolveSubagentTranscripts(transcript, sessionId) {
  const base = path.basename(transcript, path.extname(transcript));
  // transcript_path is the SUBAGENT's own transcript -> meter it directly.
  if (!sessionId || base !== sessionId) return [transcript];
  // transcript_path is the PARENT session -> find the per-subagent transcripts.
  const subDir = path.join(path.dirname(transcript), base, 'subagents');
  let entries;
  try {
    entries = fs.readdirSync(subDir);
  } catch {
    return [];
  }
  return entries
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => path.join(subDir, f));
}

// agent_ids already in the ledger -> re-fires become no-ops.
function loggedAgentIds(ledgerFile) {
  const ids = new Set();
  let text;
  try {
    text = fs.readFileSync(ledgerFile, 'utf8');
  } catch {
    return ids;
  }
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r && r.agent_id) ids.add(r.agent_id);
    } catch {
      /* skip */
    }
  }
  return ids;
}

function main() {
  const raw = readStdin();
  if (!raw.trim()) return;

  let hook;
  try {
    hook = JSON.parse(raw);
  } catch {
    process.stderr.write('meter-subagent: hook payload not JSON\n');
    return;
  }

  const transcript = hook.transcript_path;
  if (!transcript || !fs.existsSync(transcript)) {
    // No transcript to read (e.g. older client) — nothing we can meter.
    return;
  }

  const doerOnly = process.env.WARBOSS_METER_DOER_ONLY === '1';
  const pricing = loadPricing();
  const ts = new Date().toISOString();

  const ledgerFile = process.env.WARBOSS_LEDGER
    ? path.resolve(process.env.WARBOSS_LEDGER)
    : path.resolve(hook.cwd || process.cwd(), '.warboss-horde', 'ledger.jsonl');
  fs.mkdirSync(path.dirname(ledgerFile), { recursive: true });

  const already = loggedAgentIds(ledgerFile);
  const files = resolveSubagentTranscripts(transcript, hook.session_id);

  for (const file of files) {
    const agentId = agentIdFor(file);
    if (already.has(agentId)) continue; // idempotent: skip dispatches already logged

    // agent_type: prefer the file's own meta.json; fall back to the hook payload.
    const agentType = agentTypeFor(file) || hook.agent_type || hook.subagent_type || '';
    if (doerOnly && !String(agentType).toLowerCase().includes('doer')) continue;

    const byModel = sumByModel(file);
    if (byModel.size === 0) continue;

    for (const [model, u] of byModel) {
      const tokens = u.input + u.output + u.cache_read + u.cache_creation;
      const line = {
        ts,
        source: 'hook',
        session_id: hook.session_id,
        agent_type: agentType || undefined,
        agent_id: agentId,
        model,
        tokens,
        input: u.input,
        output: u.output,
        cache_read: u.cache_read,
        cache_creation: u.cache_creation,
        est_usd: usd(priceForModel(pricing, model), u),
      };
      fs.appendFileSync(ledgerFile, JSON.stringify(line) + '\n');
    }
    already.add(agentId); // guard against multiple model rows re-adding within this run
  }
}

try {
  main();
} catch (e) {
  // Never break the turn over a metering failure.
  process.stderr.write(`meter-subagent: ${e && e.message ? e.message : e}\n`);
}
process.exit(0);
