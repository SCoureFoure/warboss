#!/usr/bin/env node
// warboss-horde cost ledger.
//
// The plugin is doctrine-only — the WARBOSS (main agent) dispatches the `doer`
// via Claude Code's Agent tool and gets `subagent_tokens` + the chosen model
// back in the result. This script is how that fact gets PERSISTED: one
// crash-safe JSON line per dispatch, mirroring the harness's `jsonlFileSink`.
//
// Usage:
//   node ledger.mjs add '<json>'              append one dispatch record (see fields below)
//   node ledger.mjs annotate <agent_id> '<json>'  attach a judge verdict to a dispatch
//   node ledger.mjs summary                   per-model + per-tier board from the ledger
//
// Options (any subcommand):
//   --file <path>      ledger file (default: $WARBOSS_LEDGER, else ./.warboss-horde/ledger.jsonl)
//   --verdicts <path>  verdicts file (default: ledger dir / verdicts.jsonl)
//   --tiers <path>     tiers.json for prices (default: ../tiers.json next to this script)
//
// `add` payload — required: model, tokens. Optional: task, slice, rung, tier,
// tool_uses, duration_ms, round, verdict. The script stamps `ts` (ISO) and
// computes `est_usd` from the price map. Malformed input is rejected (exit 1):
// an un-costed call is never silently logged as free.
//
// `annotate <agent_id> '<json>'` — the cost ledger is machine truth (tokens), but
// whether a dispatch was GREEN, which RETRY round it was, and which root CAUSE a
// red had are JUDGE truth, known only to the WARBOSS after it runs the verify
// command. The hook can't see them. So the WARBOSS records them here, keyed by the
// dispatch's `agent_id`, into a sibling `verdicts.jsonl`. `summary` left-joins the
// two. Payload fields (all optional except by convention): verdict (green|red),
// round (1-based), cause (test_wrong|under_decided|wrong_rung|worker_miss),
// slice, task. The cost ledger is never mutated — verdicts live in their own file.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') out.file = argv[++i];
    else if (a === '--verdicts') out.verdicts = argv[++i];
    else if (a === '--tiers') out.tiers = argv[++i];
    else out._.push(a);
  }
  return out;
}

function ledgerPath(args) {
  if (args.file) return path.resolve(args.file);
  if (process.env.WARBOSS_LEDGER) return path.resolve(process.env.WARBOSS_LEDGER);
  return path.resolve(process.cwd(), '.warboss-horde', 'ledger.jsonl');
}

function verdictsPath(args) {
  if (args.verdicts) return path.resolve(args.verdicts);
  if (process.env.WARBOSS_VERDICTS) return path.resolve(process.env.WARBOSS_VERDICTS);
  return path.resolve(path.dirname(ledgerPath(args)), 'verdicts.jsonl');
}

function loadPrices(args) {
  const tiersPath = args.tiers
    ? path.resolve(args.tiers)
    : path.resolve(__dirname, '..', 'tiers.json');
  try {
    const cfg = JSON.parse(fs.readFileSync(tiersPath, 'utf8'));
    return cfg.prices && typeof cfg.prices === 'object' ? cfg.prices : {};
  } catch {
    return {};
  }
}

function loadLadder(args) {
  const tiersPath = args.tiers
    ? path.resolve(args.tiers)
    : path.resolve(__dirname, '..', 'tiers.json');
  try {
    const cfg = JSON.parse(fs.readFileSync(tiersPath, 'utf8'));
    return Array.isArray(cfg.ladder) ? cfg.ladder : [];
  } catch {
    return [];
  }
}

