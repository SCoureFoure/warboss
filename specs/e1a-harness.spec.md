# Spec — E1a harness (variance experiment runner + duration-parse task assets)

> Status: active · Feature: e1a-harness · Added: 2026-06-10 · Maps to: PLAN Phase 2a (E1a)
> Source of truth for the first falsifier: the single-shot variance study that
> tests whether a frozen executable contract collapses interpretation variance
> across independent grunt runs. This spec is written to be implemented by a
> low-tier model: every fork is decided here; nothing is left to interpret.

## Requirement

The harness can run E1a end-to-end: load a task's assets (ambiguous prose
requirement, canonical acceptance examples, hidden held-out battery), freeze the
grader contract, dispatch N independent single-shot generations per experimental
arm (A: cheap+prose, B: cheap+full contract, C: cheap+partial contract, D:
high-model+prose), judge every implementation against the hidden battery, and
report behavioral clusters, covered/uncovered pass-rate splits, per-arm cost,
and a mechanical PASS/FAIL evaluation of the pre-registered success criteria —
all persisted as a single timestamped results artifact. The default `npm test`
path is offline and deterministic via an injected fake client; live dispatch
requires `ANTHROPIC_API_KEY`.

## Constraints (inherited)

- **Cost-metered.** Every generation routes through `Agent` → `Ledger`. The
  results artifact embeds the full ledger. No un-metered path.
- **Membrane immutability.** The grader contract is frozen once per run;
  every `judge` call passes `expectedHash` so a tampered contract throws
  `ContractHashMismatch`.
- **Hidden battery never leaks.** Hidden cases never appear in any prompt or
  system string. The harness *proves* this mechanically (contamination audit,
  AC4) before any dispatch. E1a is single-shot so no feedback exists, but the
  audit guards the prompt path. The results artifact may contain hidden cases —
  it is a post-hoc analyst artifact no grunt ever receives.
- **`node:vm` is not a security sandbox.** E1a tasks are pure synchronous
  functions; the existing sandbox suffices. No new execution surface.
- **Grunt is a doer, not a planner.** One `Agent.generate` call per run. No
  retry loop in E1a (that is E1b). Transient API-error retries (AC12) are
  infrastructure, not experiment semantics.

## Decisions (pinned 2026-06-10)

### Experiment design
- **System prompt: neutral and uniform across all four arms.**
  `E1A_SYSTEM = "Implement the requested function. Output ONLY one fenced code block. No prose."`
  GRUNT_DOGMA is NOT used in E1a — its "most literal reading" clause would
  suppress the variance Arm A exists to expose. Exported from `arms.ts`.
- **Arm table (the only arms; ids are exactly these strings):**

  | Arm | Tier | Prompt contents | Thinking |
  | --- | --- | --- | --- |
  | `A` | `TIERS.LOW` | requirement prose only | off |
  | `B` | `TIERS.LOW` | prose + ALL canonical examples + contract hash | off |
  | `C` | `TIERS.LOW` | prose + ONLY the pinned subset of examples + that partial contract's hash | off |
  | `D` | `TIERS.HIGH` | requirement prose only (identical prompt to A) | off |

- **Thinking off everywhere** (no `thinking` key passed). A thinking-on Arm D′
  is a possible future amendment, not built now.
- **Temperature: not set** (SDK default). `Agent.generate` does not expose it;
  do not add it.
- **`maxTokens: 2048`** per generation (impls are small).
- **N default 30 per arm**, overridable via CLI `--n`.
- **Concurrency: 4** generations in flight at once, across the whole run.
- **Transient-failure policy:** an API call that throws is retried up to 2
  times (3 attempts total). Only successful calls are metered (a failed call
  returns no usage). A run whose attempts are exhausted, or whose response
  yields no extractable code, is recorded with `generationFailed: true` and an
  all-false vector — it still counts toward N and clustering (an impl that
  cannot run fails everything; that IS its behavior).

### Grading
- **One grader contract per task,** frozen from the FULL canonical example set
  (`Contract.freeze`). All arms are judged against the same grader + the same
  hidden battery via
  `judge(grader, code, { battery: hidden, expectedHash: grader.hash })`.
  Arm C's *partial* contract is frozen separately (same requirement/entry,
  subset examples, version suffixed `-partial`) and is used ONLY for prompt
  injection — never for grading.
- **Behavioral cluster key** = the hidden-battery `vector` joined as a
  `"1"`/`"0"` string. Cluster = identical key. Per arm: cluster count + sizes
  (descending).
- **Covered/uncovered splits — two, computed mechanically:**
  1. *Full-contract split* (used by criteria 1–2): a hidden case is `covered`
     iff its `coveredBy` list is non-empty; `uncovered` iff empty. Applied
     identically to every arm so cross-arm comparison shares case classes.
  2. *Arm-C-relative split* (used by criterion 3): a hidden case is
     `coveredByC` iff `coveredBy ∩ armCSubset ≠ ∅`. Criterion 3 compares pass
     rates on the NOT-coveredByC cases between Arm C and Arm A.
