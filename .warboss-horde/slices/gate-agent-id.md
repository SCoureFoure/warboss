# Slice: gate-agent-id (rung LOW)

Forks: [intent] Claude Code documents `agent_id` as the common hook-input field identifying the subagent a hook
fires in; a non-empty string `agent_id` exempts the call. [intent] `agent_type` alone never exempts (it is also set
on main-agent calls under `--agent`). [intent] the existing `subagents/` path check stays as a second signal.

Root: `C:/Users/SCora/Documents/Repositories/warboss/plugins/warboss-horde/`. Edit ONLY `hooks/bash-gate.mjs`.
Acceptance test: `test/bash-gate-agent.test.mjs` (do not edit); `test/bash-gate.test.mjs` must keep passing.

## Change
1. Replace `fromSubagent(transcriptPath)` with `fromSubagent(hook)`:
   return `true` when `typeof hook.agent_id === 'string' && hook.agent_id !== ''`; otherwise return the existing
   path rule applied to `hook.transcript_path` (second-to-last path segment equals `subagents`).
2. In `decide(hook)`, call `fromSubagent(hook)` instead of `fromSubagent(hook.transcript_path)`.
3. Update the comment above that call (currently about `<session>/subagents/agent-<id>.jsonl`) to say: a subagent is
   recognised by the `agent_id` hook-input field, or by a transcript under `subagents/`; the path alone failed once
   because a runner's hook input carried the parent transcript path. Keep it to 3-4 comment lines.
4. In the file's header comment, where it lists the stdin payload fields
   (`{ tool_name, tool_input: { command }, transcript_path, cwd, ... }`), add `agent_id` to the list.
Change nothing else.
