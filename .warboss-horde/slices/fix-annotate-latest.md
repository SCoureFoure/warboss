# fix-annotate-latest

First read `.warboss-horde/slices/_fix-protocol.md` and follow it exactly.

Forks: an ambiguous `latest` refuses instead of guessing = `intent` (fail-closed convention).

- files: `plugins/warboss-horde/scripts/ledger.mjs`, `plugins/warboss-horde/test/ledger-annotate.test.mjs` (new file)
- context: `.warboss-horde/out/review-plugin.md` finding F2.

## Defect

`latestUnjudgedAgentId` in `ledger.mjs` (near line 163-190) picks the candidate row with the greatest `ts` using
`>=`. Subagents dispatched in parallel can be metered in one hook run and share an identical `ts`, so `latest`
silently picks whichever line comes last and the verdict can land on the wrong dispatch.

## Behavior

Change only `latestUnjudgedAgentId`:

1. Candidate filtering is unchanged (has `agent_id`, not `warboss-orchestrator`, agent_type does not contain
   `runner`, not already judged).
2. Find the greatest `ts` string among candidates (same string comparison as today).
3. Collect the DISTINCT `agent_id` values among candidates whose `ts` equals that greatest value.
4. Exactly one distinct id → return it (several rows with the same `agent_id`, for example one per model, are not a
   tie).
5. More than one distinct id → call the existing `die(...)` with a message that contains the word `ambiguous`,
   every tied `agent_id`, and the hint `annotate <agent_id>`. `die` exits 1; no verdict is written.
6. No candidates → the existing `die` message, unchanged.

## Cases (new file `plugins/warboss-horde/test/ledger-annotate.test.mjs`)

Follow the structure of `plugins/warboss-horde/test/ledger-summary.test.mjs` for spawning `ledger.mjs` and pointing
it at a temp ledger (read how that file sets the ledger and verdicts paths, and use the same mechanism). Every row
below also has `"model":"haiku","tokens":10,"source":"hook"`. Payload for every annotate call:
`{"verdict":"green","round":1}`.

1. Tie refuses: rows `{agent_id:"a1", agent_type:"warboss-horde:doer", ts:"2026-01-01T00:00:00.000Z"}` and
   `{agent_id:"a2", agent_type:"warboss-horde:doer", ts:"2026-01-01T00:00:00.000Z"}`. `annotate latest` exits 1;
   stderr contains `ambiguous`, `a1`, and `a2`; the verdicts file does not exist or is empty.
2. Distinct times pick the later: same two rows but `a2` has `ts:"2026-01-01T00:00:01.000Z"`. Exit 0; the verdicts
   file has one line with `agent_id` `a2`.
3. Later row first in the file still wins: write the `a2` (later `ts`) row BEFORE the `a1` row. Verdict lands on `a2`.
4. Same agent, two models, same `ts` is not a tie: two rows both `agent_id:"a1"`, one `"model":"haiku"` and one
   `"model":"sonnet"`, identical `ts`. Exit 0; verdict lands on `a1`.
5. Runner rows do not create a tie: rows `a1` (doer) and `r1` (`agent_type:"warboss-horde:runner"`) with identical
   `ts`. Exit 0; verdict lands on `a1`.
6. Judged rows do not create a tie: the two rows from case 1; first run `annotate a2 '<payload>'` (explicit id), then
   `annotate latest`. Second call exits 0 and its verdict lands on `a1`.
7. Explicit id still works during a tie: the two rows from case 1; `annotate a1 '<payload>'` exits 0.
