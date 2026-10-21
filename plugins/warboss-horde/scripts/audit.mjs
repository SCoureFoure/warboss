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
export function simulate(calls, { segment, handoff, r, w, starts, rewrites }) {
  if (!calls.length) return 0;
  const B = calls[0].P;
  const startSet = new Set(starts || []);
  const rewriteSet = new Set(rewrites || []);
  let cost = 0;
  let prevQ = 0;
  let lastStart = 0;
  for (let j = 0; j < calls.length; j++) {
    if (startSet.has(j)) lastStart = j;
    const segA = Number.isFinite(segment) ? Math.floor(j / segment) * segment : 0;
    const a = Math.max(segA, lastStart);
    const Q = Math.max(B, calls[j].P - calls[a].P + B + (a > 0 ? handoff : 0));
    const W = j === a || rewriteSet.has(j) ? Q : Math.max(0, Q - prevQ);
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

export function idleIndices(calls, minGapMs = 3600000) {
  const out = [];
  for (let k = 1; k < calls.length; k++) {
    const a = calls[k - 1].ts;
    const b = calls[k].ts;
    if (Number.isFinite(a) && Number.isFinite(b) && b - a > minGapMs) out.push(k);
  }
  return out;
}

const TOKEN_RE = /[A-Za-z0-9_][A-Za-z0-9_.\/:-]{7,}/g;
const IMAGE_TOKENS = 1600;
const TOOL_NAMES = new Set(['Read', 'Bash', 'Grep', 'Glob', 'Agent']);

// One entry per tool_result block, file order: size, calls it stays live for (to next compact boundary), and
// whether a token that was novel on arrival is later cited in assistant output.
export function toolLifetimes(text) {
  const recs = [];
  for (const ln of String(text).split(/\r?\n/)) {
    if (!ln.trim()) continue;
    let rec;
    try { rec = JSON.parse(ln); } catch { continue; }
    recs.push(rec);
  }
  const blocksOf = (msg) => {
    const c = msg && msg.content;
    if (typeof c === 'string') return [{ type: 'text', text: c }];
    return Array.isArray(c) ? c.filter((b) => b && typeof b === 'object') : [];
  };
  const tokensOf = (s) => String(s).match(TOKEN_RE) || [];
  // Pass 1: token -> last record index where it appears in assistant output.
  const lastIdx = new Map();
  recs.forEach((rec, i) => {
    const msg = rec && rec.message;
    if (!msg || msg.role !== 'assistant') return;
    for (const b of blocksOf(msg)) {
      let s = '';
      if (b.type === 'text') s = b.text;
      else if (b.type === 'thinking') s = b.thinking;
      else if (b.type === 'tool_use') s = JSON.stringify(b.input);
      if (typeof s !== 'string') continue;
      for (const t of tokensOf(s)) lastIdx.set(t, i);
    }
  });
  // Pass 2: walk in order.
  const out = [];
  const pending = [];
  const names = new Map();
  const seenCalls = new Set();
  const seenResults = new Set();
  const seen = new Set();
  let calls = 0;
  const flush = () => {
    for (const p of pending) out[p.k].liveCalls = calls - p.at;
    pending.length = 0;
  };
  recs.forEach((rec, i) => {
    if (!rec) return;
    if (rec.type === 'system' && rec.subtype === 'compact_boundary') { flush(); return; }
    const msg = rec.message;
    if (!msg) return;
    if (msg.role === 'assistant') {
      if (msg.usage && typeof msg.usage === 'object' && !(typeof msg.model === 'string' && msg.model.startsWith('<'))) {
        const id = msg.id || rec.uuid;
        if (!seenCalls.has(id)) { seenCalls.add(id); calls++; }
      }
      for (const b of blocksOf(msg)) {
        let s = '';
        if (b.type === 'text') s = b.text;
        else if (b.type === 'thinking') s = b.thinking;
        else if (b.type === 'tool_use') { names.set(b.id, b.name); s = JSON.stringify(b.input); }
        if (typeof s !== 'string') continue;
        for (const t of tokensOf(s)) seen.add(t);
      }
    } else if (msg.role === 'user') {
      for (const b of blocksOf(msg)) {
        if (b.type === 'text') {
          if (typeof b.text === 'string') for (const t of tokensOf(b.text)) seen.add(t);
        } else if (b.type === 'tool_result') {
          if (seenResults.has(b.tool_use_id)) continue;
          seenResults.add(b.tool_use_id);
          let name = names.get(b.tool_use_id);
          if (name === 'Task') name = 'Agent';
          const tool = TOOL_NAMES.has(name) ? name : 'other';
          let txt = '';
          let images = 0;
          if (typeof b.content === 'string') txt = b.content;
          else if (Array.isArray(b.content)) {
            const parts = [];
            for (const it of b.content) {
              if (it && it.type === 'text' && typeof it.text === 'string') parts.push(it.text);
              else if (it && it.type === 'image') images++;
            }
            txt = parts.join('\n');
          }
          const toks = tokensOf(txt);
          const novel = toks.filter((t) => !seen.has(t));
          for (const t of toks) seen.add(t);
          const referenced = novel.some((t) => (lastIdx.get(t) ?? -1) > i);
          out.push({ tool, sizeTokens: Math.ceil(txt.length / 4) + IMAGE_TOKENS * images, liveCalls: 0, referenced });
          pending.push({ k: out.length - 1, at: calls });
        }
      }
    }
  });
  flush();
  return out;
}

const HORDE_RE = /(^|\/)\.warboss-horde\//;
const SLICES_RE = /(^|\/)\.warboss-horde\/slices\//;
const fwd = (p) => String(p ?? '').replace(/\\/g, '/');

// One entry per block entering the prefix, arrival order: class, size, calls it stays live for (to next compact
// boundary), and whether the model authored it (pays output price).
export function prefixAttribution(text) {
  const recs = [];
  for (const ln of String(text).split(/\r?\n/)) {
    if (!ln.trim()) continue;
    let rec;
    try { rec = JSON.parse(ln); } catch { continue; }
    recs.push(rec);
  }
  const blocksOf = (msg) => {
    const c = msg && msg.content;
    if (typeof c === 'string') return [{ type: 'text', text: c }];
    return Array.isArray(c) ? c.filter((b) => b && typeof b === 'object') : [];
  };
  const counted = (msg) => msg.usage && typeof msg.usage === 'object' && !(typeof msg.model === 'string' && msg.model.startsWith('<'));
  const finalUsage = new Map();
  for (const rec of recs) {
    const msg = rec && rec.message;
    if (msg && msg.role === 'assistant' && counted(msg)) finalUsage.set(msg.id || rec.uuid, msg.usage);
  }
  const out = [];
  const pending = [];
  const uses = new Map();
  const seenCalls = new Set();
  const seenUses = new Set();
  const seenTexts = new Set();
  const seenResults = new Set();
  let calls = 0;
  const flush = () => {
    for (const p of pending) out[p.k].liveCalls = calls - p.at;
    pending.length = 0;
  };
  const emit = (cls, sizeTokens, authored) => {
    out.push({ cls, sizeTokens, liveCalls: 0, authored });
    pending.push({ k: out.length - 1, at: calls });
  };
  for (const rec of recs) {
    if (!rec) continue;
    if (rec.type === 'system' && rec.subtype === 'compact_boundary') { flush(); continue; }
    const msg = rec.message;
    if (!msg) continue;
    const id = msg.id || rec.uuid;
    if (msg.role === 'assistant') {
      if (counted(msg) && !seenCalls.has(id)) {
        seenCalls.add(id);
        calls++;
        const fu = finalUsage.get(id);
        const th = (fu && fu.output_tokens_details && fu.output_tokens_details.thinking_tokens) || 0;
        if (th > 0) emit('thinking', th, true);
      }
      for (const b of blocksOf(msg)) {
        if (b.type === 'text') {
          const key = id + JSON.stringify(b);
          if (seenTexts.has(key)) continue;
          seenTexts.add(key);
          emit('assistant_text', Math.ceil(String(b.text ?? '').length / 4), true);
        } else if (b.type === 'tool_use') {
          if (seenUses.has(b.id)) continue;
          seenUses.add(b.id);
          uses.set(b.id, b);
          let cls;
          if (b.name === 'Write') {
            const p = fwd(b.input && b.input.file_path);
            cls = SLICES_RE.test(p) ? 'use:Write:slices' : HORDE_RE.test(p) ? 'use:Write:horde' : 'use:Write:src';
          } else if (b.name === 'Edit' || b.name === 'MultiEdit' || b.name === 'NotebookEdit') cls = 'use:Edit';
          else if (b.name === 'Agent' || b.name === 'Task') cls = 'use:Agent';
          else if (b.name === 'Bash') cls = 'use:Bash';
          else cls = 'use:other';
          emit(cls, Math.ceil(JSON.stringify(b.input).length / 4), true);
        }
      }
    } else if (msg.role === 'user') {
      for (const b of blocksOf(msg)) {
        if (b.type === 'text') {
          emit('user_text', Math.ceil(String(b.text ?? '').length / 4), false);
        } else if (b.type === 'tool_result') {
          if (seenResults.has(b.tool_use_id)) continue;
          seenResults.add(b.tool_use_id);
          const u = uses.get(b.tool_use_id);
          const name = u && u.name;
          let cls;
          if (name === 'Read') cls = HORDE_RE.test(fwd(u.input && u.input.file_path)) ? 'result:Read:horde' : 'result:Read:src';
          else if (name === 'Agent' || name === 'Task') cls = 'result:Agent';
          else if (name === 'Bash' || name === 'Grep' || name === 'Glob') cls = 'result:' + name;
          else cls = 'result:other';
          let txt = '';
          let images = 0;
          if (typeof b.content === 'string') txt = b.content;
          else if (Array.isArray(b.content)) {
            const parts = [];
            for (const it of b.content) {
              if (it && it.type === 'text' && typeof it.text === 'string') parts.push(it.text);
              else if (it && it.type === 'image') images++;
            }
            txt = parts.join('\n');
          }
          emit(cls, Math.ceil(txt.length / 4) + IMAGE_TOKENS * images, false);
        }
      }
    }
  }
  flush();
  return out;
}

// Per-class totals; `out` is $/MTok paid once on authored blocks.
export function attributionUsd(entries, { r, w, out }) {
  const res = {};
  for (const e of entries) {
    const a = res[e.cls] || (res[e.cls] = { n: 0, tokens: 0, lifeUsd: 0, authUsd: 0 });
    a.n++;
    a.tokens += e.sizeTokens;
    a.lifeUsd += lifetimeUsd(e.sizeTokens, e.liveCalls, r, w);
    a.authUsd += e.authored ? (e.sizeTokens * out) / 1e6 : 0;
  }
  return res;
}

const GROUPS = {
  'result:Read:src': 'file', 'result:Read:horde': 'file', 'use:Write:slices': 'file', 'use:Write:horde': 'file',
  'use:Write:src': 'file', 'use:Edit': 'file', 'use:Agent': 'file', 'result:Agent': 'file',
  'use:Bash': 'exec', 'result:Bash': 'exec', 'result:Grep': 'search', 'result:Glob': 'search',
  thinking: 'reasoning', assistant_text: 'reasoning', user_text: 'user', 'use:other': 'other', 'result:other': 'other',
};
const GROUP_ROWS = ['file', 'exec', 'search', 'reasoning', 'user', 'other'];
export function groupOf(cls) {
  return Object.hasOwn(GROUPS, cls) ? GROUPS[cls] : 'other';
}

export function x0Verdict(share) {
  if (!Number.isFinite(share) || share < 0.2) return 'KILL';
  return share >= 0.4 ? 'PASS' : 'MIDDLE';
}

export function lifetimeUsd(sizeTokens, liveCalls, r, w) {
  return liveCalls >= 1 ? (sizeTokens * (w + (liveCalls - 1) * r)) / 1e6 : 0;
}

export function sizeBucket(t) {
  return t < 1000 ? '<1k' : t < 5000 ? '1k-5k' : t < 20000 ? '5k-20k' : '>=20k';
}

const TOOL_ROWS = ['Read', 'Bash', 'Grep', 'Glob', 'Agent', 'other'];
const BUCKET_ROWS = ['<1k', '1k-5k', '5k-20k', '>=20k'];
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

function analyse(calls, price, lifetimes = [], attribution = []) {
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
  const idle = idleIndices(calls);
  s.idle_gaps = idle.length;
  const baseIdle = simulate(calls, { segment: Infinity, handoff: 0, r: s.r_eff, w: s.w_eff, rewrites: idle });
  s.baseIdle = baseIdle;
  const actual = s.usd_read + s.usd_write + s.usd_input;
  s.actualIn = actual;
  s.model_err = actual > 0 ? baseIdle / 1e6 / actual - 1 : null;
  s.relayCost = {};
  s.comboCost = {};
  for (const H of HANDOFFS) {
    const relay = simulate(calls, { segment: Infinity, handoff: H, r: s.r_eff, w: s.w_eff, starts: idle });
    const bs = s['best_seg_' + H];
    const combo = simulate(calls, { segment: bs ?? Infinity, handoff: H, r: s.r_eff, w: s.w_eff, starts: idle });
    s.relayCost[H] = relay;
    s.comboCost[H] = combo;
    s['idle_saving_' + H] = baseIdle > 0 ? 1 - relay / baseIdle : 0;
    s['idle_usd_' + H] = (baseIdle - relay) / 1e6;
    s['combo_saving_' + H] = baseIdle > 0 ? 1 - combo / baseIdle : 0;
    s['combo_usd_' + H] = (baseIdle - combo) / 1e6;
  }
  s.tool_usd = 0;
  s.dead_usd = 0;
  const agg = () => ({ n: 0, dead: 0, usd: 0, deadUsd: 0 });
  s.byTool = Object.fromEntries(TOOL_ROWS.map((k) => [k, agg()]));
  s.byBucket = Object.fromEntries(BUCKET_ROWS.map((k) => [k, agg()]));
  for (const l of lifetimes) {
    const usd = lifetimeUsd(l.sizeTokens, l.liveCalls, s.r_eff, s.w_eff);
    s.tool_usd += usd;
    if (!l.referenced) s.dead_usd += usd;
    for (const a of [s.byTool[l.tool], s.byBucket[sizeBucket(l.sizeTokens)]]) {
      a.n++;
      a.usd += usd;
      if (!l.referenced) { a.dead++; a.deadUsd += usd; }
    }
  }
  s.think_tokens = 0;
  s.out_tokens = 0;
  s.think_usd = 0;
  s.think_gt_out = 0;
  for (const c of calls) {
    const th = (c.usage.output_tokens_details && c.usage.output_tokens_details.thinking_tokens) || 0;
    s.think_tokens += th;
    s.out_tokens += c.output;
    s.think_usd += (th * ratesFor(price, c.usage).output) / 1e6;
    if (th > c.output) s.think_gt_out++;
  }
  const outRate = s.out_tokens > 0 ? (s.usd_output * 1e6) / s.out_tokens : price.output;
  s.attr = attributionUsd(attribution, { r: s.r_eff, w: s.w_eff, out: outRate });
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
    const fileText = fs.readFileSync(file, 'utf8');
    const calls = loadCalls(fileText);
    if (calls.length < minCalls) { skippedShort++; continue; }
    const counts = new Map();
    for (const c of calls) counts.set(c.model, (counts.get(c.model) || 0) + 1);
    let model = null;
    let best = 0;
    for (const [m, n] of counts) if (n > best) { model = m; best = n; }
    const price = priceForModel(tiers.pricing, model);
    if (!price) { skippedUnpriced++; continue; }
    const rel = path.relative(root, file).split(path.sep).join('/').replace(/,/g, ';');
    rows.push({ file: rel, model, ...analyse(calls, price, toolLifetimes(fileText), prefixAttribution(fileText)) });
  }

  const cols = ['file', 'model', 'n', 'B', 'Pmax', 'g', 'r2', 'usd_read', 'usd_write', 'usd_input', 'usd_output',
    'usd_total', 'r_eff', 'w_eff', 'miss_count', 'miss_usd_lt5m', 'miss_usd_5to60m', 'miss_usd_gt60m', 'miss_usd_unknown'];
  for (const H of HANDOFFS) cols.push('nstar_' + H, 'best_seg_' + H, 'saving_' + H);
  cols.push('model_err', 'idle_gaps');
  for (const H of HANDOFFS) cols.push('idle_saving_' + H, 'idle_usd_' + H, 'combo_saving_' + H, 'combo_usd_' + H);
  cols.push('tool_usd', 'dead_usd', 'think_tokens', 'out_tokens', 'think_usd');
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
  L.push('', '## Balance check (E0)', '');
  const sumBase = sum(rows.map((r) => r.baseIdle));
  const sumActual = sum(rows.map((r) => r.actualIn));
  L.push(`- median model_err: ${fmt(median(rows.map((r) => r.model_err))) || 'n/a'}`);
  L.push(`- pooled model_err: ${sumActual > 0 ? (sumBase / 1e6 / sumActual - 1).toFixed(4) : 'n/a'}`);
  L.push('', '## Idle relay (gap > 60 min)', '');
  L.push(`- sessions with idle gaps: ${rows.filter((r) => r.idle_gaps >= 1).length}`);
  L.push(`- total idle gaps: ${sum(rows.map((r) => r.idle_gaps))}`);
  const ps = (k, H) => (sumBase > 0 ? (100 * sum(rows.map((r) => r.baseIdle - r[k][H])) / sumBase).toFixed(1) + '%' : 'n/a');
  for (const H of HANDOFFS) {
    L.push(`- H=${H}: idle saving ${ps('relayCost', H)}, $${sum(rows.map((r) => r['idle_usd_' + H])).toFixed(2)}; ` +
      `combo saving ${ps('comboCost', H)}, $${sum(rows.map((r) => r['combo_usd_' + H])).toFixed(2)}`);
  }
  const p1 = (x, tot) => (tot > 0 ? ((100 * x) / tot).toFixed(1) + '%' : 'n/a');
  const rw = sum(rows.map((r) => r.usd_read + r.usd_write));
  const toolUsd = sum(rows.map((r) => r.tool_usd));
  const deadUsd = sum(rows.map((r) => r.dead_usd));
  L.push('', '## Dead tool output (E2)', '');
  L.push(`- tool output cost / (read+write): ${p1(toolUsd, rw)}`);
  L.push(`- dead tool output cost / (read+write): ${p1(deadUsd, rw)}`);
  const table = (label, keys, field) => {
    L.push('', `| ${label} | results | dead | usd | dead usd | dead % of read+write |`, '| --- | --- | --- | --- | --- | --- |');
    for (const k of keys) {
      const a = rows.map((r) => r[field][k]);
      L.push(`| ${k} | ${sum(a.map((x) => x.n))} | ${sum(a.map((x) => x.dead))} | $${sum(a.map((x) => x.usd)).toFixed(2)} | ` +
        `$${sum(a.map((x) => x.deadUsd)).toFixed(2)} | ${p1(sum(a.map((x) => x.deadUsd)), rw)} |`);
    }
  };
  table('tool', TOOL_ROWS, 'byTool');
  table('size', BUCKET_ROWS, 'byBucket');
  const thinkUsd = sum(rows.map((r) => r.think_usd));
  L.push('', '## Thinking share', '');
  L.push(`- thinking tokens / output tokens: ${p1(sum(rows.map((r) => r.think_tokens)), sum(rows.map((r) => r.out_tokens)))}`);
  L.push(`- think usd / usd_output: ${p1(thinkUsd, sum(rows.map((r) => r.usd_output)))}`);
  L.push(`- think usd / usd_total: ${p1(thinkUsd, total)}`);
  L.push(`- think usd: $${thinkUsd.toFixed(2)}`);
  L.push(`- calls with thinking > output: ${sum(rows.map((r) => r.think_gt_out))}`);
  const pooled = {};
  for (const r of rows) {
    for (const [cls, a] of Object.entries(r.attr)) {
      const t = pooled[cls] || (pooled[cls] = { n: 0, tokens: 0, lifeUsd: 0, authUsd: 0 });
      t.n += a.n; t.tokens += a.tokens; t.lifeUsd += a.lifeUsd; t.authUsd += a.authUsd;
    }
  }
  const attrTotal = sum(Object.values(pooled).map((a) => a.lifeUsd + a.authUsd));
  const attrLife = sum(Object.values(pooled).map((a) => a.lifeUsd));
  const groupUsd = Object.fromEntries(GROUP_ROWS.map((g) => [g, 0]));
  for (const [cls, a] of Object.entries(pooled)) groupUsd[groupOf(cls)] += a.lifeUsd + a.authUsd;
  L.push('', '## Prefix attribution (X0)', '');
  L.push(`- coverage (attributed lifetime / (read+write)): ${p1(attrLife, rw)}`);
  L.push(`- file share: ${p1(groupUsd.file, attrTotal)} -> ${x0Verdict(attrTotal > 0 ? groupUsd.file / attrTotal : NaN)}`);
  for (const g of GROUP_ROWS) L.push(`- group ${g}: $${groupUsd[g].toFixed(4)} (${p1(groupUsd[g], attrTotal)})`);
  L.push('', '| class | blocks | tokens | lifetime usd | authoring usd | total usd | share |', '| --- | --- | --- | --- | --- | --- | --- |');
  const byTotal = Object.entries(pooled).sort((a, b) => b[1].lifeUsd + b[1].authUsd - (a[1].lifeUsd + a[1].authUsd));
  for (const [cls, a] of byTotal) {
    L.push(`| ${cls} | ${a.n} | ${a.tokens} | $${a.lifeUsd.toFixed(4)} | $${a.authUsd.toFixed(4)} | ` +
      `$${(a.lifeUsd + a.authUsd).toFixed(4)} | ${p1(a.lifeUsd + a.authUsd, attrTotal)} |`);
  }
  fs.writeFileSync(path.join(out, 'summary.md'), L.slice(0, 120).join('\n') + '\n');
  process.stdout.write(path.join(out, 'summary.md') + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
