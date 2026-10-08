# test-record-cost

First read `.warboss-horde/slices/_fix-protocol.md` and follow it exactly. This slice adds tests only.

Forks: none. Every case states behavior the file's header comment documents = `intent`.

- files: `test/record-cost.test.ts` (new file) — the ONLY file you may write.
- Read (do not edit): `src/hooks/record-cost.ts`, `src/hooks/cost-from-transcript.ts`, `test/hooks.test.ts`
  (reuse the shape of its transcript fixtures; copy them into the new file, do not import from a test file).
- If a case below contradicts what the script does, STILL write the test exactly as stated and list that case in
  your reply. Do not bend a case to match the code.

## Harness

The script is a CLI entry with no exports, so test it as a process:

```ts
spawnSync(process.execPath, ["--import", "tsx", "src/hooks/record-cost.ts", ...args],
  { input: stdinText, cwd: <repository root>, env, encoding: "utf8" });
```

Resolve the repository root from `import.meta.url` (the test file lives in `test/`). Build `env` from `process.env`
with `CLAUDE_PROJECT_DIR` set to a fresh temp directory per test, unless a case says otherwise. The ledger the
script writes is `<project dir>/runs/dev-cost-ledger.jsonl`. Write the transcript as a JSONL file in the temp
directory and pass `{ transcript_path, session_id: "s1" }` as stdin JSON.

Build the transcript from assistant records that `extractCostRows` prices — read `cost-from-transcript.ts` to get the
required fields (each record needs its own `uuid`). Call a transcript with N such records an "N-message transcript".

Every case asserts exit status `0`.

## Cases

1. 2-message transcript, args `["--kind", "claudecode.main"]` → the ledger has exactly 2 lines; each parses as JSON;
   the two `uuid` values equal the two records' uuids; each row's kind field (read `cost-from-transcript.ts` for the
   field name) equals `"claudecode.main"`; each row's session-id field equals `"s1"`.
2. Idempotent re-fire: run case 1 twice against the same project directory → the ledger still has exactly 2 lines.
3. Growth appends only the new message: run on a 2-message transcript, append a 3rd record with a new uuid to the
   transcript file, run again → the ledger has exactly 3 lines and the 3rd line's `uuid` is the new record's.
4. No `--kind` argument → rows carry the default kind that `extractCostRows` applies when `ctx.kind` is absent
   (assert the literal default value you find in `cost-from-transcript.ts`).
5. `--kind` given as the last argument with no value (`["--kind"]`) → same result as case 4.
6. BOM tolerated: stdin is `"﻿"` followed by the JSON payload → the ledger has the expected rows.
7. Garbled stdin (`not json`) → no `runs` directory is created under the project directory.
8. Empty stdin → no `runs` directory is created.
9. `transcript_path` points at a file that does not exist → no `runs` directory is created.
10. Payload without `transcript_path` → no `runs` directory is created.
11. Transcript with zero priceable records (one `user` record only) → no `runs` directory is created.
12. Hand-damaged ledger tolerated: pre-create `runs/dev-cost-ledger.jsonl` containing the line `{"uuid":` followed
    by a valid line `{"uuid":"<uuid of record 1>"}`; run on a 2-message transcript → exactly one new line is
    appended, and its `uuid` is record 2's.
13. Project directory falls back to payload `cwd`: delete `CLAUDE_PROJECT_DIR` from the spawned environment (remove
    the key — the parent process may have it set); payload includes `cwd: <tmp>` → the ledger is written at
    `<tmp>/runs/dev-cost-ledger.jsonl`.
14. `CLAUDE_PROJECT_DIR` wins over `cwd`: environment `CLAUDE_PROJECT_DIR=<tmpA>`, payload `cwd: <tmpB>` → ledger
    exists under `<tmpA>/runs/` and no `runs` directory exists under `<tmpB>`.
