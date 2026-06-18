# Spec — decompose-run (live decomposition runner: intent → artifact)

> Status: active · rev 2 · Feature: decompose-run · Added: 2026-06-11 · Rev 2: 2026-06-13 · Maps to: PLAN Phase 4 integration ("first live decomposition", Leader-funded 2026-06-11)
> The thin CLI shell around `decompose` + `admit`: takes Leader's intent, drives
> the warboss pipeline once, and persists everything a human needs to judge
> the output. Orchestration only — ALL pipeline semantics live in
> `specs/warboss-decomposition.spec.md` (rev 4) and are not restated here.
> Depends on: `specs/warboss-decomposition.spec.md`,
> `specs/readiness-gate.spec.md`.
> **Rev 2 changes** (the standing decompose-run gap list, H-13/H-14 reports +
> 2026-06-12 standing notes; no behavioral change to the warboss pipeline):
> (1) **jsonl cost-ledger sidecar adopted** (H-16 ruling — the runner currently
> constructs a sinkless `Ledger()`, so no `cost-ledger-<ts>.jsonl` is written
> like every other runner); (2) **`--max-requirements` NaN guard** — `parseInt`
> of a non-numeric flag yields `NaN` which silently disables the cap; reject it
> at parse time before any model call; (3) two pre-existing `// UNDECIDED:`
> readings in the source are **blessed as canonical** (the `deadRun`-key-omitted-
> on-healthy-runs reading and the CRLF final-newline-strip reading) — pinned
> here so a grunt stops marking them open; (4) `runDecompose`'s return shape
> `{ deadRun, artifactPath, artifact }` is **pinned**. NOTE the prior
> "`--max-requirements` never reaches the prompt" gap is **already closed** by
> warboss rev 4 (the `capLine` injection, `warboss.ts`) — rev 2 does NOT
> re-touch it; the cap is passed through unchanged.

## Requirement

The harness can run one live decomposition end-to-end from the command line:
read an intent (inline or from a file), call `decompose` with a HIGH-tier
agent, feed the resulting `DraftSet` to `admit` with a LOW-tier judge, and
write a timestamped artifact carrying the requirements, frozen contract
hashes, remaining audit gaps, the admitted/kicked-back partition with its
questions, the full ledger, and total cost. Offline test path via injected
fake client.

## Decisions (pinned 2026-06-11)

- **Module:** `src/experiment/decompose-run.ts` — exported
  `runDecompose(opts)` + CLI entry guarded like `e1a.ts`/`e1b.ts`. Tests:
  `test/decompose-run.test.ts` (offline, fake client).
- **npm script:** `"decompose": "node --env-file=.env --import tsx src/experiment/decompose-run.ts"`.
- **CLI:** `npm run decompose -- --intent "<prose>" [--intent-file path]
  [--context "<prose>"] [--max-requirements 8] [--out runs]`.
  Exactly one of `--intent` / `--intent-file` must be given; both or neither →
  descriptive error, no model call. `--intent-file` reads the file verbatim
  (UTF-8, no trimming beyond a final-newline strip).
- **Tiers:** decompose agent `TIERS.HIGH`; admit judge agent `TIERS.LOW`. No
  probe (`opts.probe` omitted) — probe batteries are not authored yet
  (warboss-decomposition non-goal; revisit after E2 design).
- **Pipeline:** `decompose({ agent, intent, context, maxRequirements, tags: { run: "decompose-live" } })`
  then `admit(draftSet, { judgeAgent, tags: { run: "decompose-live" } })`.
  One pass, no retries beyond what the warboss spec itself pins. A thrown
  `DecompositionParseError` or validation error propagates to the CLI, which
  prints the error and exits nonzero — fail-up, never re-roll.
- **Options:**

  ```ts
  interface DecomposeRunOptions {
    client?: MessagesClient;     // fake for tests; omitted → real client
    intent: string;
    context?: string;
    maxRequirements?: number;    // passthrough, default per warboss spec
    out?: string;                // default "runs"
    live?: boolean;              // CLI true, tests false
  }
  ```

- **Artifact:** `runs/decompose-<ISO8601-basic>.json`:

  ```json
  {
    "intent": "...",
    "context": "... or null",
    "requirements": [],
    "contracts": [ { "id": "...", "hash": "...", "version": "1" } ],
    "auditGaps": [],
    "admission": {
      "admitted": ["<hash>"],
      "kickedBack": [ { "hash": "...", "id": "...", "questions": [] } ]
    },
    "ledger": [],
    "totalCostUsd": 0.0
  }
  ```

  `requirements` is `DraftSet.requirements` verbatim. `contracts[].id` is the
  source requirement's id. `admission.admitted` holds contract hashes only
  (the contracts themselves are recoverable from `contracts`).
  `totalCostUsd` = `draftSet.costUsd + admission.costUsd`, and must equal the
  ledger sum (AC3).
- **Dead-run guard:** `live: true` AND (ledger cost `0` OR
  `requirements.length === 0`) → artifact stamped `"deadRun": true`, loud
  `DEAD RUN` warning, CLI exits nonzero.
