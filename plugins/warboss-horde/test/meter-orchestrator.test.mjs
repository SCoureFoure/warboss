// Regression guard for the Stop-hook orchestrator meter: it meters only the PARENT
// transcript's own assistant messages, dedupes by message id (last line wins),
// skips placeholders and non-parent transcripts, and never breaks the session.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const meter = path.resolve(here, '..', 'scripts', 'meter-orchestrator.mjs');
const ledgerScript = path.resolve(here, '..', 'scripts', 'ledger.mjs');
const tiers = JSON.parse(fs.readFileSync(path.resolve(here, '..', 'tiers.json'), 'utf8'));
const p = tiers.pricing.haiku;

const asst = (id, usage, model = 'claude-haiku-4-5') =>
  JSON.stringify({
    uuid: `u-${id}`,
    message: { id, role: 'assistant', model, usage },
  }) + '\n';

const io = (input, output) => ({ input_tokens: input, output_tokens: output });

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warboss-orch-'));
  return {
    dir,
    transcript: path.join(dir, 'sess-1.jsonl'),
    ledger: path.join(dir, 'ledger.jsonl'),
  };
}

function fire(fx, payload) {
  const body = payload !== undefined
    ? payload
    : JSON.stringify({ transcript_path: fx.transcript, session_id: 'sess-1', cwd: fx.dir });
  const res = spawnSync(process.execPath, [meter], {
    input: body,
    encoding: 'utf8',
    env: { ...process.env, WARBOSS_LEDGER: fx.ledger },
  });
  assert.equal(res.status, 0, 'the meter must never break a session');
  return res;
}

const rows = (fx) =>
  fs.readFileSync(fx.ledger, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));

test('one message logs one orchestrator row with the expected fields', () => {
  const fx = fixture();
  fs.writeFileSync(fx.transcript, asst('m1', io(100, 10)));
  fire(fx);
  const r = rows(fx);
  assert.equal(r.length, 1);
  assert.equal(r[0].agent_type, 'warboss-orchestrator');
  assert.equal(r[0].agent_id, 'orchestrator-sess-1');
  assert.equal(r[0].session_id, 'sess-1');
  assert.equal(r[0].source, 'hook');
  assert.equal(r[0].model, 'claude-haiku-4-5');
  assert.equal(r[0].tier, 'LOW');
  assert.equal(r[0].tokens, 110);
  assert.equal(r[0].input, 100);
  assert.equal(r[0].output, 10);
  assert.equal(r[0].cache_read, 0);
  assert.equal(r[0].cache_creation, 0);
});

test('est_usd is priced from tiers.json pricing.haiku', () => {
  const fx = fixture();
  fs.writeFileSync(fx.transcript, asst('m1', io(100, 10)));
  fire(fx);
  const r = rows(fx);
  assert.equal(r[0].est_usd, Number(((100 / 1e6) * p.input + (10 / 1e6) * p.output).toFixed(6)));
});

test('cache read and cache creation are separate classes, priced and summed into tokens', () => {
  const fx = fixture();
  fs.writeFileSync(fx.transcript, asst('m1', {
    input_tokens: 100,
    output_tokens: 10,
    cache_read_input_tokens: 1000,
    cache_creation_input_tokens: 200,
  }));
  fire(fx);
  const r = rows(fx);
  assert.equal(r.length, 1);
  assert.equal(r[0].cache_read, 1000);
  assert.equal(r[0].cache_creation, 200);
  assert.equal(r[0].tokens, 1310);
  assert.equal(
    r[0].est_usd,
    Number((
      (100 / 1e6) * p.input +
      (10 / 1e6) * p.output +
      (1000 / 1e6) * p.cache_read +
      (200 / 1e6) * p.cache_write
    ).toFixed(6)),
  );
});

test('lines sharing a message id are deduped, last line wins', () => {
  const fx = fixture();
  fs.writeFileSync(fx.transcript, asst('m1', io(100, 10)) + asst('m1', io(100, 25)));
  fire(fx);
  const r = rows(fx);
  assert.equal(r.length, 1);
  assert.equal(r[0].tokens, 125);
});

test('distinct message ids sum', () => {
  const fx = fixture();
  fs.writeFileSync(fx.transcript, asst('m1', io(100, 10)) + asst('m2', io(200, 20)));
  fire(fx);
  const r = rows(fx);
  assert.equal(r.length, 1);
  assert.equal(r[0].tokens, 330);
});

test('two models in one transcript produce one row per model, tiered LOW and MID', () => {
  const fx = fixture();
  fs.writeFileSync(
    fx.transcript,
    asst('m1', io(100, 10), 'claude-haiku-4-5') + asst('m2', io(200, 20), 'claude-sonnet-5'),
  );
  fire(fx);
  const r = rows(fx);
  assert.equal(r.length, 2);
  assert.equal(r[0].agent_id, r[1].agent_id);
  const byModel = Object.fromEntries(r.map((row) => [row.model, row]));
  assert.equal(byModel['claude-haiku-4-5'].tier, 'LOW');
  assert.equal(byModel['claude-sonnet-5'].tier, 'MID');
});

