// Regression guard for the SubagentStop meter: an unchanged re-fire is a no-op,
// but a subagent that grew since it was last logged is re-metered (an
// unrecorded dispatch is a hole in the metric).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const meter = path.resolve(here, '..', 'scripts', 'meter-subagent.mjs');
const ledgerScript = path.resolve(here, '..', 'scripts', 'ledger.mjs');

const assistant = (id, input, output) =>
  JSON.stringify({
    message: {
      id,
      role: 'assistant',
      model: 'claude-haiku-test',
      usage: { input_tokens: input, output_tokens: output },
    },
  }) + '\n';

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warboss-meter-'));
  return {
    dir,
    transcript: path.join(dir, 'agent-abc.jsonl'),
    ledger: path.join(dir, 'ledger.jsonl'),
  };
}

function fire(fx, input) {
  const payload = input === undefined
    ? JSON.stringify({ transcript_path: fx.transcript, session_id: 'sess-not-the-file', cwd: fx.dir })
    : input;
  const res = spawnSync(process.execPath, [meter], {
    input: payload,
    encoding: 'utf8',
    env: { ...process.env, WARBOSS_LEDGER: fx.ledger, WARBOSS_METER_DOER_ONLY: '' },
  });
  assert.equal(res.status, 0, 'the meter must never break a turn');
  return res;
}

const rows = (fx) =>
  fs.readFileSync(fx.ledger, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));

test('first fire logs one row with the summed tokens', () => {
  const fx = fixture();
  fs.writeFileSync(fx.transcript, assistant('m1', 100, 10));
  fire(fx);
  const r = rows(fx);
  assert.equal(r.length, 1);
  assert.equal(r[0].tokens, 110);
});

test('unchanged re-fire is idempotent', () => {
  const fx = fixture();
  fs.writeFileSync(fx.transcript, assistant('m1', 100, 10));
  fire(fx);
  fire(fx);
  assert.equal(rows(fx).length, 1);
});

test('growth is re-metered: a corrected row is appended for the same agent_id', () => {
  const fx = fixture();
  fs.writeFileSync(fx.transcript, assistant('m1', 100, 10));
  fire(fx);
  fs.appendFileSync(fx.transcript, assistant('m2', 200, 20));
  fire(fx);
  const r = rows(fx);
  assert.equal(r.length, 2);
  assert.equal(r[0].agent_id, r[1].agent_id);
  assert.equal(r[1].tokens, 330);
});

test('re-fire after growth, unchanged, appends nothing', () => {
  const fx = fixture();
  fs.writeFileSync(fx.transcript, assistant('m1', 100, 10));
  fire(fx);
  fs.appendFileSync(fx.transcript, assistant('m2', 200, 20));
  fire(fx);
  fire(fx);
  assert.equal(rows(fx).length, 2);
});

test('summary counts the grown dispatch once (330 tokens, not 440)', () => {
  const fx = fixture();
  fs.writeFileSync(fx.transcript, assistant('m1', 100, 10));
  fire(fx);
  fs.appendFileSync(fx.transcript, assistant('m2', 200, 20));
  fire(fx);
  fire(fx);
  const res = spawnSync(process.execPath, [ledgerScript, 'summary'], {
    encoding: 'utf8',
    env: { ...process.env, WARBOSS_LEDGER: fx.ledger },
  });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /\b330\b/);
  assert.doesNotMatch(res.stdout, /\b440\b/);
});

test('empty or missing stdin payload: exit 0 and no ledger file created', () => {
  const fx = fixture();
  fire(fx, '');
  assert.equal(fs.existsSync(fx.ledger), false);
  const res = spawnSync(process.execPath, [meter], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WARBOSS_LEDGER: fx.ledger },
  });
  assert.equal(res.status, 0);
  assert.equal(fs.existsSync(fx.ledger), false);
});
