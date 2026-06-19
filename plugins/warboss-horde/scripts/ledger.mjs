#!/usr/bin/env node
// warboss-horde cost ledger.
//
// The plugin is doctrine-only — the WARBOSS (main agent) dispatches the `doer`
// via Claude Code's Agent tool and gets `subagent_tokens` + the chosen model
// back in the result. This script is how that fact gets PERSISTED: one
// crash-safe JSON line per dispatch, mirroring the harness's `jsonlFileSink`.
//
// Usage:
//   node ledger.mjs add '<json>'     append one dispatch record (see fields below)
//   node ledger.mjs summary          totals per model + grand total from the ledger
//
// Options (either subcommand):
//   --file <path>    ledger file (default: $WARBOSS_LEDGER, else ./.warboss-horde/ledger.jsonl)
//   --tiers <path>   tiers.json for prices (default: ../tiers.json next to this script)
//
// `add` payload — required: model, tokens. Optional: task, slice, rung, tier,
// tool_uses, duration_ms, round, verdict. The script stamps `ts` (ISO) and
// computes `est_usd` from the price map. Malformed input is rejected (exit 1):
// an un-costed call is never silently logged as free.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') out.file = argv[++i];
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

function cmdSummary(args) {
  const file = ledgerPath(args);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    die(`no ledger at ${file}`);
  }

  const rows = text.split('\n').filter((l) => l.trim().length > 0).map((l) => JSON.parse(l));
  if (rows.length === 0) die(`ledger empty at ${file}`);

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

  process.stdout.write(`warboss-horde ledger — ${file}\n`);
  process.stdout.write(`${rows.length} dispatches\n\n`);
  const pad = (s, n) => String(s).padEnd(n);
  const padl = (s, n) => String(s).padStart(n);
  process.stdout.write(`${pad('model', 12)}${padl('dispatches', 12)}${padl('tokens', 12)}${padl('est_usd', 12)}\n`);
  for (const [model, m] of byModel) {
    const usd = m.usdKnown ? `$${m.usd.toFixed(4)}` : 'partial';
    process.stdout.write(`${pad(model, 12)}${padl(m.dispatches, 12)}${padl(m.tokens, 12)}${padl(usd, 12)}\n`);
  }
  const gUsd = usdKnown ? `$${totUsd.toFixed(4)}` : `~$${totUsd.toFixed(4)} (partial)`;
  process.stdout.write(`${pad('TOTAL', 12)}${padl(rows.length, 12)}${padl(totTok, 12)}${padl(gUsd, 12)}\n`);
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
if (cmd === 'add') cmdAdd(args);
else if (cmd === 'summary') cmdSummary(args);
else die('usage: node ledger.mjs <add|summary> [--file <path>] [--tiers <path>]');
