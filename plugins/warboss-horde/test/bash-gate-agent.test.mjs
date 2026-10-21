// Regression guard for subagent detection by hook input fields. A runner's Bash
// call was once denied because its hook input carried the PARENT transcript path
// (2026-09-12); Claude Code's documented subagent marker is the `agent_id` common
// input field, so a non-empty string `agent_id` alone must exempt the call.
// `agent_type` alone must not: it is also set on main-agent calls under --agent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gate = path.resolve(here, '..', 'hooks', 'bash-gate.mjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warboss-gate-agent-'));
const parent = path.join(dir, 'sess-1.jsonl');

function run(extra) {
  const res = spawnSync(process.execPath, [gate], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git status' }, cwd: dir, transcript_path: parent, ...extra }),
    encoding: 'utf8',
    env: { ...process.env, WARBOSS_BASH_GATE: 'deny' },
  });
  assert.equal(res.status, 0);
  const out = res.stdout.trim();
  return out ? JSON.parse(out) : null;
}
const denied = (o) => o && o.hookSpecificOutput && o.hookSpecificOutput.permissionDecision === 'deny';

test('main agent with the parent transcript path is denied', () => {
  assert.ok(denied(run({})));
});

test('agent_id marks a subagent even when transcript_path is the parent', () => {
  assert.equal(run({ agent_id: 'a49181402de2b04f9' }), null);
  assert.equal(run({ agent_id: 'a1', agent_type: 'warboss-horde:runner' }), null);
});

test('empty or non-string agent_id, or agent_type alone, does not exempt', () => {
  assert.ok(denied(run({ agent_id: '' })));
  assert.ok(denied(run({ agent_id: 42 })));
  assert.ok(denied(run({ agent_type: 'Explore' })));
});

test('a subagents/ transcript path still exempts without agent_id', () => {
  assert.equal(run({ transcript_path: path.join(dir, 'sess-1', 'subagents', 'agent-x.jsonl') }), null);
});