// Map a model id/alias to its ladder tier. Substring either way, with a
// class-word fallback so an alias rung ('sonnet') still resolves a full id.
function tierForModel(ladder, model) {
  if (!Array.isArray(ladder) || !model) return null;
  const m = String(model).toLowerCase();
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

// A price entry is $/million-tokens (blended) or null to log tokens only.
function priceFor(prices, model) {
  const p = prices[model];
  return typeof p === 'number' && p >= 0 ? p : null;
}

function estUsd(prices, model, tokens) {
  const p = priceFor(prices, model);
  if (p === null) return null;
  return Number(((tokens / 1_000_000) * p).toFixed(6));
}

function die(msg) {
  process.stderr.write(`ledger: ${msg}\n`);
  process.exit(1);
}

function cmdAdd(args) {
  const raw = args._[1];
  if (!raw) die('add needs a JSON payload: node ledger.mjs add \'{"model":"haiku","tokens":7172}\'');

  let rec;
  try {
    rec = JSON.parse(raw);
  } catch (e) {
    die(`payload is not valid JSON: ${e.message}`);
  }
  if (!rec || typeof rec !== 'object') die('payload must be a JSON object');
  if (typeof rec.model !== 'string' || rec.model.length === 0) die('payload.model (string) is required');
  if (typeof rec.tokens !== 'number' || !Number.isFinite(rec.tokens) || rec.tokens < 0) {
    die('payload.tokens (non-negative number) is required');
  }

  const prices = loadPrices(args);
  const line = {
    ts: new Date().toISOString(),
    ...rec,
    est_usd: estUsd(prices, rec.model, rec.tokens),
  };

  const file = ledgerPath(args);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(line) + '\n');

  const usd = line.est_usd === null ? 'n/a (no price)' : `$${line.est_usd}`;
  process.stdout.write(`logged: ${line.model} ${line.tokens} tok → ${usd}  [${file}]\n`);
}

const VERDICTS = new Set(['green', 'red']);
const CAUSES = new Set(['test_wrong', 'under_decided', 'wrong_rung', 'worker_miss']);

// Newest doer dispatch in the ledger that has no verdict yet. Lets the WARBOSS
// say `annotate latest '{...}'` right after judging, without hunting the agent_id.
function latestUnjudgedAgentId(args) {
  const file = ledgerPath(args);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    die(`no ledger at ${file} — cannot resolve 'latest'`);
  }
  const judged = new Set(loadVerdicts(verdictsPath(args)).keys());
  let best = null;
  for (const l of text.split('\n')) {
    if (!l.trim()) continue;
    let r;
    try {
      r = JSON.parse(l);
    } catch {
      continue;
    }
    if (!r || !r.agent_id) continue;
    if (r.agent_type === 'warboss-orchestrator') continue; // judge doers, not the orchestrator
    if (judged.has(r.agent_id)) continue;
    if (!best || String(r.ts || '') >= String(best.ts || '')) best = r;
  }
  if (!best) die("no un-judged doer dispatch found to annotate as 'latest'");
  return best.agent_id;
}

function cmdAnnotate(args) {
  let agentId = args._[1];
  const raw = args._[2];
  if (!agentId) die('annotate needs an agent_id (or "latest"): node ledger.mjs annotate <agent_id> \'{"verdict":"green"}\'');
  if (!raw) die('annotate needs a JSON payload: node ledger.mjs annotate <agent_id> \'{"verdict":"green","round":1}\'');
  if (agentId === 'latest') agentId = latestUnjudgedAgentId(args);

  let rec;
  try {
    rec = JSON.parse(raw);
  } catch (e) {
    die(`payload is not valid JSON: ${e.message}`);
  }
  if (!rec || typeof rec !== 'object') die('payload must be a JSON object');
  if (rec.verdict !== undefined && !VERDICTS.has(rec.verdict)) {
    die(`payload.verdict must be one of: ${[...VERDICTS].join(', ')}`);
  }
  if (rec.cause !== undefined && !CAUSES.has(rec.cause)) {
    die(`payload.cause must be one of: ${[...CAUSES].join(', ')}`);
  }
  if (rec.round !== undefined && (!Number.isInteger(rec.round) || rec.round < 1)) {
    die('payload.round must be a positive integer');
  }

  const line = { ts: new Date().toISOString(), agent_id: agentId, ...rec };
  const file = verdictsPath(args);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(line) + '\n');
  process.stdout.write(`annotated: ${agentId} ${rec.verdict || '?'}${rec.round ? ` r${rec.round}` : ''}${rec.cause ? ` (${rec.cause})` : ''}  [${file}]\n`);
}

