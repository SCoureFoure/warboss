# Spec — E4 battery authoring (close the kick-back loop: God answers, warboss re-authors, re-run on a neutral oracle)

> Status: active · rev 2 · Feature: e4-battery-authoring · Added: 2026-06-13 · Rev 2: 2026-06-13 · Maps to: PLAN Phase 4 follow-on (E3 standing consequence #1) + the delegation bet's end-to-end close.
> **Rev 2 changes** (the H-21 build surfaced rev-1 as un-measurable — both
> deviations in the H-21 report / HANDOFF Leg-7 standing notes):
> (1) **Prose-only owner decisions — the load-bearing fix.** Rev 1's
> `renderOwnerDecisions` wrote the ruling INPUT LITERAL into the warboss
> `context` (`parseDuration("120") throws`), so every contested input leaked
> into the warboss prompt and E2's contamination filter EXCLUDED exactly the
> three cases E4 exists to measure — gutting pre-reg prediction #1. Rev 2 renders
> a literal-free **`decision`** prose statement per ruling (no input string, no
> `entry(args)` form), so the warboss author picks its OWN representative example
> and the contested God-battery cases SURVIVE the residual. A render-time guard
> makes any self-leak a hard error (never a silent exclusion).
> (2) **Single cost-ledger.** Rev 1 emitted two `cost-ledger-*.jsonl` (E4's
> authoring sink + `runE2`'s own grinding sink). Rev 2 threads a shared `Ledger`
> into `runE2` (e2 rev 4 `ledger?` option) so one sidecar carries both phases.
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
  `grindingCostUsd` (this run's E2 spend) as distinct fields; **one**
  `cost-ledger-<ts>.jsonl` sidecar carrying BOTH phases (rev 2: E4 owns the sink
  and passes its `Ledger` into `runE2` via the e2 rev-4 `ledger?` option — no
  second sink).
- **Membrane immutability.** The re-authored warboss contract is frozen by
  `decompose` (warboss stage 6); E4 reconstructs/reuses it through E2's existing
  hash-integrity guard and never edits a frozen contract.
- **Hidden battery never leaks — and the leak surface is now the God battery.**
  The God battery is the scoring oracle; **no God-battery case (input) may
  appear in any prompt** a grunt sees. E2 rev 2's contamination-disjoint
  residual filter is applied to the God battery exactly as it is to `task.hidden`
  (every collided case mechanically excluded and recorded; `auditNoContamination`
  re-run over the residual). **Rev 2: the re-author no longer leaks the contested
  inputs.** The owner decisions are rendered as literal-free PROSE
  (`renderOwnerDecisions`, below) — the warboss author chooses its own
  representative example inputs, so the contested God-battery inputs are NOT in
  the warboss prompt and SURVIVE into the residual (the cases E4 must score). A
  render-time guard throws if any decision string contains its own ruling's input
  literal — a self-leak is a hard error, never a silent exclusion. The general
  residual filter still runs (a warboss-chosen example could coincidentally equal
  a God input → that one case excluded + recorded), and the verdict reports the
  surviving-vs-excluded count, but the contested three are expected to survive.
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
      "decision": "A bare integer with no time unit is invalid input and must throw.",
      "rationale": "the intent says 'duration string', which implies a unit is required"
    },
    {
      "input": ["1.5h"],
      "expected": 5400,
      "decision": "A fractional quantity before a unit is accepted and scaled by that unit; half an hour past an hour count is 5400 seconds.",
      "rationale": "fractional hours are a natural reading of a duration"
    }
  ]
}
```

- Each ruling is one God battery case. `input` is an arg tuple. Exactly one of
  (`throws: true`) or a concrete `expected` value; when `throws: true`,
  `expected` is the sentinel string `"<throws>"` (matches the hidden/contract
  convention) and is ignored by scoring.
- **`decision` (rev 2, REQUIRED, the ONLY field rendered into the prompt):** a
  literal-free prose statement of the required behavior. It states what the
  function must do for this class of input WITHOUT writing the input literal, so
  the warboss author picks its own example and the God-battery input is not
  contaminated. It MAY state the expected OUTPUT value (outputs are never battery
  *inputs*, so they cannot contaminate). The loader THROWS if a `decision`
  contains `JSON.stringify(input element)` for any element of its own `input`
  (the self-leak guard — see `loadGodAnswers`).
- **`rationale` (rev 2, optional, NEVER rendered):** the owner's "why",
  carried to the artifact only; it is not constrained (may contain anything,
  including the input literal — it never reaches a prompt).
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
  SAME public prose intent, with the God decisions rendered into `context` as an
  owner-decided block, exact format (rev 2 — PROSE ONLY, no input literals):

  ```text
  The owner has DECIDED the following behaviors. Treat each as fixed intent —
  they are not open choices; author examples (choosing your own representative
  inputs) that pin exactly these:
  - A bare integer with no time unit is invalid input and must throw.
  - A fractional quantity before a unit is accepted and scaled by that unit; ...
  ...
  ```

  One bullet per ruling, asset order, each bullet = the ruling's `decision`
  string VERBATIM. No `entry(args)` form, no input literal, no `===` (the author
  picks its own examples). This is the ONLY place God's answers enter authoring.
- **Contamination is now PREVENTED, not absorbed (rev 2):** because the bullets
  carry no input literal, the warboss prompt does not contain the contested
  inputs, so they survive into the residual and ARE scored — which is the entire
  point of E4. `renderOwnerDecisions` runs the self-leak guard before returning
  (throws if a `decision` contains its own input literal). The general E2 residual
  filter still runs as a backstop; the verdict reports surviving-vs-excluded
  counts (the contested three are expected to survive).
- The re-author produces a fresh `decompose` artifact written under `out/`
  exactly like `decompose-run` (reused shape) so the warboss contract is
  reconstructable by E2's existing artifact path + hash-integrity guard.

### E2 changes (rev 4 — `hiddenOverride` shipped in rev 3; rev 4 adds `ledger?`)

`hiddenOverride?: readonly HiddenCase[]` shipped in e2 rev 3 (H-21) and is
UNCHANGED: when present E2 uses it everywhere it uses `task.hidden` (residual
exclusion, `auditNoContamination`, `finalVector`, coverage split, criterion);
absent → byte-identical to rev 2.

Rev 4 adds ONE more optional field for the shared-sidecar fix:

```ts
ledger?: Ledger; // rev 4: when present, runE2 meters into THIS ledger and does NOT open its own jsonl sink
```

- When `opts.ledger` is present, `runE2` uses it for every `Agent`/metered call
  and does NOT construct its own `Ledger` or open its own `cost-ledger-*.jsonl`
  sink — the CALLER owns the sink. The artifact's `ledger` array is still the
  metered entries (read from the shared ledger's entries produced during the E2
  phase, or the full ledger — implementer's choice, but `grindingCostUsd` MUST
  equal the sum of the LOW-tier grinding calls only, not authoring).
- When `opts.ledger` is absent, `runE2` behavior is byte-identical to rev 3 (its
  own ledger + its own sidecar). Every existing e2 test passes unmodified (the
  field is omitted).
- All other E2 semantics (residual filter, viability guard, hash integrity,
  coverage split, dead-run guard, artifact shape) are inherited unchanged from
  `specs/e2-contract-authorship.spec.md` and are NOT restated here.

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
  3. The three contested inputs SURVIVE into the residual (rev 2 prose-only
     decisions carry no input literal). If any is still excluded, it means the
     warboss author coincidentally chose that exact input as its own example —
     the verdict notes it, but the prose-only rendering makes this rare, not the
     guaranteed exclusion rev 1 had.

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
src/experiment/e4.ts    rev 2: prose-only renderOwnerDecisions + self-leak guard; E4 owns the shared Ledger
src/experiment/e2.ts    rev 4: add `ledger?` option (rev 3 hiddenOverride already shipped)
test/e4.test.ts         AC1–AC10, offline, fake MessagesClient + fixture god-answers + fixture decompose artifact
tasks/duration-parse/god-answers.json   rev 2: each ruling gains a literal-free `decision`; rewritten contamination-free
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
3. **AC3 — owner-decision rendering (rev 2, PROSE ONLY).** `renderOwnerDecisions(rulings)`
   emits the owner-decided block: one bullet per ruling in asset order, each
   bullet = the ruling's `decision` string VERBATIM. The output contains NO input
   literal (assert: for every ruling, `JSON.stringify(input element)` is NOT a
   substring of the rendered block), NO `entry(args)` form, NO `===`. No bullet
   is omitted (throwing and value rulings both render their `decision`).
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
7. **AC7 — contested inputs SURVIVE the residual (rev 2, replaces rev-1's
   exclude-not-fatal).** `runE4` with prose-only decisions and a scripted warboss
   decompose whose examples use inputs DISTINCT from the contested three → none
   of the three contested God cases appears in `hiddenBattery.excluded`; all
   three are present in the residual and scored (each has an index in the
   coverage split). Variant: a warboss example that coincidentally equals a
   contested input → that one case IS excluded with `leakedBy: ["warboss"]`,
   sessions still run, no throw (the backstop filter). The residual viability
   guard still applies (asset must keep ≥1 happy + ≥1 error after any exclusion).
8. **AC8 — self-leak guard (rev 2).** A god-answers asset whose ruling
   `decision` contains its own input literal (e.g. input `["120"]` with decision
   `"the value 120 throws"`) → `loadGodAnswers` (or `renderOwnerDecisions`)
   THROWS a descriptive error naming the offending ruling, BEFORE any model call.
   A `rationale` containing the input literal does NOT throw (rationale is never
   rendered).
9. **AC9 — end-to-end offline run + single shared ledger (rev 2).** `runE4` with
   a fake client, `n: 1`, fixture god-answers, scripted decompose → writes
   exactly ONE `runs/e4-<ts>.json` AND exactly ONE `cost-ledger-<ts>.jsonl`
   (assert: no second sidecar from `runE2` — `runE2` received `opts.ledger` and
   opened no sink of its own); the single sidecar's lines cover BOTH phases;
   artifact carries `rulings`, `reauthorArtifactPath`, `godBattery` counts, the
   embedded `e2` object, `e4Criterion`, and `authoringCostUsd` / `grindingCostUsd`
   / `totalCostUsd` equal to their ledger-kind sums (`totalCostUsd ===
   authoringCostUsd + grindingCostUsd`).
10. **AC10 — dead-run guard.** `live: true` + a fake client yielding zero
    grinding cost (or whose embedded E2 sub-run is `deadRun: true`) →
    `deadRun: true` and `{ deadRun: true }` returned; same fixture `live: false`
    → no dead-run failure; `live: true` with nonzero scores/cost → `deadRun: false`.

## Verifies-with

- Tests: `test/e4.test.ts` — AC1–AC10, offline, fake `MessagesClient` + fixture
  `god-answers.json` (with `decision` fields) + a fixture decompose artifact
  (written by the test into a temp `out` dir). The rev-1 e4 tests are revised:
  AC3 to prose-only rendering, AC7 to contested-cases-survive, plus new AC8
  (self-leak guard) and AC9 (single shared sidecar).
- Integration (live, **God-gated — the God-gated step is the owner authoring
  `tasks/duration-parse/god-answers.json` by hand**, NOT a model call):
  1. The committed `god-answers.json` already covers the three E3 knowns; rev 2
     requires each ruling to carry a literal-free `decision` (rewrite the rev-1
     rationale-only asset). Keep the residual viable (≥1 happy + ≥1 error).
  2. `node --env-file=.env --import tsx src/experiment/e4.ts --n 30 --granularity full`
     (~$0.05 HIGH re-author + ~$0.10 LOW grinding ≈ **$0.15**).
  Verdict → `reports/e4-verdict.md`: the per-contested-input scores (now
  scorable — they survive), the overall criterion, the named treatment
  asymmetry, and the surviving-vs-excluded count.
- Falsifies / experiment link: **E4 pre-registered criterion above.** PASS →
  the kick-back loop closes the E2 gap end-to-end; the delegation bet is won on
  a neutral oracle and the next leg is production wiring (escalations → owner
  queue → re-author in the live `decompose-run` path). FAIL → autopsy: now that
  the contested inputs survive (rev 2), a FAIL means the re-author did not honor
  the locked decisions — the owner-decision rendering needs a stronger lever
  (schema-forced per-ruling provenance, the named candidate), not a contamination
  excuse.