- **Human-facing summary (stdout, exact shape):** after writing the artifact
  the runner prints one line per requirement:
  `<id>: <admitted|kicked-back> (<n-questions> questions)` followed by
  `auditGaps: <count>` and `total: $<costUsd to 4 dp>`. Nothing else — the
  artifact is the record; stdout is a glance.

## Decisions (pinned rev 2, 2026-06-13)

- **jsonl sidecar (AC7).** `runDecompose` constructs its `Ledger` with a
  `jsonlFileSink` pointed at `cost-ledger-<ts>.jsonl` under `outDir` (the
  e1b/e2/e3 idiom), so one such sidecar is written beside `decompose-<ts>.json`,
  one line per model call. The `<ts>` timestamp is computed ONCE and shared by
  both filenames (artifact and sidecar timestamps match). `mkdir` of `outDir`
  happens before the ledger sink is first flushed.
- **`--max-requirements` NaN guard (AC8).** In `parseCliArgs`, when
  `--max-requirements` is present but `Number.isNaN(parseInt(raw, 10))` or the
  parsed value is `< 1`, throw a descriptive error naming the bad value, BEFORE
  any model call (parse-time, same tier as the intent-conflict errors). A valid
  integer passes through unchanged.
- **`deadRun` key (blessed UNDECIDED).** Healthy runs OMIT the `deadRun` key
  entirely; only dead runs stamp `"deadRun": true`. This matches
  `DecomposeArtifact.deadRun?: true` and the artifact example (no `deadRun` key).
  Canonical — not an open choice.
- **CRLF final-newline strip (blessed UNDECIDED).** `--intent-file` strips a
  single trailing newline treating `\r\n` as one unit (`.replace(/\r?\n$/, "")`).
  Only ONE trailing newline is stripped; interior newlines and multiple trailing
  blank lines are preserved verbatim. Canonical.
- **`runDecompose` return shape (pinned).** `{ deadRun: boolean; artifactPath:
  string; artifact: DecomposeArtifact }` — unchanged from rev 1's
  implementation, now spec-pinned so it cannot drift.
- **No other change.** Artifact shape, admission semantics (probe-only, rev 4),
  human-facing stdout summary, and the dead-run condition are inherited from
  rev 1 / warboss rev 4 unchanged.

## Acceptance criteria (Given / When / Then)

1. **AC1 — happy path artifact.** Fake client scripted for a 2-requirement
   decomposition, empty audit, judge `READY` for both → artifact has 2
   `requirements`, 2 `contracts` with hashes matching the frozen contracts,
   `auditGaps: []`, `admission.admitted` length 2, `kickedBack: []`,
   `totalCostUsd` equal to ledger sum.
2. **AC2 — kick-back surfaced.** Judge scripted `READY` then
   `NOT READY\n- what about negatives?` → `admission.kickedBack` has exactly
   one entry whose `questions` equals `["what about negatives?"]` and whose
   `id` names the second requirement.
3. **AC3 — cost identity.** In both AC1 and AC2 fixtures:
   `totalCostUsd === draftSet.costUsd + admission.costUsd` AND equals the
   artifact ledger sum.
4. **AC4 — intent input validation.** `--intent` and `--intent-file` both
   given → error naming the conflict, ledger empty (no model call). Neither
   given → same. (Test via the exported fn's CLI-arg parser or by invoking
   the parse helper directly — pin whichever the implementation exposes, but
   the no-model-call assertion is mandatory.)
5. **AC5 — fail-up propagation.** Fake client scripted so both decompose
   calls are unparseable → `runDecompose` rejects with
   `DecompositionParseError`; no artifact file is written.
6. **AC6 — dead-run guard.** `live: true` + zero-cost fixture →
   `deadRun: true` stamped, nonzero exit path. `live: false` → no stamp
   failure.

7. **AC7 — jsonl sidecar (rev 2).** `runDecompose` with a fake client writes
   exactly one `cost-ledger-<ts>.jsonl` beside the `decompose-<ts>.json`
   artifact (matching timestamps); the sidecar has one JSON line per metered
   model call and the sum of its `costUsd` values equals the artifact's
   `totalCostUsd` (and the artifact `ledger` length equals the sidecar line
   count).

8. **AC8 — `--max-requirements` NaN/range guard (rev 2).** `parseCliArgs(["--intent",
   "x", "--max-requirements", "abc"])` → descriptive throw naming the bad value;
   same for `"0"` and `"-3"` (range `< 1`). No model call is made (parse-time).
   `"--max-requirements", "5"` parses to `maxRequirements: 5` unchanged.

9. **AC9 — CRLF strip + healthy `deadRun` omission (rev 2, blessed readings).**
   An `--intent-file` whose content ends in `\r\n` → exactly one trailing
   newline stripped (a content ending `"a\r\nb\r\n"` becomes `"a\r\nb"`; interior
   `\r\n` preserved). A healthy (non-dead) run's artifact JSON has **no**
   `deadRun` key (grep-assert absence), while a dead run stamps
   `"deadRun": true`.

## Verifies-with

- Tests: `test/decompose-run.test.ts` — AC1–AC9, offline.
- Integration: first live decomposition (HIGH tier, Leader-funded 2026-06-11)
  against a real intent chosen at run time; artifact kept under `runs/`,
  reviewed against the E2 quality bar before any admitted contract is
  dispatched to a grunt.
