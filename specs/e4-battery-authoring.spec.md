# Spec — E4 battery authoring (close the kick-back loop: God answers, warboss re-authors, re-run on a neutral oracle)

> Status: active · rev 1 · Feature: e4-battery-authoring · Added: 2026-06-13 · Maps to: PLAN Phase 4 follow-on (E3 standing consequence #1) + the delegation bet's end-to-end close.
> Source of truth for the experiment that finishes the chain E2/E3 opened.
> E2 (`reports/e2-verdict.md`) located the residual failure in three
> intent-underdetermined `duration-parse` inputs and showed the fixed hidden
> battery encodes the **human author's** coin flips (the E2 confound — a case
> neither contract "decides" is scored against one author's arbitrary
> resolution). E3 (`reports/e3-verdict.md`) showed the rev-4 author tier
> surfaces those points as machine-visible **escalations** before freeze, but
> **no human has answered them**, so no contract in the system is
> underdetermination-free. E4 closes the loop: God answers the escalations once;
> those answers become (a) a **neutral oracle battery** (replacing the
> confounded human-coin-flip battery) and (b) **locked decisions** fed back into
> a warboss re-author; then E2 re-runs human-vs-re-authored-warboss against the
> God battery. **This is where the kick-back loop earns its cost or does not.**
> Depends on: `specs/warboss-decomposition.spec.md` rev 4 (`decompose`,
> `escalations`), `specs/e2-contract-authorship.spec.md` rev 2 (the comparison
> runner this drives, extended with a battery override), `specs/e3-intent-divergence.spec.md`
> (the escalations this answers), `specs/decompose-run.spec.md` (artifact shape).

## Requirement

