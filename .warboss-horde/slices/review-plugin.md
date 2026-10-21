# review-plugin

First read `.warboss-horde/slices/_review-protocol.md` and follow it exactly.

- output: `.warboss-horde/out/review-plugin.md`
- scope: everything under `plugins/warboss-horde/` except `**/ledger.jsonl`; also `.claude-plugin/marketplace.json`
- context: `plugins/warboss-horde/skills/delegate/SKILL.md` states what the scripts and hooks are supposed to do.
  A script that does not do what the skill says is a finding.

## What to look for

1. **Meter correctness** (`scripts/meter-subagent.mjs`, `scripts/meter-orchestrator.mjs`): usage counted twice for one
   message id; a transcript line that fails to parse aborting the whole meter; a model id that matches two `pricing`
   keys by substring, or none; the orchestrator meter re-adding earlier turns on each `Stop` instead of the delta.
2. **Tier mapping**: a model on no rung being given a tier instead of `untiered`; the `match` list on the top rung
   not being consulted.
3. **`ledger.mjs`**: `annotate latest` picking an already-judged row or a non-doer row; `advise` emitting advice for a
   rung with fewer than 3 greens; `summary` dividing by zero on an empty ledger; a malformed ledger line crashing
   every command.
4. **`hooks/bash-gate.mjs`**: any way the main agent's Bash is allowed while armed without the `WARBOSS_INLINE=1`
   prefix; a subagent's Bash being denied; the exempt-command check matching by loose substring so an unrelated
   command that merely mentions `ledger.mjs` passes; a hook crash or unreadable input resulting in a deny that blocks
   an unrelated repo.
5. **`hooks/hooks.json`**: a hook path that does not exist, or a script the skill names that no hook wires.
6. **`dashboard.mjs`**: unescaped ledger text written into HTML; discovery that walks into `node_modules`.
7. **Skill versus code drift**: a flag, environment variable, path, or command in `SKILL.md`, `agents/*.md`, or
   `tiers.json` comments that the code does not implement, or the reverse.
8. **Test gaps**: a script in `scripts/` or `hooks/` with no test under `plugins/warboss-horde/test/`. Report as
   `test-gap`, one finding listing all such files.
9. **Stray state**: ledger files inside the plugin directory (`plugins/warboss-horde/.warboss-horde/`,
   `plugins/warboss-horde/scripts/.warboss-horde/`) — say which code path wrote there, if you can tell.
