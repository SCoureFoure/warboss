// Acceptance guard for the offline transcript audit: call extraction, the restart
// counterfactual (E1) and cache-miss classification (E3).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadCalls, simulate, optimum, classifyMisses, fitLine, idleIndices } from '../scripts/audit.mjs';
import { ratesFor } from '../scripts/pricing.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const line = (id, usage, ts, model = 'claude-opus-5-5', role = 'assistant') =>
  JSON.stringify({ timestamp: ts, message: { id, role, model, usage } });
const u = (input, read, create, output = 1, create1h = 0) => ({
  input_tokens: input, cache_read_input_tokens: read, cache_creation_input_tokens: create, output_tokens: output,
  cache_creation: { ephemeral_5m_input_tokens: create - create1h, ephemeral_1h_input_tokens: create1h },
});

test('loadCalls: dedupes by message id (last usage wins), keeps first-seen order, skips placeholders', () => {
  const text = [
    line('a', u(1, 0, 99, 1), '2026-10-01T00:00:00Z'),
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }),
    line('b', u(1, 100, 10, 1), '2026-10-01T00:01:00Z'),
    line('a', u(1, 0, 99, 7), '2026-10-01T00:00:05Z'),
    line('z', u(0, 0, 0, 0), '2026-10-01T00:02:00Z', '<synthetic>'),
    'not json',
  ].join('\n');
  const calls = loadCalls(text);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((c) => c.id), ['a', 'b']);
  assert.equal(calls[0].output, 7);
  assert.equal(calls[0].P, 100);
  assert.equal(calls[1].P, 111);
  assert.equal(calls[0].ts, Date.parse('2026-10-01T00:00:00Z'));
  assert.equal(calls[1].create1h, 0);
});

const mk = (Ps) => Ps.map((P, i) => ({ id: String(i), ts: i * 1000, model: 'm', input: 0, output: 0, read: 0, create: 0, create1h: 0, P }));

test('simulate: baseline (segment Infinity) charges w on growth and r on the rest', () => {
  // P = 100,110,120,130; r=1, w=10 -> 1000 + 200 + 210 + 220
  close(simulate(mk([100, 110, 120, 130]), { segment: Infinity, handoff: 5, r: 1, w: 10 }), 1630);
});

test('simulate: restart every 2 calls re-seeds the prefix at B + handoff', () => {
  // segment 2: [0,1] as baseline = 1200; [2,3]: P' = 105 (full write) -> 1050, then 115 (w on 10) -> 205
  close(simulate(mk([100, 110, 120, 130]), { segment: 2, handoff: 5, r: 1, w: 10 }), 2455);
});

test('simulate: a compaction drop carries into the segment and P\' never falls below B', () => {
  // P = 100, 300, 150, 160; segment 2. [0,1]: 1000 + (100*1 + 200*10)=2100 -> 3100
  // [2,3]: P'2 = 150-150+100+0 = 100 -> 1000; P'3 = 160-150+100 = 110 -> 100 + 100 = 200. Total 4300.
  close(simulate(mk([100, 300, 150, 160]), { segment: 2, handoff: 0, r: 1, w: 10 }), 4300);
  // baseline: 1000 + 2100 + (drop: no write, read 150) 150 + (100*... P 160, growth 10) 150 + 100 = 3500
  close(simulate(mk([100, 300, 150, 160]), { segment: Infinity, handoff: 0, r: 1, w: 10 }), 3500);
});

test('simulate: rewrites force a full-prefix write without resetting the prefix', () => {
  // k2 rewrites all 120 at w: 1000 + 200 + 1200 + 220
  close(simulate(mk([100, 110, 120, 130]), { segment: Infinity, handoff: 5, r: 1, w: 10, rewrites: [2] }), 2620);
  // a rewrite on a segment start is already a full write: no change
  close(simulate(mk([100, 110, 120, 130]), { segment: 2, handoff: 5, r: 1, w: 10, rewrites: [2] }), 2455);
});

test('simulate: explicit starts re-seed like segment boundaries and merge with them', () => {
  close(simulate(mk([100, 110, 120, 130]), { segment: Infinity, handoff: 5, r: 1, w: 10, starts: [2] }), 2455);
  // starts {0,3} from segment 3, plus 2: [0,1] 1200, [2] 1050, [3] Q=105 -> 1050
  close(simulate(mk([100, 110, 120, 130]), { segment: 3, handoff: 5, r: 1, w: 10, starts: [2] }), 3300);
});

test('idleIndices: calls after a gap strictly over the threshold, both timestamps known', () => {
  const m = 60 * 1000;
  const calls = [0, 61 * m, 62 * m, null, 200 * m, 260 * m].map((ts) => ({ ts }));
  assert.deepEqual(idleIndices(calls), [1]);
  assert.deepEqual(idleIndices([{ ts: 0 }, { ts: 60 * m }]), []);
  assert.deepEqual(idleIndices(calls, 30 * m), [1, 5]);
  assert.deepEqual(idleIndices([{ ts: 0 }, { ts: 31 * m }], 30 * m), [1]);
});

