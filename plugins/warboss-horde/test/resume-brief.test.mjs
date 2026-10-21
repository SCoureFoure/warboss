// Acceptance guard for the resume brief: a short ground-truth digest of the repo
// (branch, log, tree, recent slices, verdicts, TODO head) for a fresh session.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.resolve(here, '..', 'scripts', 'resume-brief.mjs');
const run = (cwd) => {
  const res = spawnSync(process.execPath, [script, '--cwd', cwd], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  return res.stdout;
};
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, stdio: 'pipe' });

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warboss-brief-'));
  git(dir, 'init', '-q', '-b', 'feat/x');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'first commit');
  fs.writeFileSync(path.join(dir, 'b.txt'), 'b');
  const h = path.join(dir, '.warboss-horde');
  fs.mkdirSync(path.join(h, 'slices'), { recursive: true });
  for (const [i, n] of ['old-slice', '_protocol', 'new-slice'].entries()) {
    const f = path.join(h, 'slices', `${n}.md`);
    fs.writeFileSync(f, 'x');
    fs.utimesSync(f, new Date(1e12 + i * 1e6), new Date(1e12 + i * 1e6));
  }
  fs.writeFileSync(path.join(h, 'verdicts.jsonl'), [
    { slice: 'one', verdict: 'green', round: 1 },
    { slice: 'two', verdict: 'red', round: 1, cause: 'worker_miss' },
  ].map((v) => JSON.stringify(v)).join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'TODO.md'), Array.from({ length: 60 }, (_, i) => `todo line ${i + 1}`).join('\n'));
  return dir;
}

test('git repo: branch, log, tree, slices newest first without _files, verdicts, TODO head', () => {
  const out = run(repo());
  assert.match(out, /## Branch\nfeat\/x/);
  assert.ok(out.includes('first commit'));
  assert.match(out, /## Working tree[\s\S]*\?\? b\.txt/);
  const slices = out.split('## Recent slices')[1].split('##')[0];
  assert.ok(slices.indexOf('new-slice') < slices.indexOf('old-slice'), 'newest slice first');
  assert.ok(!slices.includes('_protocol'));
  assert.ok(out.includes('two red r1 worker_miss'));
  assert.ok(out.includes('one green r1'));
  assert.ok(out.includes('todo line 40'));
  assert.ok(!out.includes('todo line 41'));
});

test('not a git repo and no horde files: one line for the branch, other sections omitted', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warboss-brief-'));
  const out = run(dir);
  assert.ok(out.includes('## Branch\n(not a git repository)'));
  for (const s of ['## Recent slices', '## Recent verdicts', '## TODO']) assert.ok(!out.includes(s), s);
});

test('working tree is capped at 30 lines with a remainder count', () => {
  const dir = repo();
  for (let i = 0; i < 45; i++) fs.writeFileSync(path.join(dir, `f${i}.txt`), 'x');
  const tree = run(dir).split('## Working tree')[1].split('##')[0];
  const lines = tree.trim().split('\n');
  assert.equal(lines.length, 31);
  assert.match(lines[30], /^\(\+\d+ more\)$/);
});
