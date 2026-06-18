# Spec — E4 battery authoring (close the kick-back loop: Leader answers, warboss re-authors, re-run on a neutral oracle)

> Status: active · rev 4 · Feature: e4-battery-authoring · Added: 2026-06-13 · Rev 2: 2026-06-13 · Rev 3: 2026-06-14 · Rev 4: 2026-06-15 · Maps to: PLAN Phase 4 follow-on (E3 standing consequence #1) + the delegation bet's end-to-end close.
> **Rev 4 change** (the E4 rev-3 rerun — `reports/e4-verdict.md` addendum —
> discharged candidates #2 decimal and #4 replication but left #3 ORDERING
> HAPPY-LIFT open; self-echo is now the dominant residual-erosion mechanism,
> 3/3 exclusions): the warboss author coincidentally echoed the obvious ordering
> ruling inputs (`30m30m`, `30m1h`) as its own examples, so the residual filter
> excluded those exact Leader-battery cases and the ordering class went unscored.
> Rev 4 appends a literal-free authoring-diversity HINT to the SHARED
> `renderDecisionBlock` (`DECISION_DIVERSITY_HINT`, owned by
> `kickback-pipeline.spec.md` rev 2), steering the author toward a distinctive
> representative so the case survives the residual. `renderOwnerDecisions`
> inherits it through the unchanged delegation, so it reaches the e4 author
> context with no `runE4` change. The fix is **probabilistic** (a literal-free
> hint cannot name the inputs to avoid without re-leaking them); offline AC13
> pins only the plumbing, and the **owner-gated e4 rerun is the real proof**.
> The hard guarantee remains `extraCases` (rev 3, AC11).
> **Rev 3 changes** (the E4 live run — `reports/e4-verdict.md`, PASS — left two
> measurement holes; rev 3 closes both, both verdict §Consequence candidates #2
> and #3):
> (1) **Decimal becomes scorable — `extraCases` per ruling.** The E4 run could
> not score the `"1.5h"` decimal case: the warboss author coincidentally chose
> `1.5h` as its own representative example, so the residual filter excluded it
> (prediction #3's backstop fired, 1/3 not 3/3). Rev 3 lets a ruling carry
> `extraCases` — additional held-out battery inputs that exercise the SAME
> decided behavior with DIFFERENT inputs (`"2.5h"→9000`, `"0.5h"→1800`). The
> author can echo at most the canonical input; the extra cases survive the
> residual, so the decided CLASS is scored even when the canonical input
> collides. The decision prose stays literal-free; the self-leak guard now spans
> the canonical input AND every `extraCases` input.
> (2) **Owner happy-path coverage — ordering rulings.** The E4 warboss arm dipped
> to 0.77 on `repeat-units "30m30m"` and `reversed-order "30m1h"` (the re-author
> under-pinned unit ordering). Rev 3 adds owner rulings on those two classes;
> they override the existing happy hidden cases via the unchanged `buildLeaderBattery`
> override path (no new battery code), testing whether the loop lifts the happy
> path too, not just the error path. No harness change beyond `extraCases`; these
> are Leader-authored asset rows.
> **Rev 2 changes** (the H-21 build surfaced rev-1 as un-measurable — both
> deviations in the H-21 report / HANDOFF Leg-7 standing notes):
> (1) **Prose-only owner decisions — the load-bearing fix.** Rev 1's
> `renderOwnerDecisions` wrote the ruling INPUT LITERAL into the warboss
> `context` (`parseDuration("120") throws`), so every contested input leaked
> into the warboss prompt and E2's contamination filter EXCLUDED exactly the
> three cases E4 exists to measure — gutting pre-reg prediction #1. Rev 2 renders
> a literal-free **`decision`** prose statement per ruling (no input string, no
> `entry(args)` form), so the warboss author picks its OWN representative example
> and the contested Leader-battery cases SURVIVE the residual. A render-time guard
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
> underdetermination-free. E4 closes the loop: Leader answers the escalations once;
> those answers become (a) a **neutral oracle battery** (replacing the
> confounded human-coin-flip battery) and (b) **locked decisions** fed back into
> a warboss re-author; then E2 re-runs human-vs-re-authored-warboss against the
> Leader battery. **This is where the kick-back loop earns its cost or does not.**
> Depends on: `specs/warboss-decomposition.spec.md` rev 4 (`decompose`,
> `escalations`), `specs/e2-contract-authorship.spec.md` rev 2 (the comparison
> runner this drives, extended with a battery override), `specs/e3-intent-divergence.spec.md`
> (the escalations this answers), `specs/decompose-run.spec.md` (artifact shape).

## Requirement

Given (a) a task's prose intent and human contract, (b) a **Leader-answers
asset** — the owner's ruling on each contested underdetermined input (the value
or `throws`, with a one-line rationale) — the harness: (1) builds a **Leader
battery** = the task's uncontested hidden cases plus one case per Leader ruling
(rulings override any same-input hidden case); (2) re-authors a warboss contract
by calling `decompose` (HIGH) with the Leader rulings rendered into the decompose
`context` as **owner-decided constraints**; (3) re-runs the E2 comparison
(human contract vs the re-authored warboss contract, same LOW grunt, same loop)
scoring **both** arms against the Leader battery via E2's contamination-disjoint
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
- **Hidden battery never leaks — and the leak surface is now the Leader battery.**
  The Leader battery is the scoring oracle; **no Leader-battery case (input) may
  appear in any prompt** a grunt sees. E2 rev 2's contamination-disjoint
  residual filter is applied to the Leader battery exactly as it is to `task.hidden`
  (every collided case mechanically excluded and recorded; `auditNoContamination`
  re-run over the residual). **Rev 2: the re-author no longer leaks the contested
  inputs.** The owner decisions are rendered as literal-free PROSE
  (`renderOwnerDecisions`, below) — the warboss author chooses its own
  representative example inputs, so the contested Leader-battery inputs are NOT in
  the warboss prompt and SURVIVE into the residual (the cases E4 must score). A
  render-time guard throws if any decision string contains its own ruling's input
  literal — a self-leak is a hard error, never a silent exclusion. The general
  residual filter still runs (a warboss-chosen example could coincidentally equal
  a Leader input → that one case excluded + recorded), and the verdict reports the
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
  the Leader-gated step), and does NOT re-author the human contract (it is a fixed
  asset; see the asymmetry ruling).
- **Treatment asymmetry (named, not hidden).** Only the warboss arm receives
  Leader's answers; the human contract is frozen and predates the kick-back. E4 is
  therefore "machine-authoring **with** kick-back vs human-authoring **without**"
  — a test of the loop, not of authoring talent in the abstract. The verdict
  MUST state this. (Symmetric treatment is impossible: the human asset cannot be
  re-authored without inventing a second human, out of scope.)

### Leader-answers asset (the owner's rulings — the Leader-gated input)

A JSON asset at `tasks/<task>/leader-answers.json`, hand-authored by the owner
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
      "rationale": "fractional hours are a natural reading of a duration",
      "extraCases": [
        { "input": ["2.5h"], "expected": 9000 },
        { "input": ["0.5h"], "expected": 1800 }
      ]
    },
    {
      "input": ["30m30m"],
      "expected": 3600,
      "decision": "When the same unit appears more than once, the quantities for that unit are summed.",
      "rationale": "repeated units are additive (ordering ruling, rev 3)"
    },
    {
      "input": ["30m1h"],
      "expected": 5400,
      "decision": "Units may appear in any order; the total is the sum of all unit quantities regardless of the order they are written.",
      "rationale": "order-independence (ordering ruling, rev 3)"
    }
  ]
}
```

- Each ruling is one Leader battery case. `input` is an arg tuple. Exactly one of
  (`throws: true`) or a concrete `expected` value; when `throws: true`,
  `expected` is the sentinel string `"<throws>"` (matches the hidden/contract
  convention) and is ignored by scoring.
- **`decision` (rev 2, REQUIRED, the ONLY field rendered into the prompt):** a
  literal-free prose statement of the required behavior. It states what the
  function must do for this class of input WITHOUT writing the input literal, so
  the warboss author picks its own example and the Leader-battery input is not
  contaminated. It MAY state the expected OUTPUT value (outputs are never battery
  *inputs*, so they cannot contaminate). The loader THROWS if a `decision`
  contains `JSON.stringify(input element)` for any element of its own `input`
  (the self-leak guard — see `loadLeaderAnswers`).
- **`rationale` (rev 2, optional, NEVER rendered):** the owner's "why",
  carried to the artifact only; it is not constrained (may contain anything,
  including the input literal — it never reaches a prompt).
- **`extraCases` (rev 3, optional, NEVER rendered):** an array of
  `{ input, expected, throws? }` — additional held-out battery cases that
  exercise the SAME decided behavior with DIFFERENT inputs. They share the
  ruling's single `decision` (which is rendered ONCE, literal-free); the extra
  inputs are battery inputs only, never reaching a prompt. Purpose: when the
  warboss author coincidentally echoes the canonical `input` as its own example
  (excluding that one case from the residual), the extra cases survive so the
  decided CLASS is still scored. Each `extraCases` entry follows the same
  `throws`/`expected` convention as a ruling. The **self-leak guard (rev 3) now
  spans the canonical `input` AND every `extraCases` input** — `decision` must
  contain `JSON.stringify` of none of them. Duplicate inputs across a ruling's
  `input` + its `extraCases` (or against another ruling) → descriptive throw.
- The asset MUST cover **at least the three E3-known contested inputs**
  (`"120"`, `" 1h 30m "`, `"1.5h"`); a loader that finds fewer than those three
  inputs present → descriptive throw naming the missing input(s) (kills the
  "partial answers are fine" reading — the whole point is to resolve the known
  gaps). Additional rulings are allowed.
- Duplicate `input` tuples within the asset → descriptive throw.

### Leader battery (the neutral oracle)

`buildLeaderBattery(taskHidden, rulings)` → `readonly HiddenCase[]`:

1. Start from `taskHidden` (the task's existing hidden cases), original order.
2. For each ruling, in asset order, produce a `HiddenCase`
   `{ name: "leader-<i>-<json-input>", input, expected, throws?, coveredBy: [] }`.
   `coveredBy` is `[]` (Leader cases are not tied to any public example).
3. **Override rule:** if a ruling's `input` deep-equals an existing hidden
   case's `input`, the ruling REPLACES that case in place (same position, Leader's
   expected/throws win); otherwise the ruling case is APPENDED after the
   originals, in asset order. (Kills two readings: Leader never duplicates an input
   in the battery, and Leader's ruling always wins a conflict — the oracle is
   Leader's, not the task author's.)
4. **`extraCases` (rev 3):** after a ruling's canonical case is placed
   (overridden or appended), each of its `extraCases` entries is processed by the
   SAME override-or-append rule, in array order, immediately after the canonical
   case (a `leader-<i>-<json-input>` name when appended; override in place if its
   input deep-equals an existing case). Extra cases carry `coveredBy: []` like
   any Leader case.
5. Result name-uniqueness is asserted (override keeps the original name; appends
   use the `leader-…` name) — a collision throws.

### Re-author with locked decisions

- The re-author is one `decompose` call (HIGH), `maxRequirements: 1`, on the
  SAME public prose intent, with the Leader decisions rendered into `context` as an
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
  picks its own examples). This is the ONLY place Leader's answers enter authoring.
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

E4 reuses E2's criterion shape and threshold, computed over the Leader battery:

```ts
interface E4Criterion {
  pass: boolean;          // warboss.meanFinalHiddenScore >= 0.90 * human.meanFinalHiddenScore (Leader battery)
  detail: string;         // both means, threshold, residual Leader-case count, exclusion count
}
```

- **PASS iff** `warboss.meanFinalHiddenScore >= 0.90 * human.meanFinalHiddenScore`
  on the Leader-battery residual. Degenerate guard: `human.meanFinalHiddenScore === 0`
  → `pass: false`, detail names the degenerate baseline (same as E2).
- Sharp pre-registered predictions (recorded, not gating):
  1. On the three contested inputs that survive into the residual, the
     re-authored warboss arm scores **higher** than human (warboss got Leader's
     answers; human did not) — the loop's signal.
  2. `warboss.meanFinalHiddenScore >= human.meanFinalHiddenScore` overall, and
     the E4 criterion PASSES where E2's FAILED (0.667), because the FAIL was the
     contested cases and those are now authored to Leader's truth.
  3. The three contested inputs SURVIVE into the residual (rev 2 prose-only
     decisions carry no input literal). If any is still excluded, it means the
     warboss author coincidentally chose that exact input as its own example —
     the verdict notes it, but the prose-only rendering makes this rare, not the
     guaranteed exclusion rev 1 had.

### Costs

- `authoringCostUsd` = the re-author `decompose` artifact's `totalCostUsd`
  (HIGH; this run's own re-author spend — unlike E2, E4 authors fresh because it
  injects Leader's answers).
- `grindingCostUsd` = the E2 sub-run's `grindingCostUsd` (LOW).
- `totalCostUsd` (artifact top-level) = `authoringCostUsd + grindingCostUsd`.

### Options & result

```ts
interface RunE4Options {
  client?: MessagesClient;   // fake for tests; omitted → real client
  task?: string;             // default "duration-parse"
  leaderAnswers?: string;       // path to leader-answers.json; default tasks/<task>/leader-answers.json
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
  "leaderAnswersPath": "tasks/duration-parse/leader-answers.json",
  "rulings": [ /* verbatim from the asset, incl. rationale */ ],
  "reauthorArtifactPath": "runs/decompose-<ts>.json",
  "leaderBattery": { "total": 0, "fromTask": 0, "fromLeader": 0, "overridden": 0 },
  "e2": { /* the full E2 artifact object, hiddenOverride = Leader battery */ },
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
src/kickback.ts         rev 4 (kickback rev 2): renderDecisionBlock appends DECISION_DIVERSITY_HINT — inherited by renderOwnerDecisions, no e4 code change
src/experiment/e4.ts    rev 3: LeaderRuling gains optional `extraCases`; loadLeaderAnswers + buildLeaderBattery + self-leak guard span extra inputs. (rev 2: prose-only renderOwnerDecisions + self-leak guard; E4 owns the shared Ledger) — UNCHANGED in rev 4
src/experiment/e2.ts    rev 4: add `ledger?` option (rev 3 hiddenOverride already shipped) — UNCHANGED in e4 rev 3
test/e4.test.ts         AC1–AC13, offline; rev 4 adds AC13 (diversity hint reaches author context); rev 3 adds AC11 (extraCases + decimal survives collision) + AC12 (ordering overrides)
tasks/duration-parse/leader-answers.json   rev 3: decimal ruling gains `extraCases` (2.5h, 0.5h); two ordering rulings added (30m30m, 30m1h)
```

> **Rev 3 promotion note:** `renderOwnerDecisions` is also being factored to call
> the shared `renderDecisionBlock` from `src/kickback.ts` (see
> `specs/kickback-pipeline.spec.md`). That refactor is byte-output-identical and
> is owned by the kickback-pipeline item, not this one — e4 rev 3 only adds
> `extraCases`. If both ship together, the e4 grunt rebases onto the promoted
> `renderDecisionBlock`; if e4 rev 3 ships first, `renderOwnerDecisions` stays
> self-contained and the kickback item does the factor-out.

- Export from `e4.ts`: `runE4`, `RunE4Options`, `loadLeaderAnswers`,
  `buildLeaderBattery`, `renderOwnerDecisions`, `evaluateE4Criterion` (pure helpers
  so AC1–AC5 unit-test them directly).
- npm script: `"e4": "node --env-file=.env --import tsx src/experiment/e4.ts"`.
- **npm eats `--flags` on Windows** — invoke directly:
  `node --env-file=.env --import tsx src/experiment/e4.ts --n 30`.

## Acceptance criteria (Given / When / Then)

1. **AC1 — leader-answers loader.** A valid `leader-answers.json` covering the three
   E3 knowns → `loadLeaderAnswers` returns the rulings verbatim. Variant: asset
   missing `"1.5h"` → descriptive throw naming the missing input. Variant:
   duplicate `input` tuple → descriptive throw.
2. **AC2 — Leader battery override + append.** `buildLeaderBattery(taskHidden,
   rulings)` where one ruling's input deep-equals an existing hidden case →
   that case is replaced in place (position preserved, Leader's expected/throws
   win) and a ruling with a novel input is appended after the originals in asset
   order; `coveredBy` is `[]` for every Leader case; result names are unique; the
   `leader-…` count and overridden count match `leaderBattery.fromLeader` / `.overridden`.
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
   threshold, residual Leader-case count, and exclusion count in all cases.
6. **AC6 — e2 hiddenOverride (rev 3).** `runE2({ ..., hiddenOverride: G })`
   scores both arms against `G` (not `task.hidden`): every `finalVector` length
   equals the residual length of `G`, the coverage split partitions `G`'s
   residual, and `auditNoContamination` runs over `G`'s residual. Omitting
   `hiddenOverride` reproduces rev-2 behavior exactly (a pre-existing e2 test,
   re-run, passes unchanged — grep-assert no other e2 behavior changed).
7. **AC7 — contested inputs SURVIVE the residual (rev 2, replaces rev-1's
   exclude-not-fatal).** `runE4` with prose-only decisions and a scripted warboss
   decompose whose examples use inputs DISTINCT from the contested three → none
   of the three contested Leader cases appears in `hiddenBattery.excluded`; all
   three are present in the residual and scored (each has an index in the
   coverage split). Variant: a warboss example that coincidentally equals a
   contested input → that one case IS excluded with `leakedBy: ["warboss"]`,
   sessions still run, no throw (the backstop filter). The residual viability
   guard still applies (asset must keep ≥1 happy + ≥1 error after any exclusion).
8. **AC8 — self-leak guard (rev 2).** A leader-answers asset whose ruling
   `decision` contains its own input literal (e.g. input `["120"]` with decision
   `"the value 120 throws"`) → `loadLeaderAnswers` (or `renderOwnerDecisions`)
   THROWS a descriptive error naming the offending ruling, BEFORE any model call.
   A `rationale` containing the input literal does NOT throw (rationale is never
   rendered).
9. **AC9 — end-to-end offline run + single shared ledger (rev 2).** `runE4` with
   a fake client, `n: 1`, fixture leader-answers, scripted decompose → writes
   exactly ONE `runs/e4-<ts>.json` AND exactly ONE `cost-ledger-<ts>.jsonl`
   (assert: no second sidecar from `runE2` — `runE2` received `opts.ledger` and
   opened no sink of its own); the single sidecar's lines cover BOTH phases;
   artifact carries `rulings`, `reauthorArtifactPath`, `leaderBattery` counts, the
   embedded `e2` object, `e4Criterion`, and `authoringCostUsd` / `grindingCostUsd`
   / `totalCostUsd` equal to their ledger-kind sums (`totalCostUsd ===
   authoringCostUsd + grindingCostUsd`).
10. **AC10 — dead-run guard.** `live: true` + a fake client yielding zero
    grinding cost (or whose embedded E2 sub-run is `deadRun: true`) →
    `deadRun: true` and `{ deadRun: true }` returned; same fixture `live: false`
    → no dead-run failure; `live: true` with nonzero scores/cost → `deadRun: false`.
11. **AC11 — `extraCases` enter the battery + decimal-class survives a canonical
    collision (rev 3).** `buildLeaderBattery` with a ruling `{ input: ["1.5h"],
    expected: 5400, extraCases: [{ input: ["2.5h"], expected: 9000 }, { input:
    ["0.5h"], expected: 1800 }] }` → all three inputs appear as distinct Leader
    cases (canonical + 2 extras), names unique, `coveredBy: []`. End-to-end
    variant: `runE4` with a scripted warboss decompose whose example coincidentally
    uses `1.5h` → `hiddenBattery.excluded` contains the canonical `1.5h` case
    (`leakedBy: ["warboss"]`) BUT both `2.5h` and `0.5h` survive the residual and
    are scored — the decimal CLASS has ≥1 scored residual case (the rev-2
    measurement hole is closed). Self-leak guard (rev 3): a decision containing
    `"2.5h"` (an extra input) → `loadLeaderAnswers` throws naming that extra input.
12. **AC12 — ordering rulings override happy cases (rev 3).** `buildLeaderBattery`
    with rulings on `["30m30m"]→3600` and `["30m1h"]→5400` whose inputs
    deep-equal existing `repeat-units` / `reversed-order` hidden cases → those two
    cases are REPLACED in place (position + name preserved, Leader's `expected`
    wins, `coveredBy: []`); `leaderBattery.overridden` counts them. `renderOwnerDecisions`
    emits their literal-free `decision` bullets (no `"30m30m"` / `"30m1h"`
    substring in the block). No new battery code path — pure override reuse.
13. **AC13 — authoring-diversity hint reaches the author context (rev 4).**
    `renderOwnerDecisions` (which `runE4` feeds VERBATIM into the decompose
    `context`) includes `DECISION_DIVERSITY_HINT` (inherited from the shared
    `renderDecisionBlock` — `kickback-pipeline.spec.md` rev 2), while staying
    literal-free (no ruling input substring) with the bullet count unchanged.
    **Why (candidate #3, ordering happy-lift):** the E4 rev-3 rerun
    (`reports/e4-verdict.md` addendum) left ordering unscored because the warboss
    author echoed the obvious ruling inputs (`30m30m`, `30m1h`) as its own
    examples → the residual filter excluded those exact Leader-battery cases. The
    hint steers the author toward a distinctive representative so the case
    survives the residual. This AC pins only the **plumbing** (the hint reaches
    the author prompt); whether the live author stops echoing is **probabilistic**
    and measured by the **owner-gated e4 rerun**, not offline. The hard guarantee
    stays `extraCases` (AC11); the hint is the global discipline lever for #3.

## Verifies-with

- Tests: `test/e4.test.ts` — AC1–AC13, offline, fake `MessagesClient` + fixture
  `leader-answers.json` (with `decision` fields) + a fixture decompose artifact
  (written by the test into a temp `out` dir). The rev-1 e4 tests are revised:
  AC3 to prose-only rendering, AC7 to contested-cases-survive, plus new AC8
  (self-leak guard) and AC9 (single shared sidecar).
- Integration (live, **Leader-gated — the Leader-gated step is the owner authoring
  `tasks/duration-parse/leader-answers.json` by hand**, NOT a model call):
  1. The committed `leader-answers.json` already covers the three E3 knowns; rev 2
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
