# Spec — multi-task replication (the kick-back loop on a second task)

> Status: active · rev 1 · Feature: multi-task-replication · Added: 2026-06-14 · Maps to: PLAN Phase 4 follow-on (E4 standing consequence #4 — replicate before trusting broadly).
> Source of truth for running the E4 kick-back experiment on a SECOND task, and
> for the one harness generalization that requires: the contested-input coverage
> check in `loadLeaderAnswers` must become task-driven instead of hardcoded to
> `duration-parse`'s three E3 inputs.
> Depends on: `specs/e4-battery-authoring.spec.md` rev 3 (the runner this drives,
> via its `--task` option), `specs/e1a-harness.spec.md` (the task-asset shape
> this second task must follow).

## Requirement

E4 PASSed on ONE task (`duration-parse`). The delegation bet is "the kick-back
loop produces a contract a cheap grunt satisfies at least as well as a human's,
on a neutral oracle" — a claim about the LOOP, which must replicate on a second,
structurally different task before the pipeline is trusted broadly. This spec:

1. **Generalizes the harness** so E4 is task-agnostic: `loadLeaderAnswers`'s
   mandatory-coverage check (today hardcoded to `["120"]`, `[" 1h 30m "]`,
   `["1.5h"]`) reads the **required contested inputs from a per-task
   `contested.json`** asset. `duration-parse`'s `contested.json` restates its
   existing three (back-compat: the e4 tests pass unchanged). `runE4` already
   takes `--task`; after this change, a new task needs only its assets, no code.
2. **Adds a second task's assets** (owner-gated authoring — the task's
   `requirement.md`, `task.json`, `hidden-battery.json`, `contested.json`, and
   `leader-answers.json` are hand-authored, not model-generated). The recommended
   task is **`parse-range`** (decision below; owner confirms).
3. **Re-runs E4** on the second task and records a verdict; the **replication
   criterion** is E4's own (warboss ≥ 0.90 × human on the second task's Leader
   battery), with the same sharp error-coverage prediction.

## Constraints (inherited)

- **Cost-metered.** Same as E4: HIGH re-author + LOW grinding through one shared
  `Ledger`/sidecar. The second task's live run is a fresh E4 run (~$0.15–0.25).
- **Hidden battery never leaks.** The second task's hidden battery + Leader battery
  obey the same contamination-disjoint residual filter; `auditNoContamination`
  runs over its residual. No Leader-battery input appears in any grunt prompt.
- **`node:vm` is not a security sandbox.** The second task MUST be a pure,
  synchronous function (so the existing sandbox suffices) — same gate E1 tasks
  pass. A task needing I/O is out of scope for this leg.
- **Grunt is a doer, not a planner.** The harness change is one loader
  generalization; no new loop logic.

## Decisions (pinned 2026-06-14)

### Harness generalization — `contested.json` drives coverage

- New per-task asset `tasks/<task>/contested.json`:

  ```json
  { "inputs": [ ["120"], [" 1h 30m "], ["1.5h"] ] }
  ```

  `inputs` is a non-empty array of arg tuples — the contested, intent-
  underdetermined inputs the owner MUST rule on for this task to be E4-eligible.
- `loadLeaderAnswers` gains a second parameter `requiredInputs: readonly
  (readonly unknown[])[]` (the tuples from `contested.json`). It enforces that
  the asset covers EVERY `requiredInput` (deep-equal on the tuple), throwing a
  descriptive error naming any missing tuple — the EXISTING behavior, but the
  required set is now passed in, not a module constant. The hardcoded
  `E3_KNOWN_INPUTS` constant is DELETED.
- `runE4` reads `tasks/<task>/contested.json` and passes its `inputs` as
  `requiredInputs`. A task directory with NO `contested.json` → descriptive
  throw ("task <name> is not E4-eligible: missing contested.json") BEFORE any
  model call. `duration-parse/contested.json` is added with its three inputs, so
  every existing e4 test (which uses the duration-parse fixture path or an inline
  fixture) keeps passing — the offline e4 tests that inject a fake `tasksDir`
  must also drop a `contested.json` into that fixture dir.

### Second task — `parse-range` (recommended; owner confirms)

A pure function `parseRange(spec: string): number[]` that expands a comma-list of
integer ranges, e.g. `"1-3,5,8-10"` → `[1,2,3,4,5,8,9,10]`. It is chosen because
it has a RICH intent-underdetermined surface (so the author tier escalates and
the owner's rulings matter), distinct from `duration-parse`:

- **Underdetermined points (candidate contested inputs):** reversed bound
  `"5-1"` (empty? error? descending expansion?); duplicate / overlapping ranges
  `"1-3,2-4"` (dedupe? keep duplicates? sort?); whitespace `" 1 - 3 "`;
  empty segment `"1,,3"`; negative / zero bounds `"-2-2"`. These mirror the
  duration-parse pattern: each has ≥2 defensible readings the prose intent does
  not decide.
- **Asset requirements** (same shape `loadTask` reads — see
  `specs/e1a-harness.spec.md`): `requirement.md` (prose, deliberately leaving the
  contested points open), `task.json` (entry `parseRange`, ≥2 public examples
  incl. one `throws`, `armCSubset`), `hidden-battery.json` (held-out cases with a
  happy + error split so the coverage split is non-degenerate),
  `contested.json` (the contested tuples above), `leader-answers.json` (the owner's
  ruling per contested input, each with a literal-free `decision`; rev-3
  `extraCases` allowed).
- **Owner authoring is the gate.** The human contract = `task.grader` (frozen
  from `task.json` public examples), exactly as `duration-parse`. The owner
  deliberately leaves the human contract's error coverage realistic (i.e. it may
  carry the same Corollary-D hole) so the replication tests the SAME effect.