// Last verdict per agent_id (later annotate wins) keyed for the summary join.
function loadVerdicts(file) {
  const byId = new Map();
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return byId;
  }
  for (const l of text.split('\n')) {
    if (!l.trim()) continue;
    try {
      const r = JSON.parse(l);
      if (r && r.agent_id) byId.set(r.agent_id, r);
    } catch {
      /* skip */
    }
  }
  return byId;
}

function cmdSummary(args) {
  const file = ledgerPath(args);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    die(`no ledger at ${file}`);
  }

  const allRows = text.split('\n').filter((l) => l.trim().length > 0).map((l) => JSON.parse(l));
  if (allRows.length === 0) die(`ledger empty at ${file}`);

  // Dedup hook rows by (agent_id, model): a SubagentStop hook may fire more than
  // once for the same dispatch, and an older meter re-summed a growing transcript
  // each time. Keep the LAST line per (agent_id, model) so re-fires/snapshots are
  // not summed together. Rows without an agent_id (manual `add`) are never merged.
  const seen = new Map();
  const rows = [];
  for (const r of allRows) {
    if (r && r.agent_id) {
      const key = `${r.agent_id}::${r.model}`;
      if (seen.has(key)) {
        rows[seen.get(key)] = r; // replace earlier snapshot with the latest
        continue;
      }
      seen.set(key, rows.length);
    }
    rows.push(r);
  }

  const ladder = loadLadder(args);
  const isOrchestrator = (r) => r.agent_type === 'warboss-orchestrator';
  const tierOf = (r) => r.tier || tierForModel(ladder, r.model) || 'untiered';

  const byModel = new Map();
  let totTok = 0;
  let totUsd = 0;
  let usdKnown = true;
  for (const r of rows) {
    const m = byModel.get(r.model) || { dispatches: 0, tokens: 0, usd: 0, usdKnown: true };
    m.dispatches += 1;
    m.tokens += r.tokens || 0;
    if (typeof r.est_usd === 'number') m.usd += r.est_usd;
    else m.usdKnown = false;
    byModel.set(r.model, m);
    totTok += r.tokens || 0;
    if (typeof r.est_usd === 'number') totUsd += r.est_usd;
    else usdKnown = false;
  }

  const pad = (s, n) => String(s).padEnd(n);
  const padl = (s, n) => String(s).padStart(n);
  const dollars = (v, known) => (known ? `$${v.toFixed(4)}` : `~$${v.toFixed(4)}`);

  process.stdout.write(`warboss-horde ledger — ${file}\n`);
  process.stdout.write(`${rows.length} dispatches\n\n`);
  process.stdout.write(`${pad('model', 12)}${padl('dispatches', 12)}${padl('tokens', 12)}${padl('est_usd', 12)}\n`);
  for (const [model, m] of byModel) {
    const usd = m.usdKnown ? `$${m.usd.toFixed(4)}` : 'partial';
    process.stdout.write(`${pad(model, 12)}${padl(m.dispatches, 12)}${padl(m.tokens, 12)}${padl(usd, 12)}\n`);
  }
  const gUsd = usdKnown ? `$${totUsd.toFixed(4)}` : `~$${totUsd.toFixed(4)} (partial)`;
  process.stdout.write(`${pad('TOTAL', 12)}${padl(rows.length, 12)}${padl(totTok, 12)}${padl(gUsd, 12)}\n`);

  // --- Tier split (the thesis check: is the cheapest rung doing the work?) -----
  // The 'do' band = dispatched workers; the 'decide' band = the orchestrator.
  // The thesis is about the do band, so LOW-share is computed over doer rows only.
  const doerRows = rows.filter((r) => !isOrchestrator(r));
  const byTier = new Map();
  for (const r of doerRows) {
    const t = tierOf(r);
    const m = byTier.get(t) || { dispatches: 0, usd: 0, usdKnown: true };
    m.dispatches += 1;
    if (typeof r.est_usd === 'number') m.usd += r.est_usd;
    else m.usdKnown = false;
    byTier.set(t, m);
  }
  if (doerRows.length > 0) {
    process.stdout.write('\ntier split (doer dispatches — the "do" band)\n');
    process.stdout.write(`${pad('tier', 12)}${padl('dispatches', 12)}${padl('disp%', 8)}${padl('est_usd', 12)}\n`);
    // Order LOW, MID, HIGH, then anything else, then untiered.
    const order = ['LOW', 'MID', 'HIGH'];
    const tiers = [...byTier.keys()].sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    for (const t of tiers) {
      const m = byTier.get(t);
      const pct = `${((100 * m.dispatches) / doerRows.length).toFixed(0)}%`;
      const usd = m.usdKnown ? `$${m.usd.toFixed(4)}` : 'partial';
      process.stdout.write(`${pad(t, 12)}${padl(m.dispatches, 12)}${padl(pct, 8)}${padl(usd, 12)}\n`);
    }
    const low = byTier.get('LOW');
    const lowShare = low ? (100 * low.dispatches) / doerRows.length : 0;
    process.stdout.write(`LOW-share: ${lowShare.toFixed(0)}% of doer dispatches`);
    process.stdout.write(lowShare < 25 ? '  ⚠ ladder under-exploited — author entropy further down\n' : '\n');
  }

  // --- Decide : Do ratio (both bands of correctness-per-dollar) ---------------
  let decideUsd = 0, doUsd = 0;
  let decideKnown = true, doKnown = true;
  let sawOrchestrator = false;
  for (const r of rows) {
    const v = typeof r.est_usd === 'number' ? r.est_usd : null;
    if (isOrchestrator(r)) {
      sawOrchestrator = true;
      if (v === null) decideKnown = false; else decideUsd += v;
    } else {
      if (v === null) doKnown = false; else doUsd += v;
    }
  }
  process.stdout.write('\ndecide : do spend\n');
  process.stdout.write(`  decide (orchestrator): ${dollars(decideUsd, decideKnown)}\n`);
  process.stdout.write(`  do     (workers)     : ${dollars(doUsd, doKnown)}\n`);
  if (!sawOrchestrator) {
    process.stdout.write('  ⚠ no orchestrator rows — decide cost uncaptured (run with the Stop meter wired). Use /cost for the whole-session figure.\n');
  } else if (doUsd > 0) {
    process.stdout.write(`  ratio decide:do = ${(decideUsd / doUsd).toFixed(2)} : 1\n`);
  }

  // --- Verdict board (judge truth, joined from verdicts.jsonl) ----------------
  const verdicts = loadVerdicts(verdictsPath(args));
  if (verdicts.size > 0) {
    let green = 0, red = 0, annotated = 0;
    const causes = new Map();
    for (const r of doerRows) {
      const v = verdicts.get(r.agent_id);
      if (!v || !v.verdict) continue;
      annotated += 1;
      if (v.verdict === 'green') green += 1;
      else {
        red += 1;
        const c = v.cause || 'unspecified';
        causes.set(c, (causes.get(c) || 0) + 1);
      }
    }
    process.stdout.write('\nverdict board (annotated doer dispatches)\n');
    process.stdout.write(`  annotated: ${annotated}/${doerRows.length}   green: ${green}   red: ${red}\n`);
    if (green > 0) {
      process.stdout.write(`  tries-per-green: ${(annotated / green).toFixed(2)}\n`);
    }
    if (causes.size > 0) {
      const hist = [...causes.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}=${n}`).join('  ');
      process.stdout.write(`  red causes: ${hist}\n`);
    }
  }
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
if (cmd === 'add') cmdAdd(args);
else if (cmd === 'annotate') cmdAnnotate(args);
else if (cmd === 'summary') cmdSummary(args);
else die('usage: node ledger.mjs <add|annotate|summary> [--file <path>] [--verdicts <path>] [--tiers <path>]');
