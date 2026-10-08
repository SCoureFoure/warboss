# test-meter-orchestrator

First read `.warboss-horde/slices/_fix-protocol.md` and follow it exactly. This slice adds tests only.

Forks: none. Every case states behavior the script's own header comment and code already document = `intent`.

- files: `plugins/warboss-horde/test/meter-orchestrator.test.mjs` (new file) — the ONLY file you may write.
- Read (do not edit): `plugins/warboss-horde/scripts/meter-orchestrator.mjs`, `plugins/warboss-horde/tiers.json`,
  `plugins/warboss-horde/test/meter-subagent.test.mjs` (copy its spawn / temp-dir / stdin helper style).
- If a case below contradicts what the script does, STILL write the test exactly as stated and list that case in
  your reply. Do not bend a case to match the code.

## Harness

Spawn `node <script>` with `spawnSync`, hook payload JSON on stdin. Unless a case says otherwise: set
`WARBOSS_LEDGER` to `<tmp>/ledger.jsonl`; build the environment from `process.env` with `WARBOSS_LEDGER` overridden.
The transcript is a JSONL file named `<session_id>.jsonl` in a fresh temp directory, with payload
`{ transcript_path, session_id, cwd: <tmp> }`. An assistant line has the shape
`{"uuid":"u1","message":{"id":"m1","role":"assistant","model":"<model>","usage":{"input_tokens":100,"output_tokens":10}}}`.

Every case also asserts exit status `0`.

## Cases

1. One message, model `claude-haiku-4-5`, input 100, output 10. Ledger has exactly 1 line with:
   `agent_type === "warboss-orchestrator"`, `agent_id === "orchestrator-<session_id>"`, `session_id` equal to the
   payload's, `source === "hook"`, `model === "claude-haiku-4-5"`, `tier === "LOW"`, `tokens === 110`,
   `input === 100`, `output === 10`, `cache_read === 0`, `cache_creation === 0`.
2. Price comes from `tiers.json`: for case 1's row, `est_usd` equals
   `Number(((100 / 1e6) * p.input + (10 / 1e6) * p.output).toFixed(6))` where `p` is `pricing.haiku` read from
   `plugins/warboss-horde/tiers.json` inside the test (do not hard-code the price).
3. Cache classes: usage `{ input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 1000,
   cache_creation_input_tokens: 200 }` → row has `cache_read === 1000`, `cache_creation === 200`,
   `tokens === 1310`, and `est_usd` equal to the four-term sum using `p.cache_read` and `p.cache_write`.
4. Dedupe by message id, last line wins: two lines both `message.id: "m1"`, first with `output_tokens: 10`, second
   with `output_tokens: 25` (input 100 on both) → 1 ledger line, `tokens === 125`.
5. Distinct message ids sum: `m1` (100/10) and `m2` (200/20) → 1 ledger line, `tokens === 330`.
6. Two models: `m1` on `claude-haiku-4-5`, `m2` on `claude-sonnet-5` → 2 ledger lines, same `agent_id`, one per
   model, tiers `LOW` and `MID`.
7. Top-rung `match` list: model `claude-fable-5` → row `tier === "HIGH"`. Model `claude-opus-5-5` →
   row `tier === "HIGH"`.
8. Unknown model `gpt-x` → 1 ledger line; the row has no own `tier` key; `est_usd === null`.
9. Synthetic placeholder skipped: the transcript's only assistant line has `model: "<synthetic>"` → no ledger file
   is created.
10. Non-assistant and usage-less lines ignored: a `role: "user"` line, an assistant line with no `usage`, and one
    valid assistant line (100/10) → 1 ledger line, `tokens === 110`.
11. Malformed transcript line tolerated: a line `{"message":` between two valid lines `m1` (100/10) and `m2`
    (200/20) → `tokens === 330`.
12. Not the parent transcript: file named `other.jsonl` with payload `session_id: "sess-1"` → no ledger file.
13. Growth appends a cumulative snapshot: fire with `m1` (100/10); append `m2` (200/20) to the transcript; fire
    again. Every ledger line has the same `agent_id`; the LAST line's `tokens === 330`.
14. Summary collapses snapshots: after case 13, run `plugins/warboss-horde/scripts/ledger.mjs summary` against that
    ledger (same mechanism `meter-subagent.test.mjs` uses). Exit 0; output contains the 330 figure in the form the
    summary prints it and does not contain the 440 figure.
15. Payload not JSON: stdin `not json` → exit 0, stderr contains `hook payload not JSON`, no ledger file.
16. Empty stdin → exit 0, no ledger file.
17. Missing transcript: `transcript_path` points at a file that does not exist → exit 0, no ledger file.
18. Default ledger location: remove `WARBOSS_LEDGER` from the spawned environment (delete the key); payload
    `cwd: <tmp>` → the row is written to `<tmp>/.warboss-horde/ledger.jsonl`.
