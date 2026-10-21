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
import { priceForModel, messageUsd } from './pricing.mjs';

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

function tierForModel(ladder, model) {
  if (!Array.isArray(ladder) || !model) return null;
  const m = model.toLowerCase();
  // A rung's optional `match` lists every model id that serves that entropy
  // band. The top rung needs it: an orchestrator you drive as opus one session
  // and fable the next is one rung, not two, and a model missing from the
  // ladder is counted `untiered` — it escapes the thesis accounting fail-open.
  const names = (rung) => [rung && rung.model, ...(Array.isArray(rung && rung.match) ? rung.match : [])]
    .map((n) => String(n || '').toLowerCase())
    .filter(Boolean);
  for (const rung of ladder) {
    if (names(rung).some((lm) => m.includes(lm) || lm.includes(m))) return rung.tier || null;
  }
  for (const word of ['haiku', 'sonnet', 'fable', 'opus']) {
    if (!m.includes(word)) continue;
    const rung = ladder.find((r) => names(r).some((lm) => lm.includes(word)));
    if (rung) return rung.tier || null;
  }
  return null;
}

// Sum usage per model across the assistant messages of one transcript file.
// One API response with N content blocks is written as N JSONL lines sharing
// one message.id, each repeating the full usage — summing raw lines counts a
// response N times (~2x inflation vs /cost). Dedupe by message id; the LAST
// line per id carries the final streamed usage.
function sumByModel(file, pricing) {
  const byModel = new Map();
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return byModel;
  }
  const byId = new Map(); // message id -> { model, usage } (last line wins)
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
    // Claude Code injects placeholder assistant messages (interrupts, compact
    // summaries) carrying a sentinel model like "<synthetic>" and all-zero usage.
    // They are not real model calls — metering them writes a phantom, price-less
    // ledger row that poisons the board with a partial/n-a dispatch. Skip them.
    if (model.startsWith('<')) continue;
    byId.set(msg.id || rec.uuid, { model, usage: msg.usage });
  }
  for (const { model, usage } of byId.values()) {
    const acc = byModel.get(model) || { input: 0, output: 0, cache_read: 0, cache_creation: 0, cache_creation_1h: 0, usd: 0 };
    acc.input += usage.input_tokens || 0;
    acc.output += usage.output_tokens || 0;
    acc.cache_read += usage.cache_read_input_tokens || 0;
    acc.cache_creation += usage.cache_creation_input_tokens || 0;
    acc.cache_creation_1h += usage.cache_creation?.ephemeral_1h_input_tokens || 0;
    // Price per message (tier thresholds apply per message); one null poisons the row.
    const cost = messageUsd(priceForModel(pricing, model), usage);
    acc.usd = acc.usd === null || cost === null ? null : acc.usd + cost;
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

  const byModel = sumByModel(transcript, pricing);
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
      cache_creation_1h: u.cache_creation_1h,
      est_usd: u.usd === null ? null : Number(u.usd.toFixed(6)),
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