> **If the owner prefers a different second task,** the only constraints are:
> pure + synchronous, a non-trivial intent-underdetermined surface (≥3 contested
> inputs), and a hidden battery with both happy and error cases. The harness
> change is task-agnostic; only the assets differ.

### Replication criterion

The pre-registered E4 criterion, computed on the second task's Leader battery:
**PASS iff** `warboss.meanFinalHiddenScore >= 0.90 × human.meanFinalHiddenScore`.
Sharp predictions carried (recorded, not gating), mirroring the duration-parse
verdict:

1. The error-coverage gap replicates: on the second task's error-path Leader cases,
   the human arm scores ≈0 (its contract pins no error behavior — the
   Corollary-D hole) and the warboss arm scores high (it authored throws from the
   owner's "invalid" rulings).
2. The criterion PASSES (warboss ≥ 0.90 × human), as it did on `duration-parse`.
3. A FAIL on the second task is the more interesting outcome — it would localize
   E4's PASS to `duration-parse`'s specifics and is a stronger result than a
   second PASS; the verdict must autopsy which arm/cases moved.

### Module layout & CLI

```text
src/experiment/e4.ts                  loadLeaderAnswers gains requiredInputs param; E3_KNOWN_INPUTS deleted; runE4 reads contested.json
src/experiment/task.ts                UNCHANGED (contested.json is read by e4, not loadTask)
tasks/duration-parse/contested.json   NEW — the three existing E3 inputs (back-compat)
tasks/parse-range/*                    NEW — owner-authored second-task assets (requirement.md, task.json, hidden-battery.json, contested.json, leader-answers.json)
test/e4.test.ts                        AC-MT1..AC-MT3 added; existing AC1/AC9 fixtures gain a contested.json
```

- `runE4 --task parse-range --n 30 --granularity full` drives the second run
  (reusing the existing CLI; **npm eats `--flags` on Windows** — invoke `node`
  directly).

## Acceptance criteria (Given / When / Then)

1. **AC-MT1 — `contested.json` drives coverage.** `loadLeaderAnswers(path,
   requiredInputs)` with `requiredInputs` = three tuples and an asset covering
   all three → returns rulings verbatim. Asset missing one required tuple →
   descriptive throw naming the missing tuple. `requiredInputs = []` → no
   coverage constraint (any asset that is otherwise valid loads). (The hardcoded
   `E3_KNOWN_INPUTS` constant no longer exists — grep-assert it is gone.)
2. **AC-MT2 — `runE4` reads `contested.json`.** `runE4({ task, tasksDir })` with
   a fixture task dir containing a `contested.json` → passes its `inputs` as
   `requiredInputs` (capture-assert the coverage check ran against them). Same
   fixture dir WITHOUT `contested.json` → descriptive throw naming the task,
   before any model call. The `duration-parse` real asset dir has a
   `contested.json` with its three inputs (so the live default path is
   E4-eligible).
3. **AC-MT3 — second task loads + runs offline.** `loadTask(tasks/parse-range)`
   returns a valid `TaskDef` (pure entry, ≥2 public examples incl. a `throws`,
   non-empty hidden battery with ≥1 happy + ≥1 error case); `runE4({ task:
   "parse-range", client: fake, n: 1 })` completes offline and writes an
   `e4-<ts>.json` whose `config.task` is `"parse-range"` and whose Leader battery is
   built from the parse-range hidden cases + its leader-answers rulings.

## Verifies-with

- Tests: `test/e4.test.ts` — AC-MT1..AC-MT3 (offline; the parse-range run uses a
  fake client + the committed parse-range assets, or a fixture dir). Existing e4
  ACs re-run unchanged once their fixtures gain a `contested.json`.
- Integration (live, owner-gated — the gate is the owner authoring the
  `parse-range` assets + `leader-answers.json` by hand): `node --env-file=.env
  --import tsx src/experiment/e4.ts --task parse-range --n 30 --granularity full`
  (~$0.15–0.25). Verdict → `archive/reports/e4-parse-range-verdict.md`: per-contested-input
  scores, the criterion, the named treatment asymmetry (inherited from E4), and
  whether the error-coverage gap replicated.
- Falsifies / experiment link: the E4 criterion on a second task. PASS → the
  kick-back loop's value is not task-specific; the pipeline (kickback-pipeline
  spec) is trusted to wire. FAIL → localize the autopsy: which task feature broke
  the replication, feeding a third-task design or a pipeline caveat.
