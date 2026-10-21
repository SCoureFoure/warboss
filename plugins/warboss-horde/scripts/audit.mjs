// warboss-horde offline transcript audit: E1 (restart counterfactual — would cutting the session into
// segments, re-seeded from a handoff, have been cheaper?) and E3 (cache-miss classification by idle gap).
// Run: node scripts/audit.mjs [--root <projects dir>] [--out <dir>] [--min-calls <n>]
// Writes <out>/sessions.csv and <out>/summary.md from parent transcripts at <root>/<proj>/<x>.jsonl.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { priceForModel, ratesFor } from './pricing.mjs';

// Parse transcript text into one call per assistant message id (last usage wins, first ts wins).
export function loadCalls(text) {
  const byId = new Map();
  for (const ln of String(text).split(/\r?\n/)) {
    if (!ln.trim()) continue;
    let rec;
    try { rec = JSON.parse(ln); } catch { continue; }
    const msg = rec && rec.message;
    if (!msg || msg.role !== 'assistant' || !msg.usage || typeof msg.usage !== 'object') continue;
    if (typeof msg.model === 'string' && msg.model.startsWith('<')) continue;
    const id = msg.id || rec.uuid;
    const prev = byId.get(id);
    if (prev) { prev.usage = msg.usage; prev.model = msg.model; continue; }
    const t = Date.parse(rec.timestamp);
    byId.set(id, { id, ts: Number.isFinite(t) ? t : null, model: msg.model, usage: msg.usage });
  }
  return [...byId.values()].map((c) => {
    const usage = c.usage;
    const input = usage.input_tokens || 0;
    const read = usage.cache_read_input_tokens || 0;
    const create = usage.cache_creation_input_tokens || 0;
    return {
      id: c.id, ts: c.ts, model: c.model, input, output: usage.output_tokens || 0, read, create,
      create1h: (usage.cache_creation && usage.cache_creation.ephemeral_1h_input_tokens) || 0,
      P: input + read + create, usage,
    };
  });
}

// Least squares of ys on x = 0..n-1.
export function fitLine(ys) {
  const n = ys.length;
  if (n < 2) return { slope: 0, r2: 0 };
  const mx = (n - 1) / 2;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (i - mx) ** 2;
    sxy += (i - mx) * (ys[i] - my);
    syy += (ys[i] - my) ** 2;
  }
  if (syy === 0) return { slope: 0, r2: 0 };
  return { slope: sxy / sxx, r2: (sxy * sxy) / (sxx * syy) };
}

// Modeled input-side cost of cutting the session every `segment` calls (output excluded).
export function simulate(calls, { segment, handoff, r, w }) {
  if (!calls.length) return 0;
  const B = calls[0].P;
  let cost = 0;
  let prevQ = 0;
  for (let j = 0; j < calls.length; j++) {
    const a = Number.isFinite(segment) ? Math.floor(j / segment) * segment : 0;
    const Q = Math.max(B, calls[j].P - calls[a].P + B + (a > 0 ? handoff : 0));
    const W = j === a ? Q : Math.max(0, Q - prevQ);
    cost += r * (Q - W) + w * W;
    prevQ = Q;
  }
  return cost;
}

export function optimum(calls, { handoff, r, w }) {
  const B = calls.length ? calls[0].P : 0;
  const g = fitLine(calls.map((c) => c.P)).slope;
  const nStar = g > 0 ? Math.sqrt(2 * (w / r) * (B + handoff) / g) : null;
  const baseCost = simulate(calls, { segment: Infinity, handoff, r, w });
  let bestSegment = null;
  let bestCost = baseCost;
  if (calls.length >= 2) {
    for (let s = 2; s <= calls.length; s++) {
      const c = simulate(calls, { segment: s, handoff, r, w });
      if (bestSegment === null || c < bestCost) { bestSegment = s; bestCost = c; }
    }
  }
  return { nStar, bestSegment, bestCost, baseCost, saving: baseCost > 0 ? 1 - bestCost / baseCost : 0 };
}

