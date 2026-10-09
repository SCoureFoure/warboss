// Regression guard for the PreToolUse(Bash) ops gate.
//
// The ops rule is the plugin's one doctrine that was measured being ignored —
// 84% of orchestrator tokens burned in un-delegated ops phases. This gate makes
// it mechanical, which means it now sits in the path of every Bash call in
// every repo the plugin is installed in. Two failure directions matter and both
// are asserted here: gating too little (the rule goes back to being prose) and
// gating too much (a subagent loses Bash, or an unrelated repo is bricked).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gate = path.resolve(here, '..', 'hooks', 'bash-gate.mjs');

/** A project dir; `armed` drops the marker file that opts it into the gate. */
function project(armed) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warboss-gate-'));
  if (armed) {
    fs.mkdirSync(path.join(dir, '.warboss-horde'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.warboss-horde', 'gate.on'), '');
  }
  return dir;
}

/** Run the hook the way Claude Code does: payload on stdin, decision on stdout. */
function run(payload, env = {}) {
  const res = spawnSync(process.execPath, [gate], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, WARBOSS_BASH_GATE: '', ...env },
  });
  assert.equal(res.status, 0, 'the gate must never break a turn');
  const out = res.stdout.trim();
  return out ? JSON.parse(out) : null;
}

const bash = (cwd, command, extra = {}) => ({
  tool_name: 'Bash',
  tool_input: { command },
  cwd,
  transcript_path: path.join(cwd, 'session.jsonl'),
  ...extra,
});

const decision = (r) => (r && r.hookSpecificOutput ? r.hookSpecificOutput.permissionDecision : 'allow');

test('unarmed project: the gate is inert (installing the plugin gates nothing)', () => {
  assert.equal(decision(run(bash(project(false), 'npm test'))), 'allow');
});

test('armed project: main-agent Bash is denied and the reason names the runner', () => {
  const r = run(bash(project(true), 'npm test'));
  assert.equal(decision(r), 'deny');
  const why = r.hookSpecificOutput.permissionDecisionReason;
  assert.match(why, /runner/, 'a denial that does not say where to go instead is just an obstacle');
  assert.match(why, /WARBOSS_INLINE/, 'the escape hatch must be discoverable from the denial itself');
});

test('armed project: a subagent keeps Bash (gating the runner would brick the escape)', () => {
  const dir = project(true);
  const sub = path.join(dir, 'session', 'subagents', 'agent-abc.jsonl');
  assert.equal(decision(run(bash(dir, 'npm test', { transcript_path: sub }))), 'allow');
});

test('armed project: WARBOSS_INLINE is honoured (Step 5 allows an inline check, said out loud)', () => {
  assert.equal(decision(run(bash(project(true), 'WARBOSS_INLINE=1 npm test'))), 'allow');
});

test('armed project: the meter control plane is exempt', () => {
  // `annotate latest` resolves against the newest un-judged row, so a runner
  // dispatch between judging and annotating would change what `latest` means.
  const dir = project(true);
  for (const cmd of ['node "/p/scripts/ledger.mjs" annotate latest {}', 'node scripts/dashboard.mjs --out board.html']) {
    assert.equal(decision(run(bash(dir, cmd))), 'allow', cmd);
  }
});

test('armed project: the marker is found from a subdirectory, not just the root', () => {
  // The marker is dropped at the project root but a session's cwd is often a
  // package or subdir under it. Without the walk-up the gate is silently inert
  // exactly where it was deliberately armed.
  const dir = project(true);
  const deep = path.join(dir, 'packages', 'web');
  fs.mkdirSync(deep, { recursive: true });
  assert.equal(decision(run(bash(deep, 'npm test'))), 'deny');
});

test('WARBOSS_BASH_GATE=off disables the gate even when armed', () => {
  assert.equal(decision(run(bash(project(true), 'npm test'), { WARBOSS_BASH_GATE: 'off' })), 'allow');
});

test('WARBOSS_BASH_GATE=deny arms without a marker; warn allows but still explains', () => {
  const dir = project(false);
  assert.equal(decision(run(bash(dir, 'npm test'), { WARBOSS_BASH_GATE: 'deny' })), 'deny');
  // Warn mode emits no permission decision at all: context only.
  const warned = run(bash(dir, 'npm test'), { WARBOSS_BASH_GATE: 'warn' });
  assert.match(warned.hookSpecificOutput.additionalContext, /^warboss ops rule \(warn mode\):/);
  assert.match(warned.hookSpecificOutput.additionalContext, /runner/);
  assert.doesNotMatch(JSON.stringify(warned), /permissionDecision/);
});

test('subagent detection: only a subagents segment directly before the file name counts', () => {
  const dir = project(true);
  const main = '/home/u/.claude/projects/p/abc.jsonl';
  const denied = [
    '/home/u/.claude/projects/-work-subagents-lab/abc.jsonl',
    '/home/u/subagents/projects/p/abc.jsonl',
  ];
  const allowed = [
    '/home/u/.claude/projects/p/abc/subagents/agent-1.jsonl',
    'C:\\Users\\u\\.claude\\projects\\p\\abc\\subagents\\agent-1.jsonl',
  ];
  for (const tp of denied) {
    assert.equal(decision(run(bash(dir, 'npm test', { transcript_path: tp }))), 'deny', tp);
  }
  for (const tp of allowed) {
    assert.equal(decision(run(bash(dir, 'npm test', { transcript_path: tp }))), 'allow', tp);
  }
  assert.equal(decision(run(bash(dir, 'npm test', { transcript_path: main }))), 'deny', main);
});

test('inline escape: only a leading WARBOSS_INLINE=1 followed by whitespace', () => {
  const dir = project(true);
  const cases = [
    ['WARBOSS_INLINE=1 npm test', 'allow'],
    ['npm test # WARBOSS_INLINE', 'deny'],
    ['WARBOSS_INLINE=0 npm test', 'deny'],
    ['echo x && WARBOSS_INLINE=1 npm test', 'deny'],
  ];
  for (const [cmd, want] of cases) {
    assert.equal(decision(run(bash(dir, cmd))), want, cmd);
  }
});

test('control plane exemption: node ledger/dashboard only, with no shell operator outside quotes', () => {
  const dir = project(true);
  const cases = [
    ['npm test; echo ledger.mjs', 'deny'],
    ['cat ledger.mjs', 'deny'],
    ['node /p/scripts/ledger.mjs summary && rm -rf x', 'deny'],
    ['node /p/scripts/notledger.mjs summary', 'deny'],
    ['node "/p/scripts/ledger.mjs" annotate latest \'{"verdict":"green","slice":"a;b|c"}\'', 'allow'],
    ['node "C:/Users/u/x/scripts/dashboard.mjs" --out board.html', 'allow'],
    ['node ledger.mjs summary', 'allow'],
    ['node /p/scripts/dashboard.mjs > out.html', 'deny'],
  ];
  for (const [cmd, want] of cases) {
    assert.equal(decision(run(bash(dir, cmd))), want, cmd);
  }
});

test('non-Bash tools and malformed payloads pass through (fail open, always exit 0)', () => {
  const dir = project(true);
  assert.equal(decision(run({ tool_name: 'Read', tool_input: { file_path: 'x' }, cwd: dir })), 'allow');
  const res = spawnSync(process.execPath, [gate], { input: 'not json', encoding: 'utf8' });
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), '');
});
