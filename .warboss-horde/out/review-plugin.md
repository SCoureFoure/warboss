# review-plugin

## Findings

### F1 — A subagent still running at a Stop sweep is metered once, partially, and never updated
- where: `plugins/warboss-horde/scripts/meter-subagent.mjs:233`
- severity: high
- kind: bug
- evidence: "if (already.has(agentId)) continue; // idempotent: skip dispatches already logged"
- why: `hooks.json` re-runs this meter on every `Stop` to sweep async dispatches. If an async doer's transcript is mid-write at a turn end, its partial usage is appended under `agent_id`. Every later sweep and the real `SubagentStop` skip that id, so the final usage is never recorded and the do-band spend is silently low. `loadRows` already keeps the last row per (agent_id, model), so appending a newer snapshot would be safe.
- fix: Drop the skip-by-agent_id. Instead append a new row only when the summed totals differ from the last logged row for that (agent_id, model), as the orchestrator meter does with snapshots.
- check: Feed the meter a subagent transcript with 1 assistant message, then the same file with 2 messages. Assert the last ledger row for that agent_id carries the 2-message totals.

### F2 — `annotate latest` is ambiguous for parallel dispatches because `ts` is meter time, not dispatch time
- where: `plugins/warboss-horde/scripts/ledger.mjs:186` (ts stamped at `meter-subagent.mjs:221`)
- severity: high
- kind: bug
- evidence: "if (!best || String(r.ts || '') >= String(best.ts || '')) best = r;"
- why: One meter run uses a single `ts` for every transcript it processes. A Stop sweep that picks up N parallel doers gives all N rows the same `ts`. `>=` then picks the last row in file order, which follows `readdirSync` order of random agent ids. `latest` therefore resolves to an arbitrary doer, and the green/red lands on the wrong dispatch, corrupting tries-per-green.
- fix: Have `latest` refuse (die and list the candidates) when more than one un-judged doer row shares the newest `ts`. Alternatively stamp each row with the transcript's last-message timestamp.
- check: Ledger with two un-judged doer rows with identical `ts`. `annotate latest` must exit 1 listing both ids, not annotate one.

### F3 — One malformed ledger line crashes `summary` and `advise`
- where: `plugins/warboss-horde/scripts/ledger.mjs:259`
- severity: medium
- kind: bug
- evidence: ".map((l) => JSON.parse(l))"
- why: A crashed append leaves a truncated last line, which the ledger design says is tolerated ("crash-safe"). `loadRows` calls an unguarded `JSON.parse`, so `summary` and `advise` die with an uncaught SyntaxError. `latestUnjudgedAgentId`, `loadVerdicts`, `dashboard.mjs` and the meters all skip bad lines.
- fix: Wrap the parse in try/catch and drop unparseable lines, as the sibling readers do.
- check: Ledger with one valid row plus `{"model":` on the last line. `summary` must exit 0 and print 1 dispatch.

### F4 — The `WARBOSS_INLINE` escape hatch is any substring, not the documented `WARBOSS_INLINE=1` prefix
- where: `plugins/warboss-horde/hooks/bash-gate.mjs:82`
- severity: medium
- kind: fail-open
- evidence: "if (command.includes('WARBOSS_INLINE')) return null;"
- why: The deny text and SKILL say to "prefix it with `WARBOSS_INLINE=1`". The check allows any command that mentions the word anywhere, such as `npm test # WARBOSS_INLINE` or `echo WARBOSS_INLINE; rm -rf x`. Armed main-agent Bash passes without the prefix.
- fix: Test `/^\s*WARBOSS_INLINE=1\s/.test(command)`.
- check: Armed project, command `npm test # WARBOSS_INLINE` must be denied. `WARBOSS_INLINE=1 npm test` must still be allowed.