test('fitLine: least-squares slope and r2 of P on call index', () => {
  const f = fitLine([100, 110, 120, 130]);
  close(f.slope, 10);
  close(f.r2, 1);
  assert.equal(fitLine([5]).slope, 0);
});

test('optimum: formula n* and the brute-force best segment', () => {
  const calls = mk(Array.from({ length: 200 }, (_, k) => 1000 + 100 * k));
  const o = optimum(calls, { handoff: 0, r: 1, w: 25 });
  // n* = sqrt(2 * 25 * 1000 / 100) = sqrt(500)
  close(o.nStar, Math.sqrt(500));
  assert.ok(o.bestSegment >= 2 && o.bestSegment <= 200);
  assert.ok(Math.abs(o.bestSegment - Math.sqrt(500)) <= 4, `best ${o.bestSegment}`);
  assert.equal(o.baseCost, simulate(calls, { segment: Infinity, handoff: 0, r: 1, w: 25 }));
  assert.equal(o.bestCost, simulate(calls, { segment: o.bestSegment, handoff: 0, r: 1, w: 25 }));
  close(o.saving, 1 - o.bestCost / o.baseCost);
  assert.ok(o.saving > 0.5);
  // no growth -> no formula optimum
  assert.equal(optimum(mk([100, 100, 100]), { handoff: 0, r: 1, w: 25 }).nStar, null);
});

test('classifyMisses: create > half the prefix after call 0 is a miss, bucketed by the gap before it', () => {
  const m = 60 * 1000;
  const calls = [
    { P: 1000, create: 1000, ts: 0 },
    { P: 1100, create: 100, ts: 1 * m },          // growth, not a miss
    { P: 1200, create: 1200, ts: 3 * m },         // miss after 2 min
    { P: 1300, create: 700, ts: 13 * m },         // miss after 10 min
    { P: 1400, create: 1400, ts: 200 * m },       // miss after 187 min
    { P: 1500, create: 750, ts: null },           // exactly half: not a miss
    { P: 1600, create: 1600, ts: null },          // miss, unknown gap
  ];
  const ms = classifyMisses(calls);
  assert.deepEqual(ms.map((x) => [x.k, x.bucket]), [[2, '<5m'], [3, '5-60m'], [4, '>60m'], [6, 'unknown']]);
  assert.equal(ms[0].gapMs, 2 * m);
  assert.equal(ms[0].create, 1200);
});

test('ratesFor: base rates, or base merged with `above` when the prompt is strictly larger', () => {
  const H = { input: 1, output: 1, cache_read: 1, cache_write: 1, cache_write_1h: 1, above: { prompt_tokens: 10, input: 9 } };
  assert.equal(ratesFor(H, { input_tokens: 10 }).input, 1);
  assert.equal(ratesFor(H, { input_tokens: 11 }).input, 9);
  assert.equal(ratesFor(H, { input_tokens: 11 }).output, 1);
  assert.equal(ratesFor(null, {}), null);
});

test('CLI: writes sessions.csv and summary.md, skipping subagent files and short sessions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'warboss-audit-'));
  const proj = path.join(root, 'C--proj');
  fs.mkdirSync(path.join(proj, 'sess-a', 'subagents'), { recursive: true });
  const t0 = Date.parse('2026-10-01T00:00:00Z');
  const long = Array.from({ length: 30 }, (_, k) =>
    line(`m${k}`, u(1, k === 0 ? 0 : 1000 + 100 * (k - 1), k === 0 ? 1000 : 100), new Date(t0 + k * 1000).toISOString()));
  fs.writeFileSync(path.join(proj, 'sess-a.jsonl'), long.join('\n') + '\n');
  fs.writeFileSync(path.join(proj, 'sess-short.jsonl'), long.slice(0, 5).join('\n') + '\n');
  fs.writeFileSync(path.join(proj, 'sess-a', 'subagents', 'agent-1.jsonl'), long.join('\n') + '\n');
  const out = path.join(root, 'out');
  const res = spawnSync(process.execPath, [path.resolve(here, '..', 'scripts', 'audit.mjs'), '--root', root, '--out', out, '--min-calls', '20'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  const csv = fs.readFileSync(path.join(out, 'sessions.csv'), 'utf8').trim().split(/\r?\n/);
  assert.equal(csv.length, 2, 'header + exactly one session row');
  const head = csv[0].split(',');
  for (const col of ['file', 'model', 'n', 'B', 'g', 'usd_read', 'usd_write', 'usd_total', 'saving_15000', 'best_seg_15000', 'nstar_15000', 'miss_usd_gt60m',
    'model_err', 'idle_gaps', 'idle_saving_5000', 'idle_usd_15000', 'combo_saving_15000', 'combo_usd_30000'])
    assert.ok(head.includes(col), `missing column ${col}`);
  const row = Object.fromEntries(head.map((h, i) => [h, csv[1].split(',')[i]]));
  assert.equal(row.n, '30');
  assert.equal(row.idle_gaps, '0');
  assert.equal(row.model, 'claude-opus-5-5');
  assert.ok(fs.readFileSync(path.join(out, 'summary.md'), 'utf8').length > 0);
});
