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
//   WARBOSS_BASH_GATE=warn   allow, but return the reason as context
//   WARBOSS_BASH_GATE=deny   force-arm without the marker file
//
// Escape hatch: a command containing WARBOSS_INLINE is always allowed. Step 5
// already permits running a check inline when dispatch is impossible, provided
// you say so — this makes saying so explicit and greppable in the transcript.

import fs from 'node:fs';
import path from 'node:path';

const MARKER = path.join('.warboss-horde', 'gate.on');

// Commands that are the meter's own control plane. Routing these through a
// runner would put a subagent dispatch between judging a slice and annotating
// it, and `annotate latest` resolves against the newest un-judged row — a
// dispatch in that window changes what `latest` means.
const ALLOW = [/ledger\.mjs/, /dashboard\.mjs/];

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
  // Path separator differs by platform, so match the directory name itself.
  if (String(hook.transcript_path || '').includes('subagents')) return null;

  const armed = mode === 'deny' || mode === 'warn' || findMarker(hook.cwd || process.cwd());
  if (!armed) return null;

  const command = String((hook.tool_input && hook.tool_input.command) || '');
  if (!command) return null;
  if (command.includes('WARBOSS_INLINE')) return null;
  if (ALLOW.some((re) => re.test(command))) return null;

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
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: verdict === 'warn' ? 'allow' : 'deny',
        permissionDecisionReason: verdict === 'warn' ? `warboss ops rule (warn mode): ${REASON}` : REASON,
      },
    }));
  } catch {
    // fail open — never break a turn over the gate
  } finally {
    process.exit(0);
  }
});
