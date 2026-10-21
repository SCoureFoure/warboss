// Acceptance guard for the idle-relay hook: the first prompt after a long idle gap on
// a big prefix is blocked once with the rewrite cost and the relay hint; a resend,
// slash commands, short gaps and small prefixes pass straight through.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const hookScript = path.resolve(here, '..', 'hooks', 'idle-relay.mjs');
const T0 = Date.parse('2026-10-21T12:00:00Z');
const min = 60 * 1000;

const asst = (id, ts, prefix, model = 'claude-opus-5-5') => JSON.stringify({
  timestamp: new Date(ts).toISOString(),
  message: { id, role: 'assistant', model, usage: { input_tokens: 0, cache_read_input_tokens: prefix - 1000, cache_creation_input_tokens: 500, output_tokens: 500 } },
});

function setup(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warboss-idle-'));
  const transcript = path.join(dir, 'sess-i.jsonl');
  if (lines) fs.writeFileSync(transcript, lines.join('\n') + '\n');
  return { dir, transcript, state: path.join(dir, 'state') };
}

function fire(fx, { prompt = 'carry on', nowMin, env = {} } = {}) {
  const res = spawnSync(process.execPath, [hookScript], {
    input: JSON.stringify({ session_id: 'sess-i', transcript_path: fx.transcript, cwd: fx.dir, prompt, hook_event_name: 'UserPromptSubmit' }),
    env: { ...process.env, WARBOSS_IDLE_RELAY: '', WARBOSS_NOW: String(T0 + nowMin * min), WARBOSS_IDLE_STATE: fx.state, ...env },
    encoding: 'utf8',
  });
  assert.equal(res.status, 0, res.stderr);
  return res.stdout.trim() ? JSON.parse(res.stdout) : null;
}

test('long gap on a big prefix: blocks once with gap, size, cost and the relay hint', () => {
  const fx = setup([asst('m1', T0, 150000)]);
  const out = fire(fx, { nowMin: 90 });
  assert.equal(out.decision, 'block');
  for (const s of ['90 min', '150k', '$1.20', '/clear', '/warboss-horde:resume', 'again'])
    assert.ok(out.reason.includes(s), `reason lacks ${s}: ${out.reason}`);
  // resend: same idle gap, already warned -> passes
  assert.equal(fire(fx, { nowMin: 91 }), null);
});

test('a new idle gap after a newer assistant message blocks again', () => {
  const fx = setup([asst('m1', T0, 150000)]);
  assert.equal(fire(fx, { nowMin: 90 }).decision, 'block');
  fs.appendFileSync(fx.transcript, asst('m2', T0 + 95 * min, 160000) + '\n');
  assert.equal(fire(fx, { nowMin: 200 }).decision, 'block');
});

test('gap at or under the threshold, or a prefix under the token floor, passes', () => {
  assert.equal(fire(setup([asst('m1', T0, 150000)]), { nowMin: 60 }), null);
  assert.equal(fire(setup([asst('m1', T0, 99000)]), { nowMin: 90 }), null);
  // env knobs move both thresholds
  assert.equal(fire(setup([asst('m1', T0, 150000)]), { nowMin: 20, env: { WARBOSS_IDLE_MINUTES: '15' } }).decision, 'block');
  assert.equal(fire(setup([asst('m1', T0, 50000)]), { nowMin: 90, env: { WARBOSS_IDLE_MIN_TOKENS: '40000' } }).decision, 'block');
});

test('slash commands pass and leave no marker', () => {
  const fx = setup([asst('m1', T0, 150000)]);
  assert.equal(fire(fx, { prompt: '/clear', nowMin: 90 }), null);
  assert.equal(fire(fx, { prompt: '  /warboss-horde:resume', nowMin: 90 }), null);
  assert.equal(fire(fx, { nowMin: 90 }).decision, 'block');
});

test('warn mode shows a systemMessage and never blocks; off is silent', () => {
  const w = fire(setup([asst('m1', T0, 150000)]), { nowMin: 90, env: { WARBOSS_IDLE_RELAY: 'warn' } });
  assert.equal(w.decision, undefined);
  assert.ok(w.systemMessage.includes('/warboss-horde:resume'));
  assert.equal(fire(setup([asst('m1', T0, 150000)]), { nowMin: 90, env: { WARBOSS_IDLE_RELAY: 'off' } }), null);
});

test('placeholder assistant messages are skipped; an unpriced model omits the cost', () => {
  const fx = setup([asst('m1', T0, 150000, 'claude-unknown-9'), asst('z', T0 + 80 * min, 0, '<synthetic>')]);
  const out = fire(fx, { nowMin: 90 });
  assert.equal(out.decision, 'block');
  assert.ok(out.reason.includes('90 min'));
  assert.ok(!out.reason.includes('$'));
});

test('missing transcript or junk stdin: silent, exit 0', () => {
  assert.equal(fire(setup(null), { nowMin: 90 }), null);
  const res = spawnSync(process.execPath, [hookScript], { input: 'not json', encoding: 'utf8' });
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), '');
});
