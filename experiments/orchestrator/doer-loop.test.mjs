// Offline tests for the X6 doer loop. A stub doer stands in for `claude -p`; a scratch git repo stands in for the
// worktree. Run: node --test experiments/orchestrator/doer-loop.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LOOP = path.join(path.dirname(fileURLToPath(import.meta.url)), 'doer-loop.mjs');

// Stub doer. Modes: ok | bad-then-ok | always-bad | same-bad | fork | crash. Reads the prompt on stdin; keeps its try
// counter outside the repo so the counter itself never shows in the diff.
const STUB = `
import fs from 'node:fs';
const [mode, state] = process.argv.slice(2);
const prompt = fs.readFileSync(0, 'utf8');
const n = (fs.existsSync(state) ? Number(fs.readFileSync(state, 'utf8')) : 0) + 1;
fs.writeFileSync(state, String(n));
fs.appendFileSync(state + '.prompts', prompt + '\\n=====\\n');
if (mode === 'crash') { console.error('boom'); process.exit(1); }
const write = (s) => fs.writeFileSync('ok.txt', s);
if (mode === 'ok') write('ok');
if (mode === 'bad-then-ok') write(n === 1 ? 'bad' : (prompt.includes('MARKER-FAIL') ? 'ok' : 'no-feedback'));
if (mode === 'always-bad') write('bad' + n);
if (mode === 'same-bad') write('bad');
if (mode === 'fork') fs.writeFileSync('impl.js', '// UNDECIDED: order of errors\\n');
console.log(JSON.stringify({ session_id: 's' + n, total_cost_usd: 0.001, is_error: false, result: 'report ' + n }));
`;
const VERIFY = `
import fs from 'node:fs';
const v = fs.existsSync('ok.txt') ? fs.readFileSync('ok.txt', 'utf8') : '';
if (v === 'ok') { console.log('# pass 1'); process.exit(0); }
console.log('MARKER-FAIL got ' + JSON.stringify(v)); process.exit(1);
`;

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doer-loop-'));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  fs.writeFileSync(path.join(root, 'stub.mjs'), STUB);
  fs.writeFileSync(path.join(root, 'verify.mjs'), VERIFY);
  const g = (...a) => spawnSync('git', a, { cwd: repo, encoding: 'utf8' });
  g('init', '-q'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
  fs.writeFileSync(path.join(repo, 'README'), 'base\n');
  fs.writeFileSync(path.join(repo, 'slice.md'), '# slice\nmake ok.txt contain ok\n');
  g('add', '-A'); g('commit', '-q', '-m', 'base');
  return { root, repo };
}

function loop(env, mode, extra = []) {
  const stub = `node "${path.join(env.root, 'stub.mjs')}" ${mode} "${path.join(env.root, 'count')}"`;
  // The loop reads the first occurrence of a flag, so overrides in `extra` go before the defaults.
  const args = [LOOP, ...extra, '--slice', 'slice.md', '--verify', `node "${path.join(env.root, 'verify.mjs')}"`, '--tries', '2', '--doer-cmd', stub];
  const r = spawnSync(process.execPath, args, { cwd: env.repo, encoding: 'utf8' });
  const logf = path.join(env.repo, '.warboss-horde', 'doer-loop.jsonl');
  const rows = fs.existsSync(logf) ? fs.readFileSync(logf, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
  return { code: r.status, out: r.stdout, rows };
}

test('green on the first try exits 0 and logs one green row', () => {
  const r = loop(setup(), 'ok');
  assert.equal(r.code, 0);
  assert.match(r.out, /green on try 1\/2/);
  assert.deepEqual(r.rows.map((x) => x.outcome), ['green']);
  assert.equal(r.rows[0].session, 's1');
});

test('a red try feeds the verify output back and the next try goes green', () => {
  const env = setup();
  const r = loop(env, 'bad-then-ok');
  assert.equal(r.code, 0);
  assert.match(r.out, /green on try 2\/2/);
  assert.deepEqual(r.rows.map((x) => x.outcome), ['red', 'green']);
  const prompts = fs.readFileSync(path.join(env.root, 'count.prompts'), 'utf8').split('=====');
  assert.doesNotMatch(prompts[0], /MARKER-FAIL/);
  assert.match(prompts[1], /MARKER-FAIL/);
});

test('the first prompt carries the doer doctrine and the slice contract', () => {
  const env = setup();
  loop(env, 'ok');
  const p = fs.readFileSync(path.join(env.root, 'count.prompts'), 'utf8');
  assert.match(p, /You are a DOER/);
  assert.match(p, /make ok\.txt contain ok/);
  assert.doesNotMatch(p, /^name: doer/m);
});

test('exhausting the tries exits 1 with the failing tail', () => {
  const r = loop(setup(), 'always-bad');
  assert.equal(r.code, 1);
  assert.match(r.out, /red after 2\/2 tries/);
  assert.match(r.out, /MARKER-FAIL got "bad2"/);
  assert.deepEqual(r.rows.map((x) => x.outcome), ['red', 'red']);
});

test('a try that changes nothing since the last one stops as a stall', () => {
  const r = loop(setup(), 'same-bad', ['--tries', '3']);
  assert.equal(r.code, 1);
  assert.match(r.out, /stalled on try 2\/3/);
  assert.deepEqual(r.rows.map((x) => x.outcome), ['red', 'stall']);
});

test('an UNDECIDED gap in the diff exits 2 without running verify', () => {
  const env = setup();
  const r = loop(env, 'fork');
  assert.equal(r.code, 2);
  assert.match(r.out, /UNDECIDED: order of errors/);
  assert.deepEqual(r.rows.map((x) => x.outcome), ['fork']);
  assert.equal(fs.existsSync(path.join(env.repo, '.warboss-horde', 'doer-loop', 'slice-try1.txt')), false);
});

test('a doer crash exits 3', () => {
  const r = loop(setup(), 'crash');
  assert.equal(r.code, 3);
  assert.deepEqual(r.rows.map((x) => x.outcome), ['crash']);
});

test('a missing --verify is a usage error, exit 3', () => {
  const env = setup();
  const r = spawnSync(process.execPath, [LOOP, '--slice', 'slice.md'], { cwd: env.repo, encoding: 'utf8' });
  assert.equal(r.status, 3);
  assert.match(r.stdout, /usage error/);
});