test('top-rung match list: claude-fable-5 and claude-opus-5-5 are both tier HIGH', () => {
  const fx = fixture();
  fs.writeFileSync(fx.transcript, asst('m1', io(100, 10), 'claude-fable-5'));
  fire(fx);
  assert.equal(rows(fx)[0].tier, 'HIGH');

  const fx2 = fixture();
  fs.writeFileSync(fx2.transcript, asst('m1', io(100, 10), 'claude-opus-5-5'));
  fire(fx2);
  assert.equal(rows(fx2)[0].tier, 'HIGH');
});

test('unknown model is logged untiered with null est_usd', () => {
  const fx = fixture();
  fs.writeFileSync(fx.transcript, asst('m1', io(100, 10), 'gpt-x'));
  fire(fx);
  const r = rows(fx);
  assert.equal(r.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(r[0], 'tier'), false);
  assert.equal(r[0].est_usd, null);
});

test('synthetic placeholder model is skipped: no ledger file created', () => {
  const fx = fixture();
  fs.writeFileSync(fx.transcript, asst('m1', io(0, 0), '<synthetic>'));
  fire(fx);
  assert.equal(fs.existsSync(fx.ledger), false);
});

test('non-assistant and usage-less lines are ignored', () => {
  const fx = fixture();
  const userLine = JSON.stringify({
    uuid: 'u-user',
    message: { id: 'mu', role: 'user', model: 'claude-haiku-4-5', usage: io(999, 999) },
  }) + '\n';
  const noUsageLine = JSON.stringify({
    uuid: 'u-nousage',
    message: { id: 'mn', role: 'assistant', model: 'claude-haiku-4-5' },
  }) + '\n';
  fs.writeFileSync(fx.transcript, userLine + noUsageLine + asst('m1', io(100, 10)));
  fire(fx);
  const r = rows(fx);
  assert.equal(r.length, 1);
  assert.equal(r[0].tokens, 110);
});

test('malformed transcript line is tolerated', () => {
  const fx = fixture();
  fs.writeFileSync(fx.transcript, asst('m1', io(100, 10)) + '{"message":\n' + asst('m2', io(200, 20)));
  fire(fx);
  const r = rows(fx);
  assert.equal(r.length, 1);
  assert.equal(r[0].tokens, 330);
});

test('a transcript whose basename is not the session_id is not metered', () => {
  const fx = fixture();
  const other = path.join(fx.dir, 'other.jsonl');
  fs.writeFileSync(other, asst('m1', io(100, 10)));
  fire(fx, JSON.stringify({ transcript_path: other, session_id: 'sess-1', cwd: fx.dir }));
  assert.equal(fs.existsSync(fx.ledger), false);
});

test('growth appends a cumulative snapshot under the same agent_id', () => {
  const fx = fixture();
  fs.writeFileSync(fx.transcript, asst('m1', io(100, 10)));
  fire(fx);
  fs.appendFileSync(fx.transcript, asst('m2', io(200, 20)));
  fire(fx);
  const r = rows(fx);
  assert.equal(r.length, 2);
  for (const row of r) assert.equal(row.agent_id, r[0].agent_id);
  assert.equal(r[r.length - 1].tokens, 330);
});

test('summary collapses orchestrator snapshots to the final total (330, not 440)', () => {
  const fx = fixture();
  fs.writeFileSync(fx.transcript, asst('m1', io(100, 10)));
  fire(fx);
  fs.appendFileSync(fx.transcript, asst('m2', io(200, 20)));
  fire(fx);
  const res = spawnSync(process.execPath, [ledgerScript, 'summary'], {
    encoding: 'utf8',
    env: { ...process.env, WARBOSS_LEDGER: fx.ledger },
  });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /\b330\b/);
  assert.doesNotMatch(res.stdout, /\b440\b/);
});

test('payload that is not JSON: exit 0, warning on stderr, no ledger file', () => {
  const fx = fixture();
  const res = fire(fx, 'not json');
  assert.match(res.stderr, /hook payload not JSON/);
  assert.equal(fs.existsSync(fx.ledger), false);
});

test('empty stdin: exit 0 and no ledger file created', () => {
  const fx = fixture();
  fire(fx, '');
  assert.equal(fs.existsSync(fx.ledger), false);
});

test('missing transcript file: exit 0 and no ledger file created', () => {
  const fx = fixture();
  fire(fx, JSON.stringify({
    transcript_path: path.join(fx.dir, 'sess-1.jsonl'),
    session_id: 'sess-1',
    cwd: fx.dir,
  }));
  assert.equal(fs.existsSync(fx.ledger), false);
});

test('default ledger location: <cwd>/.warboss-horde/ledger.jsonl when WARBOSS_LEDGER is unset', () => {
  const fx = fixture();
  fs.writeFileSync(fx.transcript, asst('m1', io(100, 10)));
  const env = { ...process.env };
  delete env.WARBOSS_LEDGER;
  const res = spawnSync(process.execPath, [meter], {
    input: JSON.stringify({ transcript_path: fx.transcript, session_id: 'sess-1', cwd: fx.dir }),
    encoding: 'utf8',
    env,
  });
  assert.equal(res.status, 0, 'the meter must never break a session');
  const defaultLedger = path.join(fx.dir, '.warboss-horde', 'ledger.jsonl');
  const r = fs.readFileSync(defaultLedger, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  assert.equal(r.length, 1);
  assert.equal(r[0].tokens, 110);
});
