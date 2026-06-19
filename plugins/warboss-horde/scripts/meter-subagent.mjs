#!/usr/bin/env node
// warboss-horde automatic worker meter — runs as a SubagentStop hook.
//
// This is the structural fix for the metering hole: the manual `ledger.mjs add`
// path depends on the WARBOSS remembering to log. This script fires on EVERY
// subagent finish (no model discipline) and reads the authoritative source — the
// subagent's own transcript, which records per-message `usage` with the full
// input / output / cache split. That makes the USD accurate, not blended.
//
// Wired by hooks/hooks.json:
//   SubagentStop -> node "${CLAUDE_PLUGIN_ROOT}/scripts/meter-subagent.mjs"
// The hook hands us JSON on stdin: { transcript_path, cwd, session_id,
// agent_type, hook_event_name, ... }. We append one ledger line per model seen.
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

  const agentType = hook.agent_type || hook.subagent_type || '';
  if (process.env.WARBOSS_METER_DOER_ONLY === '1' && !String(agentType).toLowerCase().includes('doer')) {
    return;
  }

  // Sum usage per model across the subagent's assistant messages.
  const byModel = new Map();
  const lines = fs.readFileSync(transcript, 'utf8').split(/\r?\n/);
  for (const line of lines) {
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
  if (byModel.size === 0) return;

  const pricing = loadPricing();
  const agentId = path.basename(transcript, path.extname(transcript));
  const ts = new Date().toISOString();

  const ledgerFile = process.env.WARBOSS_LEDGER
    ? path.resolve(process.env.WARBOSS_LEDGER)
    : path.resolve(hook.cwd || process.cwd(), '.warboss-horde', 'ledger.jsonl');
  fs.mkdirSync(path.dirname(ledgerFile), { recursive: true });

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
}

try {
  main();
} catch (e) {
  // Never break the turn over a metering failure.
  process.stderr.write(`meter-subagent: ${e && e.message ? e.message : e}\n`);
}
process.exit(0);
