// Acceptance guard for the ledger location: one session writes one ledger, rooted
// at the session's STARTING cwd (first `cwd` in the parent transcript), so a shell
// `cd` mid-session no longer scatters rows across directories.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ledgerFileFor } from '../scripts/ledger-path.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ledgerIn = (dir) => path.resolve(dir, '.warboss-horde', 'ledger.jsonl');

function layout(parentLines) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'warboss-lp-'));
  const start = path.join(root, 'start');
  const later = path.join(root, 'later');
  fs.mkdirSync(start);
  fs.mkdirSync(later);
  const projects = path.join(root, 'projects');
  fs.mkdirSync(path.join(projects, 'sess-1', 'subagents'), { recursive: true });
  const parent = path.join(projects, 'sess-1.jsonl');
  const sub = path.join(projects, 'sess-1', 'subagents', 'agent-1.jsonl');
  if (parentLines) fs.writeFileSync(parent, parentLines(start, later).map((l) => JSON.stringify(l)).join('\n') + '\n');
  fs.writeFileSync(sub, JSON.stringify({ cwd: later }) + '\n');
  return { root, start, later, parent, sub };
}

const startThenLater = (start, later) => [{ type: 'summary' }, { cwd: start }, { cwd: later }];

test('WARBOSS_LEDGER overrides everything', () => {
  const L = layout(startThenLater);
  const f = ledgerFileFor({ transcript_path: L.parent, session_id: 'sess-1', cwd: L.later }, { WARBOSS_LEDGER: 'x/l.jsonl' });
  assert.equal(f, path.resolve('x/l.jsonl'));
});

test('parent transcript: first cwd wins over hook.cwd', () => {
  const L = layout(startThenLater);
  assert.equal(ledgerFileFor({ transcript_path: L.parent, session_id: 'sess-1', cwd: L.later }, {}), ledgerIn(L.start));
});

test('subagent transcript: resolves the parent <dir>/<session_id>.jsonl two levels up', () => {
  const L = layout(startThenLater);
  // the subagent file's own cwd is `later`; the parent's first cwd must still win
  assert.equal(ledgerFileFor({ transcript_path: L.sub, session_id: 'sess-1', cwd: L.later }, {}), ledgerIn(L.start));
});

test('no parent transcript: falls back to hook.cwd', () => {
  const L = layout(null);
  assert.equal(ledgerFileFor({ transcript_path: L.sub, session_id: 'sess-1', cwd: L.later }, {}), ledgerIn(L.later));
});

test('no cwd within the first 64 KiB: falls back to hook.cwd', () => {
  const L = layout((start) => [{ pad: 'x'.repeat(70000) }, { cwd: start }]);
  assert.equal(ledgerFileFor({ transcript_path: L.parent, session_id: 'sess-1', cwd: L.later }, {}), ledgerIn(L.later));
});

test('no session_id, no cwd: falls back to process.cwd()', () => {
  assert.equal(ledgerFileFor({}, {}), ledgerIn(process.cwd()));
});

test('meter-orchestrator writes to the starting cwd, not the drifted hook.cwd', () => {
  const L = layout((start, later) => [
    { cwd: start },
    { cwd: later, message: { id: 'm1', role: 'assistant', model: 'claude-haiku-4-5', usage: { input_tokens: 10, output_tokens: 1 } } },
  ]);
  const env = { ...process.env };
  delete env.WARBOSS_LEDGER;
  const res = spawnSync(process.execPath, [path.resolve(here, '..', 'scripts', 'meter-orchestrator.mjs')], {
    input: JSON.stringify({ transcript_path: L.parent, session_id: 'sess-1', cwd: L.later }),
    env,
    encoding: 'utf8',
  });
  assert.equal(res.status, 0, res.stderr);
  assert.ok(fs.existsSync(ledgerIn(L.start)), 'ledger not in starting cwd');
  assert.ok(!fs.existsSync(ledgerIn(L.later)), 'ledger leaked into drifted cwd');
});