- **Pre-registered criteria, evaluated mechanically and printed PASS/FAIL:**
  1. `clusters(B) ≤ 2 && clusters(A) ≥ 5`
  2. `meanPassRate(B, covered) − meanPassRate(A, covered) ≥ 0.15`
  3. `meanPassRate(C, notCoveredByC) ≤ meanPassRate(A, notCoveredByC)`
     (criterion *holds* when partial contract hurts or matches — i.e. ≤)
  4. Economics: **deferred to E1b.** Report per-arm cost totals; print
     `criterion 4: deferred (E1b)`.

### Task assets (file formats)
- Directory: `tasks/<task-name>/` with exactly three files:
  - `requirement.md` — the ambiguous prose shown to grunts, verbatim.
  - `task.json`:
    ```json
    {
      "name": "duration-parse",
      "entry": "parseDuration",
      "version": "1",
      "examples": [ { "name": "...", "input": ["..."], "expected": 0 } ],
      "armCSubset": ["<example name>", "..."]
    }
    ```
    Every `examples[]` entry MUST have a unique `name`. `armCSubset` entries
    MUST each match an example name.
  - `hidden-battery.json` — array of
    `{ "name": "...", "input": [...], "expected": ..., "throws": true?, "coveredBy": ["<example name>", ...] }`.
    Every `coveredBy` ref MUST match a canonical example name. Unique names.
- **Asset validation throws with a descriptive message** on: missing file,
  missing/duplicate names, dangling `armCSubset` or `coveredBy` refs, empty
  examples array.

### Membrane-core amendment (rides on existing modules — own AC, not bundled)
- `ContractCase` gains optional `throws?: true`: the case expects the impl to
  throw (any error). In `judge`, a case with `throws: true` passes iff
  `runImpl` returns `{ok: false}`; `expected` is ignored for such cases and
  set to the string `"<throws>"` by convention in assets. `Contract.computeHash`
  includes `throws` in the canonical form (only when present, key order
  `input, expected, throws`). Recorded as **AC16 in membrane-core.spec.md**;
  implemented and tested in this change set.
  - Known accepted limitation: a timeout or missing-entry also yields
    `{ok: false}` and would pass a `throws` case. Acceptable for E1a.

### Duration-parse canon (lenient — pinned; grader truth, prose stays ambiguous)
Rules: units `h`/`m`/`s` (3600/60/1); any order; repeated units allowed and
summed; carries allowed (`"1h90m"` = 9000); decimals allowed (`"1.5h"` = 5400);
bare number = seconds; surrounding/internal whitespace tolerated; negative or
unparseable input → throws.

- `requirement.md` verbatim content (deliberately silent on every edge):

  ```
  Write a function `parseDuration(s)` that takes a human-readable duration
  string such as "1h30m" or "90s" and returns the total number of seconds.
  ```

- Canonical examples (`task.json` `examples`, exactly these):

  | name | input | expected |
  | --- | --- | --- |
  | `basic-hm` | `"1h30m"` | `5400` |
  | `bare-minutes` | `"90m"` | `5400` |
  | `seconds-only` | `"45s"` | `45` |
  | `bare-number` | `"90"` | `90` |
  | `full-hms` | `"2h15m30s"` | `8130` |

- `armCSubset`: `["basic-hm", "seconds-only"]` (the easy pair; leaves bare
  numbers, multi-unit, and all edges uncovered for Corollary D to bite).
- Hidden battery (exactly these 12; vector length 12):

  | name | input | expected | coveredBy |
  | --- | --- | --- | --- |
  | `plain-hours` | `"2h"` | `7200` | `["basic-hm"]` |
  | `plain-minutes` | `"10m"` | `600` | `["basic-hm","bare-minutes"]` |
  | `zero-seconds` | `"0s"` | `0` | `["seconds-only"]` |
  | `three-units` | `"3h2m1s"` | `10921` | `["full-hms"]` |
  | `bare-number-2` | `"120"` | `120` | `["bare-number"]` |
  | `carry-minutes` | `"1h90m"` | `9000` | `[]` |
  | `repeat-units` | `"30m30m"` | `3600` | `[]` |
  | `decimal-hours` | `"1.5h"` | `5400` | `[]` |
  | `reversed-order` | `"30m1h"` | `5400` | `[]` |
  | `whitespace` | `" 1h 30m "` | `5400` | `[]` |
  | `negative` | `"-1h"` | throws | `[]` |
  | `garbage-unit` | `"1x"` | throws | `[]` |

### Module layout (pinned — create exactly these files)
```
src/experiment/task.ts      loadTask(dir) → TaskDef {prose, grader, partial, hidden, armCSubset};
                            auditNoContamination(prompts: string[], hidden) → void|throw
src/experiment/arms.ts      ArmId = "A"|"B"|"C"|"D"; E1A_SYSTEM; armSpec(arm) → {tier, usesContract};
                            buildPrompt(arm, task) → string  (pure, deterministic)
src/experiment/analysis.ts  cluster(records) ; splits(records, task) ; evaluateCriteria(analysis)
                            (all pure — no I/O, no model calls)
src/experiment/e1a.ts       CLI orchestrator: parse args (--n, --arms, --task, --out),
                            build prompts, audit, dispatch via Agent (injectable client),
                            judge, analyze, write artifact, print report
test/e1a.test.ts            all ACs below, offline, injected fake client
tasks/duration-parse/       the three asset files above
```
- **Prompt format for contract arms (B/C):** prose, blank line, then
  `Frozen contract (hash <hash>):` followed by one line per example:
  `parseDuration(<JSON input args joined ", ">) === <JSON expected>`. Nothing else.
