#!/usr/bin/env node
// warboss-horde orchestrator meter — runs as a Stop hook (session end).
//
// The bet is correctness-per-DOLLAR, and the expensive half of that dollar is the
// WARBOSS's OWN deciding work — authoring the entropy out, judging, retrying. The
// SubagentStop meter (`meter-subagent.mjs`) deliberately skips the parent to avoid
// multi-counting a growing transcript on every subagent finish, so without this
// the ledger only ever sees the cheap (doer) half. This hook closes that hole:
// it fires ONCE at session end and meters the PARENT transcript's own assistant
// messages — the orchestrator's tokens — keyed by session_id so a re-fire is a
// no-op.
//
// Wired by hooks/hooks.json:
//   Stop -> node "${CLAUDE_PLUGIN_ROOT}/scripts/meter-orchestrator.mjs"
// Hook payload on stdin: { transcript_path, cwd, session_id, hook_event_name, ... }.
//
// What it meters: ONLY the assistant messages in the PARENT transcript itself
// (transcript whose basename == session_id). Subagent tokens live in separate
// per-subagent transcripts and are metered by meter-subagent.mjs — they are NOT
// in the parent transcript, so there is no double-count to subtract.
//
// Invariant: a hook must NEVER break the session. Any error -> stderr, exit 0.
//
// Env knobs:
//   WARBOSS_LEDGER  override ledger file path

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

function loadTiers() {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'tiers.json'), 'utf8'));
  } catch {
    return {};
  }
}

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

function tierForModel(ladder, model) {
  if (!Array.isArray(ladder) || !model) return null;
  const m = model.toLowerCase();
  for (const rung of ladder) {
    const lm = String(rung && rung.model ? rung.model : '').toLowerCase();
    if (lm && (m.includes(lm) || lm.includes(m))) return rung.tier || null;
  }
  for (const word of ['haiku', 'sonnet', 'opus']) {
    if (!m.includes(word)) continue;
    const rung = ladder.find((r) => String(r && r.model ? r.model : '').toLowerCase().includes(word));
    if (rung) return rung.tier || null;
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

// Orchestrator agent_id: stable per session. The Stop hook fires once per turn
// and the parent transcript GROWS across the session, so we append a fresh
// cumulative snapshot each fire under the SAME agent_id. `ledger.mjs summary`
// keeps the last row per (agent_id, model), collapsing the snapshots to the
// final total — the same snapshot-then-dedup pattern the subagent meter relies on.
function orchestratorIdFor(sessionId) {
  return `orchestrator-${sessionId}`;
}

function main() {
  const raw = readStdin();
  if (!raw.trim()) return;

  let hook;
  try {
    hook = JSON.parse(raw);
  } catch {
    process.stderr.write('meter-orchestrator: hook payload not JSON\n');
    return;
  }

  const transcript = hook.transcript_path;
  if (!transcript || !fs.existsSync(transcript)) return;

  // Only meter the PARENT transcript. If basename != session_id this Stop fired
  // for something that is not the top session — nothing for us to do.
  const base = path.basename(transcript, path.extname(transcript));
  if (hook.session_id && base !== hook.session_id) return;

  const tiers = loadTiers();
  const pricing = tiers.pricing && typeof tiers.pricing === 'object' ? tiers.pricing : {};
  const ladder = Array.isArray(tiers.ladder) ? tiers.ladder : [];
  const ts = new Date().toISOString();

  const ledgerFile = process.env.WARBOSS_LEDGER
    ? path.resolve(process.env.WARBOSS_LEDGER)
    : path.resolve(hook.cwd || process.cwd(), '.warboss-horde', 'ledger.jsonl');
  fs.mkdirSync(path.dirname(ledgerFile), { recursive: true });

  const byModel = sumByModel(transcript);
  if (byModel.size === 0) return;

  const agentId = orchestratorIdFor(hook.session_id || base);
  for (const [model, u] of byModel) {
    const tokens = u.input + u.output + u.cache_read + u.cache_creation;
    const tier = tierForModel(ladder, model);
    const line = {
      ts,
      source: 'hook',
      session_id: hook.session_id,
      agent_type: 'warboss-orchestrator',
      agent_id: agentId,
      model,
      ...(tier ? { tier } : {}),
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
  process.stderr.write(`meter-orchestrator: ${e && e.message ? e.message : e}\n`);
}
process.exit(0);
