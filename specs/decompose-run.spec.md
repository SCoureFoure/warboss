# Spec — decompose-run (live decomposition runner: intent → artifact)

> Status: active · rev 1 · Feature: decompose-run · Added: 2026-06-11 · Maps to: PLAN Phase 4 integration ("first live decomposition", God-funded 2026-06-11)
> The thin CLI shell around `decompose` + `admit`: takes God's intent, drives
> the warboss pipeline once, and persists everything a human needs to judge
> the output. Orchestration only — ALL pipeline semantics live in
> `specs/warboss-decomposition.spec.md` (rev 3) and are not restated here.
> Depends on: `specs/warboss-decomposition.spec.md`,
> `specs/readiness-gate.spec.md`.

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

## Verifies-with

- Tests: `test/decompose-run.test.ts` — AC1–AC6, offline.
- Integration: first live decomposition (HIGH tier, God-funded 2026-06-11)
  against a real intent chosen at run time; artifact kept under `runs/`,
  reviewed against the E2 quality bar before any admitted contract is
  dispatched to a grunt.
