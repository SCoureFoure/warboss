// Acceptance guard for per-message pricing: exact model-id matching (longest key,
// version boundary), the 5m/1h cache-write split, the Haiku 5.5 long-prompt rate,
// and both meters pricing each message rather than an aggregate.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { priceForModel, messageUsd } from '../scripts/pricing.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const tiers = JSON.parse(fs.readFileSync(path.resolve(here, '..', 'tiers.json'), 'utf8'));
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

const rates = (n) => ({ input: n, output: n, cache_read: n, cache_write: n, cache_write_1h: n });
const fx = { $comment: 'x', 'opus-5': rates(1), 'opus-5-5': rates(2), 'bad': 7 };

test('longest matching key wins', () => {
  assert.equal(priceForModel(fx, 'claude-opus-5-5'), fx['opus-5-5']);
  assert.equal(priceForModel(fx, 'claude-opus-5'), fx['opus-5']);
});

test('key must end at a version boundary: end, [, @, or -YYYYMMDD', () => {
  assert.equal(priceForModel(fx, 'claude-opus-5-20260101'), fx['opus-5']);
  assert.equal(priceForModel(fx, 'claude-opus-5-5[1m]'), fx['opus-5-5']);
  assert.equal(priceForModel(fx, 'claude-opus-5-5@20260901'), fx['opus-5-5']);
  // a plain substring match would price an unknown version as opus-5: must be null
  assert.equal(priceForModel(fx, 'claude-opus-5-1'), null);
  assert.equal(priceForModel(fx, 'claude-opus-5-123'), null);
});

test('matching is case-insensitive; $-keys, non-objects and empty ids give null', () => {
  assert.equal(priceForModel(fx, 'CLAUDE-OPUS-5-5'), fx['opus-5-5']);
  assert.equal(priceForModel(fx, 'claude-bad'), null);
  assert.equal(priceForModel(fx, '$comment'), null);
  assert.equal(priceForModel(fx, ''), null);
  assert.equal(priceForModel(fx, null), null);
});

const P = { input: 4, output: 20, cache_read: 0.2, cache_write: 5, cache_write_1h: 8 };

test('5m and 1h cache writes are priced separately', () => {
  const u = {
    input_tokens: 1e6, output_tokens: 1e6, cache_read_input_tokens: 1e6,
    cache_creation_input_tokens: 3e6,
    cache_creation: { ephemeral_5m_input_tokens: 2e6, ephemeral_1h_input_tokens: 1e6 },
  };
  close(messageUsd(P, u), 4 + 20 + 0.2 + 2 * 5 + 1 * 8);
});

test('no cache_creation breakdown means all writes are 5m', () => {
  close(messageUsd(P, { cache_creation_input_tokens: 1e6 }), 5);
});

test('missing fields count as zero; null price or a missing rate gives null', () => {
  close(messageUsd(P, {}), 0);
  assert.equal(messageUsd(null, { input_tokens: 5 }), null);
  const { cache_write_1h, ...noOneHour } = P;
  assert.equal(messageUsd(noOneHour, { input_tokens: 5 }), null);
});

test('above.prompt_tokens switches rates only when the prompt is strictly larger', () => {
  const H = { ...rates(1), above: { prompt_tokens: 100, ...rates(10) } };
  // prompt = input + cache_read + cache_creation = 100 -> base rates
  close(messageUsd(H, { input_tokens: 40, cache_read_input_tokens: 40, cache_creation_input_tokens: 20, output_tokens: 1e6 }), (100 + 1e6) / 1e6);
  // prompt = 101 -> above rates, output included
  close(messageUsd(H, { input_tokens: 41, cache_read_input_tokens: 40, cache_creation_input_tokens: 20, output_tokens: 1e6 }), 10 * (101 + 1e6) / 1e6);
});

test('tiers.json carries the 2026-10 price sheet for every model id seen in use', () => {
  const pr = tiers.pricing;
  const want = {
    'claude-fable-5-1': [10, 50, 0.25, 12.5, 20],
    'claude-fable-5': [10, 50, 1, 12.5, 20],
    'claude-opus-5-5': [4, 20, 0.2, 5, 8],
    'claude-opus-5': [5, 25, 0.5, 6.25, 10],
    'claude-opus-4-8': [5, 25, 0.5, 6.25, 10],
    'claude-opus-4-5-20251101': [5, 25, 0.5, 6.25, 10],
    'claude-opus-4-1-20250805': [15, 75, 1.5, 18.75, 30],
    'claude-sonnet-5-5': [2, 10, 0.1, 2.5, 4],
    'claude-sonnet-5': [2, 10, 0.2, 2.5, 4],
    'claude-sonnet-4-6': [3, 15, 0.3, 3.75, 6],
    'claude-haiku-5-5': [0.1, 0.5, 0.01, 0.125, 0.2],
    'claude-haiku-4-5-20251001': [1, 5, 0.1, 1.25, 2],
  };
  for (const [id, [i, o, r, w, w1]] of Object.entries(want)) {
    const p = priceForModel(pr, id);
    assert.ok(p, `no price for ${id}`);
    assert.deepEqual([p.input, p.output, p.cache_read, p.cache_write, p.cache_write_1h], [i, o, r, w, w1], id);
  }
  const h = priceForModel(pr, 'claude-haiku-5-5').above;
  assert.deepEqual([h.prompt_tokens, h.input, h.output, h.cache_read, h.cache_write, h.cache_write_1h], [100000, 0.5, 2.5, 0.05, 0.625, 1]);
});

function runMeter(script, transcriptName, payloadExtra, lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warboss-pricing-'));
  const transcript = path.join(dir, transcriptName);
  fs.writeFileSync(transcript, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const ledger = path.join(dir, 'ledger.jsonl');
  const res = spawnSync(process.execPath, [path.resolve(here, '..', 'scripts', script)], {
    input: JSON.stringify({ transcript_path: transcript, cwd: dir, ...payloadExtra }),
    env: { ...process.env, WARBOSS_LEDGER: ledger },
    encoding: 'utf8',
  });
  assert.equal(res.status, 0, res.stderr);
  return fs.readFileSync(ledger, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
}

const msg = (id, usage) => ({ message: { id, role: 'assistant', model: 'claude-haiku-5-5', usage } });
// small prompt (50k) at base rates, large prompt (150k, 1h writes) at above rates
const small = { input_tokens: 50000, output_tokens: 1000 };
const large = {
  input_tokens: 0, output_tokens: 1000, cache_read_input_tokens: 100000, cache_creation_input_tokens: 50000,
  cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 50000 },
};
const expectUsd = Number((
  (50000 * 0.1 + 1000 * 0.5) / 1e6 +
  (1000 * 2.5 + 100000 * 0.05 + 50000 * 1.0) / 1e6
).toFixed(6));

for (const [script, name, extra] of [
  ['meter-orchestrator.mjs', 'sess-p.jsonl', { session_id: 'sess-p' }],
  ['meter-subagent.mjs', 'agent-p.jsonl', { session_id: 'parent-x', agent_type: 'doer', agent_id: 'p' }],
]) {
  test(`${script} prices each message and records 1h writes`, () => {
    const rows = runMeter(script, name, extra, [msg('m1', small), msg('m2', large)]);
    const r = rows.at(-1);
    assert.equal(r.model, 'claude-haiku-5-5');
    assert.equal(r.est_usd, expectUsd);
    assert.equal(r.cache_creation, 50000);
    assert.equal(r.cache_creation_1h, 50000);
  });
}
