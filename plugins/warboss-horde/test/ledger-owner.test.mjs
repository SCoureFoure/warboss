// Acceptance guard for ledger ownership: the session's root (starting cwd, or its fallbacks) is resolved
// upward to the nearest directory that owns a `.warboss-horde/` directory, so a session started in a
// subdirectory still writes to its project's ledger.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ledgerFileFor, ownerDir } from '../scripts/ledger-path.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ledgerIn = (dir) => path.resolve(dir, '.warboss-horde', 'ledger.jsonl');

function tree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'warboss-own-'));
  const proj = path.join(root, 'proj');
  const deep = path.join(proj, 'a', 'b');
  fs.mkdirSync(deep, { recursive: true });
  fs.mkdirSync(path.join(proj, '.warboss-horde'));
  fs.mkdirSync(path.join(proj, '.git'));
  const projects = path.join(root, 'projects');
  fs.mkdirSync(projects);
  const parent = path.join(projects, 'sess-1.jsonl');
  fs.writeFileSync(parent, JSON.stringify({ cwd: deep }) + '\n');
  return { root, proj, deep, parent };
}

test('ownerDir: nearest ancestor (inclusive) holding a .warboss-horde directory', () => {
  const T = tree();
  assert.equal(ownerDir(T.deep), path.resolve(T.proj));
  assert.equal(ownerDir(T.proj), path.resolve(T.proj));
});

test('ownerDir: nearest wins when several ancestors own one', () => {
  const T = tree();
  fs.mkdirSync(path.join(T.proj, 'a', '.warboss-horde'));
  assert.equal(ownerDir(T.deep), path.resolve(T.proj, 'a'));
});

test('ownerDir: a .warboss-horde FILE does not count', () => {
  const T = tree();
  fs.writeFileSync(path.join(T.proj, 'a', '.warboss-horde'), 'not a dir');
  assert.equal(ownerDir(T.deep), path.resolve(T.proj));
});

test('ownerDir: no owner anywhere returns the start unchanged', () => {
  const T = tree();
  const lone = path.join(T.root, 'lone', 'x');
  fs.mkdirSync(lone, { recursive: true });
  assert.equal(ownerDir(lone), path.resolve(lone));
});

test('ownerDir: never walks above the git repository root', () => {
  const T = tree();
  // An owner ABOVE the repo root (e.g. a stray ~/.warboss-horde) must not capture the session.
  fs.mkdirSync(path.join(T.root, '.warboss-horde'));
  const repo = path.join(T.root, 'repo2');
  const sub = path.join(repo, 'sub');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  fs.mkdirSync(sub);
  assert.equal(ownerDir(sub), path.resolve(sub));
  assert.equal(ownerDir(repo), path.resolve(repo));
});

test('ownerDir: outside any git repository there is no walk-up', () => {
  const T = tree();
  fs.mkdirSync(path.join(T.root, '.warboss-horde'));
  const loose = path.join(T.root, 'loose', 'deeper');
  fs.mkdirSync(loose, { recursive: true });
  assert.equal(ownerDir(loose), path.resolve(loose));
});

test('ownerDir: a .git FILE (worktree / submodule) also marks the repo root', () => {
  const T = tree();
  const wt = path.join(T.proj, 'a', 'wt');
  fs.mkdirSync(wt);
  fs.writeFileSync(path.join(T.proj, 'a', '.git'), 'gitdir: elsewhere');
  // repo root is proj/a (it has .git), which owns no .warboss-horde -> no owner within the repo
  assert.equal(ownerDir(wt), path.resolve(wt));
});

test('ledgerFileFor: starting cwd in a subdirectory resolves to the owning project ledger', () => {
  const T = tree();
  assert.equal(ledgerFileFor({ transcript_path: T.parent, session_id: 'sess-1', cwd: T.root }, {}), ledgerIn(T.proj));
});

test('ledgerFileFor: hook.cwd fallback is resolved upward too', () => {
  const T = tree();
  assert.equal(ledgerFileFor({ cwd: T.deep }, {}), ledgerIn(T.proj));
});

test('ledgerFileFor: WARBOSS_LEDGER still overrides', () => {
  const T = tree();
  assert.equal(ledgerFileFor({ cwd: T.deep }, { WARBOSS_LEDGER: 'x/l.jsonl' }), path.resolve('x/l.jsonl'));
});

test('ledger.mjs CLI run from a subdirectory writes the owning project ledger', () => {
  const T = tree();
  const env = { ...process.env };
  delete env.WARBOSS_LEDGER;
  delete env.WARBOSS_VERDICTS;
  const r = spawnSync(process.execPath, [path.resolve(here, '..', 'scripts', 'ledger.mjs'), 'add', '{"model":"haiku","tokens":10}'], {
    cwd: T.deep, env, encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(ledgerIn(T.proj)), 'ledger not written in owning project');
  assert.ok(!fs.existsSync(path.join(T.deep, '.warboss-horde')), 'ledger leaked into the subdirectory');
});