Given (a) a task's prose intent and human contract, (b) a **God-answers
asset** — the owner's ruling on each contested underdetermined input (the value
or `throws`, with a one-line rationale) — the harness: (1) builds a **God
battery** = the task's uncontested hidden cases plus one case per God ruling
(rulings override any same-input hidden case); (2) re-authors a warboss contract
by calling `decompose` (HIGH) with the God rulings rendered into the decompose
`context` as **owner-decided constraints**; (3) re-runs the E2 comparison
(human contract vs the re-authored warboss contract, same LOW grunt, same loop)
scoring **both** arms against the God battery via E2's contamination-disjoint
residual filter; (4) evaluates the **pre-registered E4 criterion** (re-authored
warboss reaches ≥ 0.90 × human on the *neutral* oracle — the E2 criterion form,
now on a battery that encodes neither author's coin flips). Authoring cost
(HIGH) and grinding cost (LOW) are reported separately. Every model call is
metered; the default test path is offline via the injected fake client.

## Constraints (inherited)

- **Cost-metered.** Re-author calls are HIGH-tier; grinding is LOW-tier. The
  artifact reports `authoringCostUsd` (this run's re-author spend) and
  `grindingCostUsd` (this run's E2 spend) as distinct fields; one
  `cost-ledger-<ts>.jsonl` sidecar (H-16 ruling).
- **Membrane immutability.** The re-authored warboss contract is frozen by
  `decompose` (warboss stage 6); E4 reconstructs/reuses it through E2's existing
  hash-integrity guard and never edits a frozen contract.
- **Hidden battery never leaks — and the leak surface is now the God battery.**
  The God battery is the scoring oracle; **no God-battery case (input) may
  appear in any prompt** a grunt sees. E2 rev 2's contamination-disjoint
  residual filter is applied to the God battery exactly as it is to
  `task.hidden` (every collided case mechanically excluded and recorded;
  `auditNoContamination` re-run over the residual). The re-author step DOES see
  the God rulings (that is the treatment) — therefore any God ruling whose input
  the re-authored warboss prompt then contains is **excluded from scoring** by
  the same filter; this is expected and recorded, not fatal (it only shrinks the
  oracle), and the verdict reports the exclusion count.
- **Grunt is a doer, not a planner.** One `Agent.generate` per attempt; the loop
  is `runLoop` via E2. E4 adds no loop logic — it composes `decompose` + `runE2`.
- **`node:vm` is not a security sandbox.** The task stays a pure synchronous
  function; the existing sandbox suffices.

## Decisions (pinned 2026-06-13)

### What E4 measures vs what it does NOT

- E4 measures the **value of the kick-back loop**: does machine authoring,
  *given the owner's answers to its own escalations*, produce a contract a cheap
  grunt satisfies at least as well as the (un-kicked-back) human contract, on a
  battery that is neutral between them? It does NOT re-derive the escalations
  (E3 did), does NOT have the model author the answers (the owner does — that is
  the God-gated step), and does NOT re-author the human contract (it is a fixed
  asset; see the asymmetry ruling).
- **Treatment asymmetry (named, not hidden).** Only the warboss arm receives
  God's answers; the human contract is frozen and predates the kick-back. E4 is
  therefore "machine-authoring **with** kick-back vs human-authoring **without**"
  — a test of the loop, not of authoring talent in the abstract. The verdict
  MUST state this. (Symmetric treatment is impossible: the human asset cannot be
  re-authored without inventing a second human, out of scope.)

### God-answers asset (the owner's rulings — the God-gated input)

A JSON asset at `tasks/<task>/god-answers.json`, hand-authored by the owner
(never by a model). Schema:

```json
{
  "task": "duration-parse",
  "answeredAgainstArtifact": "runs/decompose-<ts>.json or e3 run id",
  "rulings": [
    {
      "input": ["120"],
      "expected": "<throws>",
      "throws": true,
      "rationale": "a bare number with no unit is invalid"
    },
    {
      "input": ["1.5h"],
      "expected": 5400,
      "rationale": "fractional hours are accepted: 1.5h = 5400s"
    }
  ]
}
```

- Each ruling is one God battery case. `input` is an arg tuple. Exactly one of
  (`throws: true`) or a concrete `expected` value; when `throws: true`,
  `expected` is the sentinel string `"<throws>"` (matches the hidden/contract
  convention) and is ignored by scoring. `rationale` is owner prose (carried to
  the artifact, NOT into any prompt verbatim — only the decided behavior is).
- The asset MUST cover **at least the three E3-known contested inputs**
  (`"120"`, `" 1h 30m "`, `"1.5h"`); a loader that finds fewer than those three
  inputs present → descriptive throw naming the missing input(s) (kills the
  "partial answers are fine" reading — the whole point is to resolve the known
  gaps). Additional rulings are allowed.
- Duplicate `input` tuples within the asset → descriptive throw.

### God battery (the neutral oracle)

`buildGodBattery(taskHidden, rulings)` → `readonly HiddenCase[]`:

1. Start from `taskHidden` (the task's existing hidden cases), original order.
2. For each ruling, in asset order, produce a `HiddenCase`
   `{ name: "god-<i>-<json-input>", input, expected, throws?, coveredBy: [] }`.
   `coveredBy` is `[]` (God cases are not tied to any public example).
3. **Override rule:** if a ruling's `input` deep-equals an existing hidden
   case's `input`, the ruling REPLACES that case in place (same position, God's
   expected/throws win); otherwise the ruling case is APPENDED after the
   originals, in asset order. (Kills two readings: God never duplicates an input
   in the battery, and God's ruling always wins a conflict — the oracle is
   God's, not the task author's.)
4. Result name-uniqueness is asserted (override keeps the original name; appends
   use the `god-…` name) — a collision throws.

### Re-author with locked decisions

- The re-author is one `decompose` call (HIGH), `maxRequirements: 1`, on the
  SAME public prose intent, with the God rulings rendered into `context` as an
  owner-decided block, exact format:

  ```
  The owner has DECIDED the following behaviors. Treat each as fixed intent —
  they are not open choices; author examples that pin exactly these:
  - parseDuration("120") throws (invalid)
  - parseDuration("1.5h") === 5400
  ...
  ```

  One bullet per ruling. Throwing rulings render as
  `<entry>(<args>) throws (invalid)`; value rulings as `<entry>(<args>) === <json>`.
  `<entry>` is the task's grader entry name. (This is the ONLY place God's answers
  enter authoring; rendering is mechanical, one bullet per ruling, asset order.)
- **Contamination consequence is accepted:** these bullets contain the ruling
  inputs, so the re-authored warboss prompt will contain them; the E2 residual
  filter then excludes those God cases from *scoring* (Constraints above). E4
  does not try to hide the answers from the author it is deliberately informing —
  it relies on the residual filter to keep scoring honest. The verdict reports
  how many God cases survived into the residual.
- The re-author produces a fresh `decompose` artifact written under `out/`
  exactly like `decompose-run` (reused shape) so the warboss contract is
  reconstructable by E2's existing artifact path + hash-integrity guard.

### E2 re-run with a battery override (the only change to `e2.ts`)

`runE2` gains ONE optional field:

```ts
hiddenOverride?: readonly HiddenCase[]; // when present, replaces task.hidden as the scoring battery
```

- When `hiddenOverride` is present, E2 uses it everywhere it currently uses
  `task.hidden`: residual exclusion, `auditNoContamination`, `finalVector`,
  coverage split, the criterion. When absent, behavior is byte-identical to
  rev 2 (every existing E2 test passes unmodified — the field is omitted).
- All other E2 semantics (residual filter, viability guard, hash integrity,
  coverage split, dead-run guard, artifact shape) are inherited unchanged from
  `specs/e2-contract-authorship.spec.md` rev 2 and are NOT restated here.

### Pre-registered E4 criterion

E4 reuses E2's criterion shape and threshold, computed over the God battery:

```ts
interface E4Criterion {
  pass: boolean;          // warboss.meanFinalHiddenScore >= 0.90 * human.meanFinalHiddenScore (God battery)
  detail: string;         // both means, threshold, residual God-case count, exclusion count
}
```

- **PASS iff** `warboss.meanFinalHiddenScore >= 0.90 * human.meanFinalHiddenScore`
  on the God-battery residual. Degenerate guard: `human.meanFinalHiddenScore === 0`
  → `pass: false`, detail names the degenerate baseline (same as E2).
- Sharp pre-registered predictions (recorded, not gating):
  1. On the three contested inputs that survive into the residual, the
     re-authored warboss arm scores **higher** than human (warboss got God's
     answers; human did not) — the loop's signal.
  2. `warboss.meanFinalHiddenScore >= human.meanFinalHiddenScore` overall, and
     the E4 criterion PASSES where E2's FAILED (0.667), because the FAIL was the
     contested cases and those are now authored to God's truth.
  3. If a contested input is excluded from the residual by contamination (its
     God ruling reached the warboss prompt), the verdict must note the signal is
     reduced (we cannot score the very case we informed the author of) — a
     reason to prefer **value** rulings over restating inputs, or to widen the
     filter, recorded as an E4 rev-2 candidate.

### Costs

- `authoringCostUsd` = the re-author `decompose` artifact's `totalCostUsd`
  (HIGH; this run's own re-author spend — unlike E2, E4 authors fresh because it
  injects God's answers).
- `grindingCostUsd` = the E2 sub-run's `grindingCostUsd` (LOW).
- `totalCostUsd` (artifact top-level) = `authoringCostUsd + grindingCostUsd`.

### Options & result

```ts
interface RunE4Options {
  client?: MessagesClient;   // fake for tests; omitted → real client
  task?: string;             // default "duration-parse"
  godAnswers?: string;       // path to god-answers.json; default tasks/<task>/god-answers.json
  n?: number;                // default 30 per source (E2 default)
  granularity?: FeedbackArm; // default "full"
  out?: string;              // default "runs"
  tasksDir?: string;         // default repo tasks dir
  live?: boolean;            // CLI true, tests false
}

interface RunE4Result { readonly deadRun: boolean; }
```

### Artifact

`runs/e4-<ISO8601-basic>.json`:

```json
{
  "config": { "task": "duration-parse", "n": 30, "granularity": "full" },
  "godAnswersPath": "tasks/duration-parse/god-answers.json",
  "rulings": [ /* verbatim from the asset, incl. rationale */ ],
  "reauthorArtifactPath": "runs/decompose-<ts>.json",
  "godBattery": { "total": 0, "fromTask": 0, "fromGod": 0, "overridden": 0 },
  "e2": { /* the full E2 artifact object, hiddenOverride = God battery */ },
  "e4Criterion": { "pass": false, "detail": "…" },
  "authoringCostUsd": 0.0,
  "grindingCostUsd": 0.0,
  "totalCostUsd": 0.0,
  "ledger": [ /* LedgerEntry[] */ ],
  "deadRun": false
}
```

- **Dead-run guard:** `live: true` AND (`totalCostUsd === 0` OR the embedded E2
  sub-run reports `deadRun: true`) → `deadRun: true`, loud `DEAD RUN` warning,
  CLI exits nonzero. Else `false`.
- Emits `cost-ledger-<ts>.jsonl` (one line per call, both phases).

### Module layout & CLI

```text
src/experiment/e4.ts    runE4(opts): exported fn + CLI entry (guarded like e2/e3)
src/experiment/e2.ts    rev 3: hiddenOverride option (the ONLY change to e2.ts)
src/experiment/task.ts  loadGodAnswers(path) helper + buildGodBattery (or co-locate in e4.ts — see ACs)
test/e4.test.ts         AC1–AC9, offline, fake MessagesClient + fixture god-answers + fixture decompose artifact
tasks/duration-parse/god-answers.json   the owner's rulings (hand-authored before the live run)
```

- Export from `e4.ts`: `runE4`, `RunE4Options`, `loadGodAnswers`,
  `buildGodBattery`, `renderOwnerDecisions`, `evaluateE4Criterion` (pure helpers
  so AC1–AC5 unit-test them directly).
- npm script: `"e4": "node --env-file=.env --import tsx src/experiment/e4.ts"`.
- **npm eats `--flags` on Windows** — invoke directly:
  `node --env-file=.env --import tsx src/experiment/e4.ts --n 30`.

## Acceptance criteria (Given / When / Then)

1. **AC1 — god-answers loader.** A valid `god-answers.json` covering the three
   E3 knowns → `loadGodAnswers` returns the rulings verbatim. Variant: asset
   missing `"1.5h"` → descriptive throw naming the missing input. Variant:
   duplicate `input` tuple → descriptive throw.
2. **AC2 — God battery override + append.** `buildGodBattery(taskHidden,
   rulings)` where one ruling's input deep-equals an existing hidden case →
   that case is replaced in place (position preserved, God's expected/throws
   win) and a ruling with a novel input is appended after the originals in asset
   order; `coveredBy` is `[]` for every God case; result names are unique; the
   `god-…` count and overridden count match `godBattery.fromGod` / `.overridden`.
3. **AC3 — owner-decision rendering.** `renderOwnerDecisions(entry, rulings)`
   emits the exact owner-decided block: one bullet per ruling in asset order,
   throwing rulings as `<entry>(<args>) throws (invalid)`, value rulings as
   `<entry>(<args>) === <json(expected)>`; args are `JSON.stringify`-joined by
   `", "`. No bullet for a ruling is omitted (kills the "skip throwing rulings"
   reading).
4. **AC4 — re-author wiring.** `runE4` (fake client scripting a valid rev-4
   single-requirement decompose) calls `decompose` with `maxRequirements: 1`,
   the public prose intent, and a `context` that CONTAINS the rendered
   owner-decision block (capture-assert), tagged `{ experiment: "e4", arm: "author" }`;
   the resulting decompose artifact is written under `out/` and its path is
   recorded in `reauthorArtifactPath`.
5. **AC5 — E4 criterion.** Synthetic per-source analyses: warboss 0.95, human
   1.0 → `pass: true`; warboss 0.80, human 1.0 → `pass: false`; human 0 →
   `pass: false`, degenerate detail. `detail` carries both means, the 0.90
   threshold, residual God-case count, and exclusion count in all cases.
6. **AC6 — e2 hiddenOverride (rev 3).** `runE2({ ..., hiddenOverride: G })`
   scores both arms against `G` (not `task.hidden`): every `finalVector` length
   equals the residual length of `G`, the coverage split partitions `G`'s
   residual, and `auditNoContamination` runs over `G`'s residual. Omitting
   `hiddenOverride` reproduces rev-2 behavior exactly (a pre-existing e2 test,
   re-run, passes unchanged — grep-assert no other e2 behavior changed).
7. **AC7 — contamination of an informed input is excluded, not fatal.** A God
   ruling whose input the re-authored warboss prompt then contains (because the
   owner-decision bullet restated it) → that God case appears in the E2
   `hiddenBattery.excluded` with `leakedBy` including `"warboss"`, sessions run,
   no throw; the artifact's `godBattery` counts and the E2 `residualCount`
   reflect the exclusion. (The residual viability guard from E2 rev 2 still
   applies: if exclusions leave no error or no happy case, E2 throws first — the
   god-answers asset must keep the residual viable; document this in the asset.)
8. **AC8 — end-to-end offline run + costs.** `runE4` with a fake client, `n: 1`,
   fixture god-answers, fixture/ scripted decompose → writes exactly one
   `runs/e4-<ts>.json` + one `cost-ledger-<ts>.jsonl`; artifact carries
   `rulings`, `reauthorArtifactPath`, `godBattery` counts, the embedded `e2`
   object (with the God battery as its scoring set), `e4Criterion`, and
   `authoringCostUsd` / `grindingCostUsd` / `totalCostUsd` equal to their
   ledger-kind sums (`totalCostUsd === authoringCostUsd + grindingCostUsd`).
9. **AC9 — dead-run guard.** `live: true` + a fake client yielding zero grinding
   cost (or whose embedded E2 sub-run is `deadRun: true`) → `deadRun: true` and
   `{ deadRun: true }` returned; same fixture `live: false` → no dead-run
   failure; `live: true` with nonzero scores/cost → `deadRun: false`.

## Verifies-with

- Tests: `test/e4.test.ts` — AC1–AC9, offline, fake `MessagesClient` + fixture
  `god-answers.json` + a fixture decompose artifact (written by the test into a
  temp `out` dir).
- Integration (live, **God-gated — the God-gated step is the owner authoring
  `tasks/duration-parse/god-answers.json` by hand**, NOT a model call):
  1. Owner writes `god-answers.json` covering at least the three E3 knowns
     (`"120"` → throws, `" 1h 30m "` → owner ruling, `"1.5h"` → owner ruling),
     keeping the residual viable (≥1 happy + ≥1 error after exclusion).
  2. `node --env-file=.env --import tsx src/experiment/e4.ts --n 30 --granularity full`
     (~$0.05 HIGH re-author + ~$0.10 LOW grinding ≈ **$0.15**).
  Verdict → `reports/e4-verdict.md`: the per-contested-input scores, the
  overall criterion, the named treatment asymmetry, and the exclusion count.
- Falsifies / experiment link: **E4 pre-registered criterion above.** PASS →
  the kick-back loop closes the E2 gap end-to-end; the delegation bet is won on
  a neutral oracle and the next leg is production wiring (escalations → owner
  queue → re-author in the live `decompose-run` path). FAIL → autopsy: if the
  contested inputs were excluded by contamination, the signal was masked (rev-2
  filter/rendering fix); if they survived and warboss still trails human, the
  re-author did not honor the locked decisions and the owner-decision rendering
  needs a stronger lever (schema-forced per-ruling provenance, the named
  candidate).