export function classifyMisses(calls) {
  const out = [];
  for (let k = 1; k < calls.length; k++) {
    const c = calls[k];
    if (!(c.create > 0.5 * c.P)) continue;
    const a = calls[k - 1].ts;
    const gapMs = typeof c.ts === 'number' && typeof a === 'number' ? c.ts - a : null;
    const min = 60 * 1000;
    const bucket = gapMs === null ? 'unknown' : gapMs < 5 * min ? '<5m' : gapMs <= 60 * min ? '5-60m' : '>60m';
    out.push({ k, gapMs, bucket, create: c.create });
  }
  return out;
}

const HANDOFFS = [5000, 15000, 30000];
const BUCKET_COL = { '<5m': 'lt5m', '5-60m': '5to60m', '>60m': 'gt60m', unknown: 'unknown' };
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const median = (xs) => {
  const v = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const fmt = (x) => (x === null || x === undefined ? '' : Number.isInteger(x) ? String(x) : x.toFixed(4));
const pct = (x, tot) => (tot > 0 ? ((100 * x) / tot).toFixed(2) + '%' : 'n/a');

function analyse(calls, price) {
  const s = { usd_read: 0, usd_write: 0, usd_input: 0, usd_output: 0 };
  for (const c of calls) {
    const rt = ratesFor(price, c.usage);
    s.usd_read += (c.read * rt.cache_read) / 1e6;
    s.usd_write += ((c.create - c.create1h) * rt.cache_write + c.create1h * rt.cache_write_1h) / 1e6;
    s.usd_input += (c.input * rt.input) / 1e6;
    s.usd_output += (c.output * rt.output) / 1e6;
  }
  s.usd_total = s.usd_read + s.usd_write + s.usd_input + s.usd_output;
  const sumRead = sum(calls.map((c) => c.read));
  const sumCreate = sum(calls.map((c) => c.create));
  s.r_eff = sumRead > 0 ? (s.usd_read * 1e6) / sumRead : price.cache_read;
  s.w_eff = sumCreate > 0 ? (s.usd_write * 1e6) / sumCreate : price.cache_write;
  const fit = fitLine(calls.map((c) => c.P));
  s.n = calls.length;
  s.B = calls[0].P;
  s.Pmax = Math.max(...calls.map((c) => c.P));
  s.g = fit.slope;
  s.r2 = fit.r2;
  const misses = classifyMisses(calls);
  s.miss_count = misses.length;
  for (const col of Object.values(BUCKET_COL)) s['miss_usd_' + col] = 0;
  for (const m of misses) s['miss_usd_' + BUCKET_COL[m.bucket]] += ((s.w_eff - s.r_eff) * m.create) / 1e6;
  s.opt = {};
  s.baseSum = {};
  for (const H of HANDOFFS) {
    const o = optimum(calls, { handoff: H, r: s.r_eff, w: s.w_eff });
    s.opt[H] = o;
    s['nstar_' + H] = o.nStar;
    s['best_seg_' + H] = o.bestSegment;
    s['saving_' + H] = o.saving;
  }
  return s;
}

function listSessionFiles(root) {
  const files = [];
  let projs = [];
  try { projs = fs.readdirSync(root, { withFileTypes: true }); } catch { return files; }
  for (const d of projs) {
    if (!d.isDirectory()) continue;
    for (const f of fs.readdirSync(path.join(root, d.name), { withFileTypes: true })) {
      if (f.isFile() && f.name.endsWith('.jsonl')) files.push(path.join(root, d.name, f.name));
    }
  }
  return files.sort();
}

function main(argv) {
  const arg = (name, def) => {
    const i = argv.indexOf(name);
    return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : def;
  };
  const root = path.resolve(arg('--root', path.join(os.homedir(), '.claude', 'projects')));
  const out = path.resolve(arg('--out', path.join(process.cwd(), '.warboss-horde', 'out', 'audit')));
  const minCalls = Number(arg('--min-calls', 20));
  const here = path.dirname(fileURLToPath(import.meta.url));
  const tiers = JSON.parse(fs.readFileSync(path.join(here, '..', 'tiers.json'), 'utf8'));

  const rows = [];
  let skippedShort = 0;
  let skippedUnpriced = 0;
  for (const file of listSessionFiles(root)) {
    const calls = loadCalls(fs.readFileSync(file, 'utf8'));
    if (calls.length < minCalls) { skippedShort++; continue; }
    const counts = new Map();
    for (const c of calls) counts.set(c.model, (counts.get(c.model) || 0) + 1);
    let model = null;
    let best = 0;
    for (const [m, n] of counts) if (n > best) { model = m; best = n; }
    const price = priceForModel(tiers.pricing, model);
    if (!price) { skippedUnpriced++; continue; }
    const rel = path.relative(root, file).split(path.sep).join('/').replace(/,/g, ';');
    rows.push({ file: rel, model, ...analyse(calls, price) });
  }

  const cols = ['file', 'model', 'n', 'B', 'Pmax', 'g', 'r2', 'usd_read', 'usd_write', 'usd_input', 'usd_output',
    'usd_total', 'r_eff', 'w_eff', 'miss_count', 'miss_usd_lt5m', 'miss_usd_5to60m', 'miss_usd_gt60m', 'miss_usd_unknown'];
  for (const H of HANDOFFS) cols.push('nstar_' + H, 'best_seg_' + H, 'saving_' + H);
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => (typeof r[c] === 'string' ? r[c] : fmt(r[c]))).join(','))];
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'sessions.csv'), csv.join('\n') + '\n');

  const L = [];
  L.push('# Transcript audit', '');
  L.push(`sessions analysed: ${rows.length}`, `skipped_short: ${skippedShort}`, `skipped_unpriced: ${skippedUnpriced}`, '');
  const total = sum(rows.map((r) => r.usd_total));
  L.push('## Dollars by class', '');
  for (const k of ['usd_read', 'usd_write', 'usd_input', 'usd_output', 'usd_total']) {
    const v = sum(rows.map((r) => r[k]));
    L.push(`- ${k}: $${v.toFixed(4)} (${pct(v, total)})`);
  }
  L.push('', '## Medians', '');
  for (const k of ['n', 'B', 'g', 'r2']) L.push(`- ${k}: ${fmt(median(rows.map((r) => r[k]))) || 'n/a'}`);
  const big = rows.filter((r) => r.n >= 60);
  L.push('', '## Restart counterfactual', '');
  for (const H of HANDOFFS) {
    const base = sum(rows.map((r) => r.opt[H].baseCost));
    const best = sum(rows.map((r) => r.opt[H].bestCost));
    L.push(`- H=${H}: median nstar ${fmt(median(rows.map((r) => r['nstar_' + H]))) || 'n/a'}, ` +
      `median best_seg ${fmt(median(rows.map((r) => r['best_seg_' + H]))) || 'n/a'}, ` +
      `median saving ${fmt(median(rows.map((r) => r['saving_' + H]))) || 'n/a'}, ` +
      `pooled saving ${base > 0 ? (1 - best / base).toFixed(4) : 'n/a'}`);
    L.push(`  - n>=60 (${big.length} sessions): median saving ${fmt(median(big.map((r) => r['saving_' + H]))) || 'n/a'}`);
  }
  L.push('', '## Cache-miss dollars', '');
  for (const [b, col] of Object.entries(BUCKET_COL)) {
    const v = sum(rows.map((r) => r['miss_usd_' + col]));
    L.push(`- ${b}: $${v.toFixed(4)} (${pct(v, total)} of total)`);
  }
  fs.writeFileSync(path.join(out, 'summary.md'), L.slice(0, 60).join('\n') + '\n');
  process.stdout.write(path.join(out, 'summary.md') + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
