# Spec — gate-calibration (READY-rate vs r2 modal-share anchors)

> Status: active · rev 1 · Feature: gate-calibration · Added: 2026-06-11 · Maps to: readiness-gate spec "Calibration protocol" (`specs/readiness-gate.spec.md` lines 111–120, recorded there 2026-06-10, God-funded 2026-06-11)
> Builds the runner for the open question the gate instrument exists to
> answer: does LOW-tier `gruntJudge` READY correlate with E1a-r2 modal share,
> or does it over-claim? Depends on: `specs/readiness-gate.spec.md`
> (`gruntJudge`, fail-closed parse), `specs/e1a-harness.spec.md`
> (`buildPrompt`, task assets).

## Requirement

The harness can run the gate-calibration experiment end-to-end: for each of
the three r2 prompt configs (A prose-only, B full contract, C partial), build
the dispatch prompt exactly as E1a did, run `gruntJudge` N independent times
per config, and persist a timestamped artifact reporting per-config READY
rate, malformed count, and all kicked-back questions, side by side with the
pinned r2 modal-share anchors. Offline test path via injected fake client.

## Decisions (pinned 2026-06-11)

- **Module:** `src/experiment/calibrate-gate.ts` — exported
  `runGateCalibration(opts)` + CLI entry guarded the same way `e1a.ts`/`e1b.ts`
  guard theirs. Tests: `test/calibrate-gate.test.ts` (offline, fake client).
- **npm script:** `"calibrate-gate": "node --env-file=.env --import tsx src/experiment/calibrate-gate.ts"`.
- **Configs (exact):** `["A", "B", "C"]`. Prompt per config =
  `buildPrompt(config, task)` from `arms.ts`, task =
  `loadTask("tasks/duration-parse")`. No rewrapping — what r2 dispatched is
  what is judged.
- **Judge:** `gruntJudge({ agent, prompt, tags: { config, run } })` from
  `gate.ts`, default `kind` (`gate.judge`). Judge agent tier: `TIERS.LOW`
  (the would-be implementer — same tier the gate will guard in production).
- **N:** default 20 per config, CLI `--n` overrides. Concurrency 4 across all
  calls.
- **Anchors (pinned constants, from r2):**
  `{ A: 0.60, B: 0.967, C: 0.967 }` — embedded in the artifact verbatim so
  the comparison is self-contained. The runner does NOT compute a pass/fail
  verdict — interpretation is human (the readiness-gate spec names what
  useful signal looks like); the artifact only juxtaposes.
- **Options:**

  ```ts
  interface GateCalibrationOptions {
    client?: MessagesClient;   // fake for tests; omitted → real client
    n?: number;                // default 20
    out?: string;              // default "runs"
    live?: boolean;            // CLI passes true, tests false
  }
  ```

- **Artifact:** `runs/gate-calibration-<ISO8601-basic>.json`:

  ```json
  {
    "config": { "n": 20, "configs": ["A", "B", "C"], "task": "duration-parse" },
    "results": {
      "A": { "readyCount": 0, "readyRate": 0.0, "malformedCount": 0,
             "questions": ["..."] },
      "B": { "...": "same shape" },
      "C": { "...": "same shape" }
    },
    "anchors": { "A": 0.60, "B": 0.967, "C": 0.967 },
    "ledger": [],
    "totalCostUsd": 0.0
  }
  ```

  `questions` is the concatenation of every verdict's `questions` array for
  that config, in call order, duplicates kept (duplicates ARE signal —
  repeated questions mark a stable hole).
- **Malformed counts as not-ready** (gate dogma fail-closed): a malformed
  verdict increments `malformedCount` and does not increment `readyCount`.
  `readyRate = readyCount / n` (malformed included in the denominator).
- **Dead-run guard (e1a lesson):** `live: true` AND ledger total cost `0` →
  artifact stamped `"deadRun": true`, loud `DEAD RUN` warning printed, CLI
  exits nonzero. Otherwise `"deadRun": false`.
- **Cost:** `totalCostUsd` = ledger sum of the run's calls. Every call routes
  through `Agent`/`Ledger` — no un-metered path.

## Acceptance criteria (Given / When / Then)

1. **AC1 — partition & rates.** Fake client scripted so config A gets
   12×`READY` + 8×`NOT READY\n- q1`, B gets 20×`READY`, C gets 20×`NOT READY\n- holeq`
   (n=20) → `results.A.readyRate === 0.6`, `results.A.questions` has 8
   entries all `"q1"`; `results.B.readyRate === 1`; `results.C.readyRate === 0`
   and `results.C.questions.length === 20`.
2. **AC2 — malformed is not ready.** Script one config's calls as gibberish
   (no READY/NOT READY first line) → that config's `malformedCount` equals
   the call count, `readyCount === 0`, `readyRate === 0`.
3. **AC3 — artifact structure & cost.** `runGateCalibration` with fake client
   and `n: 2` writes exactly one JSON artifact under `out/` containing
   `config`, `results` keyed exactly `A`/`B`/`C`, `anchors` equal to the
   pinned constants, `ledger`, and `totalCostUsd` equal to the ledger sum.
4. **AC4 — prompts are r2 prompts.** Capture-assert: the prompt sent for
   config B contains the frozen contract section (the contract hash line);
   the prompt for config A is exactly `task.prose`.
5. **AC5 — dead-run guard.** `live: true` + zero-cost fake ledger →
   `deadRun: true` in the artifact and a nonzero CLI exit path;
   `live: false` same fixture → no dead-run stamp failure.

## Verifies-with

- Tests: `test/calibrate-gate.test.ts` — AC1–AC5, offline.
- Integration: `npm run calibrate-gate` live (≈60 LOW-tier judge calls,
  God-funded 2026-06-11); artifact under `runs/`, read against the
  readiness-gate spec's "useful signal" paragraph.