- **Results artifact:** `runs/e1a-<ISO8601 basic, e.g. 20260610T154500Z>.json`
  containing `{config, taskName, graderHash, runs[], analysis, criteria, ledger}`.
  Each run record: `{arm, index, model, code, generationFailed, vector, score,
  coveredScore, uncoveredScore, costUsd, wallMs}`. `runs/` is gitignored.
- **CLI defaults:** `--n 30 --arms A,B,C,D --task duration-parse --out runs/`.
- The orchestration core is a function `runE1a(opts)` taking an injectable
  `MessagesClient` so tests run the full pipeline offline; the CLI entry just
  parses argv and calls it with the real client.

## Acceptance criteria (Given / When / Then)

1. **AC1 — asset loading + grader freeze.** Given `tasks/duration-parse/`,
   `loadTask` returns a frozen grader contract over all 5 canonical examples
   (deterministic hash across two loads), a partial contract over exactly the
   `armCSubset` examples with a different hash, and 12 hidden cases.
2. **AC2 — asset validation.** A task with a dangling `armCSubset` name, a
   dangling `coveredBy` ref, duplicate example names, or empty `examples`
   throws a descriptive error naming the offending field.
3. **AC3 — prompt building.** `buildPrompt`: arms A and D yield the identical
   prose-only prompt containing no example inputs/expecteds; arm B contains
   every canonical example and the grader hash; arm C contains exactly the
   subset examples (and the partial hash), none of the others.
4. **AC4 — contamination audit.** Given prompts where one contains a hidden
   case's input (or expected) substring, the audit throws naming the arm and
   case; given the real built prompts for duration-parse, the audit passes.
5. **AC5 — single-run record.** With a fake client returning a fenced correct
   impl, the run record carries the judged 12-length vector, score 1,
   `generationFailed: false`, the call's cost, and a ledger entry tagged
   `{arm, task, index}`.
6. **AC6 — generation failure shape.** Fake client returning prose with no
   code (or empty text) → `generationFailed: true`, all-false vector of
   length 12, run still present in records and clustering.
7. **AC7 — clustering.** Given records with known vectors (e.g. 3 distinct
   keys sized 3/2/1), `cluster` reports count 3 and sizes `[3,2,1]`.
8. **AC8 — splits.** Given the duration-parse `coveredBy` tags: full-contract
   split puts exactly the 5 non-empty-`coveredBy` cases in `covered`; arm-C
   split puts exactly `plain-hours`, `plain-minutes`, `zero-seconds` in
   `coveredByC`; pass rates over synthetic vectors compute correctly.
9. **AC9 — criteria evaluation.** Synthetic analysis fixtures drive each of
   criteria 1–3 to both PASS and FAIL per the pinned thresholds; criterion 4
   always reports `deferred`.
10. **AC10 — arm/model mapping.** Captured fake-client calls show arms A/B/C
    used `TIERS.LOW.id`, arm D used `TIERS.HIGH.id`, every call's system is
    `E1A_SYSTEM`, `max_tokens` 2048, and no `thinking` key present.
11. **AC11 — results artifact.** `runE1a` with a fake client and small N
    writes one JSON file under the out dir whose parsed content has config
    (n, arms, task), grader hash, N×arms run records, analysis, criteria
    verdicts, and the full ledger; total artifact cost equals the ledger sum.
12. **AC12 — transient retry.** Fake client that throws once then succeeds →
    run succeeds with exactly one ledger entry; fake client that always
    throws → after 3 attempts the run is `generationFailed: true` and the
    experiment completes without throwing.
13. **AC13 — mechanical freeze on grading path.** Judging in the pipeline
    passes `expectedHash`; a grader contract substituted with a different
    hash causes the run to throw `ContractHashMismatch` (test via judging
    helper with a mismatched hash).

(AC16 of membrane-core — `throws` cases — is specified and indexed there;
its tests live in `test/runner.test.ts` / `test/contract.test.ts`.)

## Verifies-with

- Tests: `test/e1a.test.ts` — AC1–AC13 (offline, fake `MessagesClient`);
  `test/runner.test.ts` + `test/contract.test.ts` — membrane-core AC16.
- Integration: `npm run e1a -- --n 2 --arms A,B` with a live key dispatches
  real grunts end-to-end and writes a `runs/` artifact (manual, not CI).
- Falsifies / experiment link: E1a pre-registered criteria 1–3 (criterion 4
  settles in E1b). If criterion 1 or 2 fails at N=30 on rung 1, escalate to
  rung 2 (csv-quoting) before drawing conclusions — per PLAN saturation note.