### F5 — The exempt-command check matches `ledger.mjs` / `dashboard.mjs` anywhere in the command line
- where: `plugins/warboss-horde/hooks/bash-gate.mjs:43`
- severity: medium
- kind: fail-open
- evidence: "const ALLOW = [/ledger\\.mjs/, /dashboard\\.mjs/];"
- why: `npm test; node x.mjs # ledger.mjs`, `cat ledger.mjs && npm test` and `rm -rf . ; echo dashboard.mjs` all pass while armed. The regex is unanchored and ignores `;`, `&&` and `|` chaining. Any mechanical command can be smuggled past the ops rule.
- fix: Allow only when the command, after an optional `node`, is a single invocation whose script path ends in `scripts/ledger.mjs` or `scripts/dashboard.mjs`, and contains no `;`, `&`, `|`, `` ` `` or `$(`.
- check: Armed project, `npm test; echo ledger.mjs` must be denied. The existing `node "/p/scripts/ledger.mjs" annotate latest {}` case must stay allowed.

### F6 — Any main-agent transcript path containing "subagents" is treated as a subagent and bypasses the gate
- where: `plugins/warboss-horde/hooks/bash-gate.mjs:75`
- severity: medium
- kind: fail-open
- evidence: "if (String(hook.transcript_path || '').includes('subagents')) return null;"
- why: The main transcript lives at `~/.claude/projects/<encoded-cwd>/<session>.jsonl`. A project whose path contains `subagents` (for example `C:\work\subagents-lab`) gives every main-agent Bash call a matching `transcript_path`. The gate never fires there.
- fix: Match the structural shape: `<session>/subagents/agent-*.jsonl`, for example `/[\\/]subagents[\\/]agent-[^\\/]+\.jsonl$/`.
- check: Armed project, main-agent `transcript_path` of `/home/u/.claude/projects/-work-subagents-lab/abc.jsonl` must be denied.

### F7 — `warn` mode answers `permissionDecision: "allow"`, which can bypass the user's normal permission prompt
- where: `plugins/warboss-horde/hooks/bash-gate.mjs:100`
- severity: medium
- kind: fail-open
- evidence: "permissionDecision: verdict === 'warn' ? 'allow' : 'deny',"
- why: A PreToolUse hook that returns `allow` auto-approves the tool call. Under `WARBOSS_BASH_GATE=warn` every main-agent Bash command skips the permission prompt it would otherwise have raised, in order to show an advisory. The test only asserts that `allow` is returned, so it does not show that auto-approval was intended.
- fix: In warn mode emit no `permissionDecision` and pass the reason through `additionalContext` (or stderr) instead.
- check: `warn` run's stdout must not contain `permissionDecision`.

### F8 — Stray ledgers: meters write relative to the session `cwd`, not the project root
- where: `plugins/warboss-horde/scripts/meter-orchestrator.mjs:170-172` (same pattern in `meter-subagent.mjs:223-225`)
- severity: medium
- kind: bug
- evidence: ": path.resolve(hook.cwd || process.cwd(), '.warboss-horde', 'ledger.jsonl');"
- why: `plugins/warboss-horde/scripts/.warboss-horde/ledger.jsonl` holds an `orchestrator-48cd9efe-…` row (a Stop meter row, `source: hook`). `plugins/warboss-horde/.warboss-horde/ledger.jsonl` holds orchestrator snapshots too. Both are the result of a session whose `cwd` was inside the plugin. `bash-gate.mjs` walks up to find the project root, but the meters and `ledger.mjs` (line 55, `process.cwd()`) do not. A session `cd`'d into a subdirectory forks the ledger, and `summary` and the dashboard split or double-report the same session.
- fix: Reuse the gate's walk-up: use the nearest ancestor of `cwd` that already has `.warboss-horde/`, else `cwd`. Apply it in both meters and `ledger.mjs`.
- check: Hook payload with `cwd=<root>/sub` where `<root>/.warboss-horde/` exists must append to `<root>/.warboss-horde/ledger.jsonl` and create nothing under `sub`.

### F9 — test-gap: scripts and hooks with no test under `plugins/warboss-horde/test/`
- where: `plugins/warboss-horde/scripts/meter-subagent.mjs`, `plugins/warboss-horde/scripts/meter-orchestrator.mjs`, `plugins/warboss-horde/scripts/dashboard.mjs`
- severity: medium
- kind: test-gap
- evidence: "test/ contains only: bash-gate.test.mjs, delegate-doctrine.test.mjs, ledger-summary.test.mjs"
- why: The metering scripts carry the metric (dedup by message id, parent-versus-subagent transcript redirect, synthetic-model skip, tier and price lookup) and have zero tests. `dashboard.mjs` (escaping, discovery) has none either. `ledger-summary.test.mjs` covers only `summary`: nothing for `add`, `annotate` (including `latest`), or `advise` (the 3-green threshold). `hooks.json` wiring (file existence) is untested. F1 and F2 would have been caught by such tests.
- fix: Add one test per script: meter-subagent, meter-orchestrator, dashboard, and the ledger `annotate`/`advise` subcommands.
- check: none

### F10 — The dashboard keeps `<synthetic>` placeholder rows that `ledger.mjs` drops, so the two boards disagree
- where: `plugins/warboss-horde/scripts/dashboard.mjs:99-101`
- severity: low
- kind: drift
- evidence: "const all = text.split('\\n').filter((l) => l.trim()).map((l) => {"
- why: `ledger.mjs:263` filters rows with `model.startsWith('<')` ("older meters logged Claude Code's injected zero-usage messages as phantom, price-less dispatches"). `parseLedger` in the dashboard has no such filter. On a ledger that still holds those rows, the dashboard shows extra dispatches and a "~" partial total that `summary` does not.
- fix: Add the same `startsWith('<')` filter in `parseLedger`.
- check: Ledger with one `"model":"<synthetic>"` row plus one real row. The dashboard's dispatch count must be 1.

### F11 — `advise` compares partial dollar figures with no warning on the advice line
- where: `plugins/warboss-horde/scripts/ledger.mjs:595-602`
- severity: low
- kind: bug
- evidence: "const retryCost = d1.usdPerDispatch;"
- why: A row with `est_usd: null` (no price match) adds 0 to `m.usd` and sets `usdKnown=false`. The table marks it "(partial)", but the RETRY/LIFT line uses the understated number without noting it. Retry or lift advice can then flip on a missing price.
- fix: When either tier has `usdKnown === false`, print "advice withheld (partial prices)" for that pair.
- check: Ledger with 3 greens at each of LOW and MID where all LOW rows have `est_usd:null`. The advice line must say withheld.

### F12 — `costChart` throws on an unparseable `ts`, which kills the whole dashboard
- where: `plugins/warboss-horde/scripts/dashboard.mjs:323`
- severity: low
- kind: bug
- evidence: "const d0 = new Date(t0).toISOString().slice(0, 10);"
- why: `series` accepts any truthy `r.ts`. Manual `add` spreads `...rec` after `ts` (`ledger.mjs:146-147`), so a payload `ts` can override the stamp. A garbage `ts` on a costed row gives `t0` NaN and `toISOString()` throws RangeError.
- fix: Filter `series` to rows where `Number.isFinite(Date.parse(r.ts))`.
- check: Ledger with two costed rows, one with `"ts":"garbage"`. The dashboard must exit 0.

## Open questions
- `plugins/warboss-horde/hooks/hooks.json:6` — the matcher is `"Bash"` only. On Windows the environment advertises a PowerShell tool. If the main agent can call it, the ops rule is bypassed without `WARBOSS_INLINE`. Is a PowerShell/other-shell matcher intended?
- `plugins/warboss-horde/hooks/bash-gate.mjs:75` — the gate assumes a subagent's PreToolUse payload carries the subagent's own `transcript_path`. `meter-subagent.mjs:15-19` says some clients pass the PARENT transcript instead. If so, the runner's Bash is denied while armed. Is this verified for PreToolUse on the target client?
- `plugins/warboss-horde/scripts/meter-subagent.mjs:236` — `agentType` falls back to `hook.agent_type` only when no `.meta.json` exists. If the meta file is absent in a Stop sweep, runner rows get an empty `agent_type`. `ledger.mjs` then counts them as doers (inflating LOW-share) and `annotate latest` can select them. Does the client always write `agent-<id>.meta.json`?
- `plugins/warboss-horde/tiers.json:13-16` — `pricing` is by class (`opus` 15/75, `fable` 10/50) and applied to every model id containing the key (opus-4-8, opus-5, etc.). The file says "VERIFY against current Anthropic pricing". If per-version prices differ, est_usd is wrong for newer ids. Is a per-version key needed?
- `plugins/warboss-horde/tiers.json:3-4` — the top-level `"doer": "doer"` and `"runner": "runner"` keys are not read by any script in scope. Are they documentation or dead config?

## Files read
- .warboss-horde/slices/review-plugin.md
- .warboss-horde/slices/_review-protocol.md
- .claude-plugin/marketplace.json
- plugins/warboss-horde/scripts/meter-subagent.mjs
- plugins/warboss-horde/scripts/meter-orchestrator.mjs
- plugins/warboss-horde/scripts/ledger.mjs
- plugins/warboss-horde/scripts/dashboard.mjs
- plugins/warboss-horde/hooks/bash-gate.mjs
- plugins/warboss-horde/hooks/hooks.json
- plugins/warboss-horde/tiers.json
- plugins/warboss-horde/skills/delegate/SKILL.md
- plugins/warboss-horde/agents/doer.md
- plugins/warboss-horde/agents/runner.md
- plugins/warboss-horde/.claude-plugin/plugin.json
- plugins/warboss-horde/test/bash-gate.test.mjs (lines 20-112)
- plugins/warboss-horde/test/ (grep of test names only: delegate-doctrine, ledger-summary)
- plugins/warboss-horde/scripts/.warboss-horde/ledger.jsonl (first row, stray-state check)
- plugins/warboss-horde/.warboss-horde/ledger.jsonl (first 3 rows, stray-state check)
