# fix-meter-subagent

First read `.warboss-horde/slices/_fix-protocol.md` and follow it exactly.

Forks: re-meter when totals grow = `intent` (an unrecorded dispatch is a hole in the metric). "Append only when
totals changed" as the idempotency rule = `fiat`.

- files: `plugins/warboss-horde/scripts/meter-subagent.mjs`, `plugins/warboss-horde/scripts/dashboard.mjs`,
  `plugins/warboss-horde/test/meter-subagent.test.mjs` (new file)
- Do NOT edit `plugins/warboss-horde/scripts/ledger.mjs` — another slice owns it. Read it only.
- context: `.warboss-horde/out/review-plugin.md` finding F1.

## Defect

`meter-subagent.mjs` `main()` skips any `agent_id` already present in the ledger
(`if (already.has(agentId)) continue;`). When the hook fires while a sibling subagent is still running, that sibling
is logged with partial usage and every later fire skips it. Its final spend is never recorded.

`ledger.mjs` already dedupes rows by `(agent_id, model)` keeping the LAST line (see its comment near line 266), so
appending a corrected row is safe for `summary` and `advise`.

## Behavior

1. Replace the agent-id set with a map of the last-logged token total per `(agent_id, model)`: for each parseable
   ledger line with an `agent_id`, key `` `${agent_id}::${model}` `` → that line's `tokens` (later lines overwrite
   earlier ones). Unparseable lines are skipped, as today.
2. For each subagent transcript and each model in it, compute the row exactly as today. Append the row iff the map
   has no entry for its key OR the entry's value differs from the row's `tokens`. After appending, update the map.
3. Row shape, `ts`, tier mapping, pricing, `WARBOSS_METER_DOER_ONLY`, `WARBOSS_LEDGER`, and the never-fail
   `process.exit(0)` wrapper are unchanged.
4. `dashboard.mjs`: make sure it applies the same dedupe before aggregating — for rows with an `agent_id`, keep only
   the LAST line per `(agent_id, model)` within each ledger file; rows without an `agent_id` are all kept. If it
   already does this, change nothing there and say so in your reply. Change nothing else in `dashboard.mjs`.

## Cases (new file `plugins/warboss-horde/test/meter-subagent.test.mjs`)

Follow the structure of `plugins/warboss-horde/test/bash-gate.test.mjs`: spawn the script with `node`, write the hook
payload JSON to stdin, set `WARBOSS_LEDGER` to a file in a fresh temp directory. Build transcript fixtures as JSONL
in the shape `sumByModel` in `meter-subagent.mjs` reads (read that function first; each assistant message needs a
distinct message id, a model id containing `haiku`, and a usage object). Pass the fixture as `transcript_path` with a
`session_id` that differs from the file's base name, so the script meters that file directly.

1. First fire: transcript with 1 assistant message (input 100, output 10). Ledger has exactly 1 line; its `tokens`
   is 110.
2. Idempotent re-fire: run again with the same file unchanged. Ledger still has exactly 1 line.
3. Growth is re-metered: append a 2nd assistant message with a new message id (input 200, output 20) to the same
   transcript file and run again. Ledger has exactly 2 lines, both with the same `agent_id`; the LAST line's `tokens`
   is 330.
4. Re-fire after growth: run a 4th time, unchanged. Ledger still has exactly 2 lines.
5. Summary counts it once: after case 4, run `ledger.mjs summary` against that ledger (use whatever flag or
   environment variable `ledger.mjs` reads for the ledger path — read `ledgerPath` in it). Exit code is 0, and the
   output reports the 330-token total, not 440. Assert on the token figure in the form the summary prints it; read
   the summary code to pick a stable substring.
6. Empty or missing stdin payload: exit code 0, no ledger file created.
