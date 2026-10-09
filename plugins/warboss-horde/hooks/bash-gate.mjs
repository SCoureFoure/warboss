#!/usr/bin/env node
// PreToolUse(Bash) gate — the ops rule, enforced instead of merely written.
//
// The delegate skill's ops rule says every mechanical command goes to the
// `runner` subagent, because a command run in the WARBOSS's context costs a
// full transcript replay while the same command in a fresh runner context costs
// a few thousand tokens. Measured on a real session, that rule was ignored:
// 84% of all orchestrator tokens burned in post-build ops phases with zero
// dispatches. A doctrine paragraph does not bind the agent that wrote it — the
// membrane has to be mechanical, like every other membrane in this plugin.
//
// So: when the gate is armed, Bash from the MAIN agent is denied with a reason
// that names the runner. Bash from a subagent is always allowed (the runner
// exists to run commands; gating it would brick the very escape hatch).
//
// Hook contract: reads the PreToolUse payload on stdin
//   { tool_name, tool_input: { command }, transcript_path, cwd, ... }
// and writes a permission decision on stdout. Always exits 0 — a metering or
// gating failure must never break the turn (same rule as the meters).
//
// Arming (opt-in, so installing the plugin never gates an unrelated repo):
//   touch .warboss-horde/gate.on     in the project root  -> armed
//   rm    .warboss-horde/gate.on                          -> disarmed
//
// Overrides:
//   WARBOSS_BASH_GATE=off    never gate, even when armed
//   WARBOSS_BASH_GATE=warn   no permission decision, return the reason as context
//   WARBOSS_BASH_GATE=deny   force-arm without the marker file
//
// Escape hatch: a command starting with WARBOSS_INLINE=1 is always allowed. Step 5
// already permits running a check inline when dispatch is impossible, provided
// you say so — this makes saying so explicit and greppable in the transcript.

import fs from 'node:fs';
import path from 'node:path';

const MARKER = path.join('.warboss-horde', 'gate.on');

// Commands that are the meter's own control plane. Routing these through a
// runner would put a subagent dispatch between judging a slice and annotating
// it, and `annotate latest` resolves against the newest un-judged row — a
// dispatch in that window changes what `latest` means.
// Exempt only when the command is `node <ledger|dashboard>.mjs ...` with no shell
// operator outside quotes, so `node ledger.mjs x && rm -rf y` is not waved through.
const CONTROL_PLANE = /^node\s+(?:"(?:[^"]*[\\/])?(?:ledger|dashboard)\.mjs"|'(?:[^']*[\\/])?(?:ledger|dashboard)\.mjs'|(?:\S*[\\/])?(?:ledger|dashboard)\.mjs)(?=\s|$)/;
const SHELL_OPERATORS = [';', '&', '|', '`', '$(', '>', '<', '\n'];
const INLINE = /^WARBOSS_INLINE=1\s/;

function isControlPlane(command) {
  const cmd = command.trim();
  if (!CONTROL_PLANE.test(cmd)) return false;
  const unquoted = cmd.replace(/'[^']*'|"[^"]*"/g, '');
  return !SHELL_OPERATORS.some((op) => unquoted.includes(op));
}

// A subagent's transcript is <...>/subagents/<file>. Split on either separator and
// check the segment immediately before the file name.
function fromSubagent(transcriptPath) {
  const parts = String(transcriptPath || '').split(/[\\/]/);
  return parts.length >= 2 && parts[parts.length - 2] === 'subagents';
}

const REASON = [
  'Blocked by the warboss ops rule: mechanical command execution belongs to the `runner` subagent, not to your context.',
  'Every call you make replays your whole transcript; the same command in a fresh runner context costs a few thousand tokens.',
  '',
  'Dispatch instead: Agent tool, subagent_type "warboss-horde:runner", giving it the exact command and an output path under .warboss-horde/out/.',
  'It returns exit code, failing names and a <=5-line tail; the full output stays in the file.',
  '',
  'If this genuinely cannot be dispatched (interactive by nature, or the runner is unavailable), re-run it with WARBOSS_INLINE=1 prefixed and note it in the ledger annotation.',
].join('\n');

// The marker is dropped at the project root, but a session's cwd may be any
// directory under it. Walk up, or arming the gate and then working one level
// down leaves it silently inert — the failure mode this gate exists to end.
function findMarker(from) {
  let dir = path.resolve(from);
  for (;;) {
    if (fs.existsSync(path.join(dir, MARKER))) return true;
    const up = path.dirname(dir);
    if (up === dir) return false;
    dir = up;
  }
}

function decide(hook) {
  const mode = String(process.env.WARBOSS_BASH_GATE || '').toLowerCase();
  if (mode === 'off') return null;

  // A subagent's transcript lives at <session>/subagents/agent-<id>.jsonl. The
  // runner is a subagent and must keep Bash; so must any doer that gains it.
  if (fromSubagent(hook.transcript_path)) return null;

  const armed = mode === 'deny' || mode === 'warn' || findMarker(hook.cwd || process.cwd());
  if (!armed) return null;

  const command = String((hook.tool_input && hook.tool_input.command) || '');
  if (!command) return null;
  if (INLINE.test(command.trimStart())) return null;
  if (isControlPlane(command)) return null;

  return mode === 'warn' ? 'warn' : 'deny';
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  try {
    const hook = JSON.parse(raw || '{}');
    if (hook.tool_name && hook.tool_name !== 'Bash') return;
    const verdict = decide(hook);
    if (!verdict) return;
    const out = verdict === 'warn'
      ? { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: `warboss ops rule (warn mode): ${REASON}` } }
      : { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: REASON } };
    process.stdout.write(JSON.stringify(out));
  } catch {
    // fail open — never break a turn over the gate
  } finally {
    process.exit(0);
  }
});
