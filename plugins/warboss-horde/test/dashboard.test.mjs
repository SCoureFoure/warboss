// Regression guard for the ledger dashboard: single-file and discovery modes,
// the dedupe/skip rules, HTML escaping of ledger text, and unparseable `ts`
// rows being dropped from the time charts instead of killing the board.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dashboard = path.resolve(here, '..', 'scripts', 'dashboard.mjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'warboss-dash-'));

const doer = (n, over = {}) => ({
  ts: `2026-01-01T00:00:0${n}.000Z`,
  source: 'hook',
  session_id: 's',
  agent_type: 'warboss-horde:doer',
  agent_id: `a${n}`,
  model: 'claude-haiku-4-5',
  tier: 'LOW',
  tokens: 110,
  input: 100,
  output: 10,
  cache_read: 0,
  cache_creation: 0,
  est_usd: 0.01,
  ...over,
});

const lines = (rs) => rs.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n') + '\n';

function writeLedger(dir, rs) {
  const d = path.join(dir, '.warboss-horde');
  fs.mkdirSync(d, { recursive: true });
  const f = path.join(d, 'ledger.jsonl');
  fs.writeFileSync(f, lines(rs));
  return f;
}

function run(...args) {
  return spawnSync(process.execPath, [dashboard, ...args], { encoding: 'utf8' });
}

test('--file with 2 doer rows prints a full html document; no verdicts file is fine', () => {
  const dir = tmp();
  const f = writeLedger(dir, [doer(1), doer(2)]);
  assert.equal(fs.existsSync(path.join(dir, '.warboss-horde', 'verdicts.jsonl')), false);
  const res = run('--file', f);
  assert.equal(res.status, 0);
  assert.ok(res.stdout.includes('<html'));
  assert.ok(res.stdout.includes('</html>'));
});

test('--out writes the file, stdout empty, stderr reports counts', () => {
  const dir = tmp();
  const f = writeLedger(dir, [doer(1), doer(2)]);
  const out = path.join(dir, 'board.html');
  const res = run('--file', f, '--out', out);
  assert.equal(res.status, 0);
  assert.equal(res.stdout, '');
  assert.ok(fs.existsSync(out));
  assert.ok(fs.readFileSync(out, 'utf8').includes('</html>'));
  assert.match(res.stderr, /\(1 project, 2 dispatches\)/);
});

test('dedupe by (agent_id, model), last line wins', () => {
  const dir = tmp();
  const f = writeLedger(dir, [doer(1, { tokens: 111111 }), doer(1, { tokens: 333333 }), doer(2)]);
  const res = run('--file', f, '--out', path.join(dir, 'b.html'));
  assert.equal(res.status, 0);
  assert.match(res.stderr, /2 dispatches/);
});

test('rows without agent_id never merge', () => {
  const dir = tmp();
  const r = doer(1);
  delete r.agent_id;
  const f = writeLedger(dir, [r, r]);
  const res = run('--file', f, '--out', path.join(dir, 'b.html'));
  assert.equal(res.status, 0);
  assert.match(res.stderr, /2 dispatches/);
});

test('malformed line is skipped', () => {
  const dir = tmp();
  const f = writeLedger(dir, [doer(1), '{"model":']);
  const res = run('--file', f, '--out', path.join(dir, 'b.html'));
  assert.equal(res.status, 0);
  assert.match(res.stderr, /1 dispatches/);
});

test('--file at a missing path exits 1', () => {
  const dir = tmp();
  const res = run('--file', path.join(dir, 'nope.jsonl'));
  assert.equal(res.status, 1);
  assert.ok(res.stderr.includes('dashboard: no ledger at'));
});

test('--root with no ledgers exits 1', () => {
  const dir = tmp();
  const res = run('--root', dir);
  assert.equal(res.status, 1);
  assert.ok(res.stderr.includes('no .warboss-horde/ledger.jsonl found under'));
});

test('discovery walks subdirs and skips node_modules and .git', () => {
  const R = tmp();
  writeLedger(R, [doer(1)]);
  writeLedger(path.join(R, 'sub', 'proj'), [doer(2)]);
  writeLedger(path.join(R, 'node_modules', 'pkg'), [doer(3)]);
  writeLedger(path.join(R, '.git', 'x'), [doer(4)]);
  const out = path.join(R, 'b.html');
  const res = run('--root', R, '--out', out);
  assert.equal(res.status, 0);
  assert.match(res.stderr, /\(2 projects, 2 dispatches\)/);
  assert.ok(fs.readFileSync(out, 'utf8').includes('sub/proj'));
});

test('a .warboss-horde dir without ledger.jsonl is not a project', () => {
  const R = tmp();
  fs.mkdirSync(path.join(R, 'a', '.warboss-horde'), { recursive: true });
  writeLedger(path.join(R, 'b'), [doer(1)]);
  const res = run('--root', R, '--out', path.join(R, 'b.html'));
  assert.equal(res.status, 0);
  assert.match(res.stderr, /\(1 project, 1 dispatches\)/);
});

test('ledger text is HTML-escaped', () => {
  const dir = tmp();
  const f = writeLedger(dir, [doer(1, {
    model: 'claude-haiku-4-5<img src=q onerror=1>',
    agent_type: 'warboss-horde:doer<b>x</b>',
  })]);
  const res = run('--file', f);
  assert.equal(res.status, 0);
  assert.ok(!res.stdout.includes('<img src=q'));
  assert.ok(!res.stdout.includes('<b>x</b>'));
});

test('verdict text is HTML-escaped', () => {
  const dir = tmp();
  const f = writeLedger(dir, [doer(1)]);
  fs.writeFileSync(path.join(dir, '.warboss-horde', 'verdicts.jsonl'), lines([
    { ts: '2026-01-01T00:00:09.000Z', agent_id: 'a1', verdict: 'green', round: 1, slice: '<i>s</i>', cause: '<u>c</u>' },
  ]));
  const res = run('--file', f);
  assert.equal(res.status, 0);
  assert.ok(!res.stdout.includes('<i>s</i>'));
  assert.ok(!res.stdout.includes('<u>c</u>'));
});

test('one unparseable ts does not kill the board', () => {
  const dir = tmp();
  const f = writeLedger(dir, [doer(1), doer(2, { ts: 'garbage' }), doer(3)]);
  const res = run('--file', f);
  assert.equal(res.status, 0);
  assert.ok(res.stdout.includes('</html>'));
  assert.ok(!res.stderr.includes('RangeError'));
});

test('every ts unparseable does not kill the board', () => {
  const dir = tmp();
  const f = writeLedger(dir, [1, 2, 3].map((n) => doer(n, { ts: 'garbage' })));
  const res = run('--file', f);
  assert.equal(res.status, 0);
  assert.ok(res.stdout.includes('</html>'));
});
