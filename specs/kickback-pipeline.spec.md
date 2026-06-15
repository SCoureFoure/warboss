# Spec — kick-back pipeline (escalations → owner-answer queue → re-author, in the live path)

> Status: active · rev 2 · Feature: kickback-pipeline · Added: 2026-06-14 · Rev 2: 2026-06-15 · Maps to: PLAN Phase 4 follow-on (E4 standing consequence #1 — production wiring; rev 2 = E4 consequence #3, ordering happy-lift).
> **Rev 2 change** (E4 rev-3 rerun left candidate #3 open — `reports/e4-verdict.md`
> addendum): the shared `renderDecisionBlock` now appends a literal-free
> authoring-diversity HINT after the bullets when ≥1 decision is present
> (`DECISION_DIVERSITY_HINT`). The E4 rev-3 rerun showed self-echo is the dominant
> residual-erosion mechanism (3/3 exclusions): the warboss author coincidentally
> chose a ruling's obvious input (`30m30m`, `30m1h`) as its own representative
> example, so the residual filter excluded that exact God-battery case and the
> ordering class went unscored. The hint steers the author toward a distinctive
> representative, lowering the echo probability so the case survives the residual.
> It is **global** (one change in the shared renderer, so E4 and the live path
> share it) and **benign in the live path** — there is no scoring battery there,
> and a distinctive example pins a real contract just as well. The fix is
> **probabilistic, not a guarantee**: a literal-free hint cannot name the inputs
> to avoid (naming them would re-leak the literals and re-contaminate the
> measurement — the whole reason the block is prose-only). Offline ACs pin the
> hint plumbing; the owner-gated e4 rerun is the only real proof it holds. The
> hard guarantee remains `extraCases` (e4 spec rev 3); the hint is the global
> discipline lever chosen for candidate #3.
> Source of truth for the STANDING (non-experiment) kick-back loop: the live
> `decompose-run` path emits a machine-readable owner-answer queue from its
> escalations; the owner answers by hand; a re-author pass folds those answers
> back into a fresh decompose. This promotes the E4-proven mechanism
> (`renderOwnerDecisions`, owner-decided context) out of the experiment harness
> into the product path.
> Depends on: `specs/warboss-decomposition.spec.md` rev 4 (`decompose` +
> `escalations`), `specs/decompose-run.spec.md` rev 2 (the live runner +
> artifact shape this extends), `specs/e4-battery-authoring.spec.md` rev 2 (the
> decision-block prose format this promotes to a shared module).

## Requirement

E4 proved offline that once the owner answers the author tier's escalations, a
re-authored contract closes the gap (`reports/e4-verdict.md`, PASS). E4 did this
inside the experiment runner with a God-answers asset and a scoring battery.
**This spec wires the same loop into the live `decompose-run` path as a standing
two-phase stage, with no scoring battery** (production freezes real contracts;
there is no held-out oracle):

1. **Phase 1 — emit.** When `decompose` produces a non-empty `escalations`
   array, `runDecompose` writes an **owner-answer queue** file
   `answers-needed-<ts>.json` beside the decompose artifact: one stub per
   escalation, each with a blank `decision` for the owner to fill by hand.
2. **Phase 2 — answer (God-gated, off-harness).** The owner hand-fills each
   `decision` with a prose ruling. No model authors the answers — exactly the
   E4 God-gate, now a standing manual step.
3. **Phase 3 — re-author.** `decompose-run` in `--reauthor-from <artifact>
   --answers <queue>` mode loads the original intent + context from the source
   artifact, appends the filled owner decisions as an owner-decided prose block
   (the promoted `renderDecisionBlock`), re-runs `decompose` + `admit`, and
   writes a new artifact carrying provenance (`reauthorOf`, `answersPath`). If
   the re-author still escalates, it emits a fresh `answers-needed-<ts>.json` —
   the loop iterates until the escalations drain (or the owner stops).

The decision-block rendering currently living in `src/experiment/e4.ts`
(`renderOwnerDecisions`) is promoted to a shared `src/kickback.ts` so the
experiment path and the live path share ONE canonical prose format and cannot
drift.

## Constraints (inherited)

- **Cost-metered.** Re-author is a HIGH-tier `decompose` + LOW-tier `admit`
  through the same `Ledger`/`jsonlFileSink` as a first-pass `decompose-run`; the
  re-author writes its own `cost-ledger-<ts>.jsonl` exactly like any
  `decompose-run` invocation (it IS one). No un-metered path.
- **Membrane immutability.** The re-authored contracts are frozen by `decompose`
  (warboss stage 6); the runner never edits a frozen contract. A re-author does
  not mutate the source artifact — it writes a new one.
- **No hidden battery in the live path.** Unlike E4 there is no held-out oracle
  here, so there is **no self-leak guard** and no residual filter: owner
  decisions may name input literals freely (they shape the real contract; there
  is nothing to contaminate). This distinction from E4 is pinned below.
- **Grunt is a doer, not a planner.** The runner composes `decompose` + `admit`;
  it adds no loop logic of its own and never re-validates or re-parses model
  output (decompose-run rule, inherited).

## Decisions (pinned 2026-06-14)

### What this is NOT

- **Not a scoring run.** There is no battery, no `hiddenOverride`, no criterion.
  The output is frozen contracts + a (possibly empty) residual escalation set,
  same as today's `decompose-run` — only now the escalations have a structured
  answer path and a re-author that consumes it.
- **Not automated answering.** Phase 2 is manual and off-harness by design
  (the God-gate). The harness emits the queue and consumes the filled queue; it
  never fills a `decision`.

### Shared module — `src/kickback.ts`

Promotes the E4 prose format and adds the production queue types/loaders. Pure
(no model calls); fully offline-unit-testable.

```ts
// The canonical owner-decision prose block — the EXACT text E4's
// renderOwnerDecisions emits today, factored out so both paths share it.
export function renderDecisionBlock(decisions: readonly string[]): string;

export interface OwnerAnswer {
  readonly escalation: string;     // the escalation string VERBATIM (the question)
  readonly requirementId: string;  // parsed from the escalation's "<id>: …" prefix; "" if absent
  readonly decision: string;       // owner-authored prose; "" in the emitted stub, MUST be filled before phase 3
}

export interface AnswerQueue {
  readonly intent: string;
  readonly context: string | null;
  readonly artifact: string;       // path to the SOURCE decompose artifact this queue answers
  readonly answers: readonly OwnerAnswer[];
}

// Build the phase-1 stub queue from a decompose run's escalations.
export function buildAnswerQueue(args: {
  intent: string;
  context: string | null;
  artifactPath: string;
  escalations: readonly string[];
}): AnswerQueue;

// Load + validate a hand-filled queue (phase 3 input).
export function loadOwnerAnswers(path: string): Promise<AnswerQueue>;
```

- **`renderDecisionBlock(decisions)`** emits, VERBATIM, the block E4 pins:

  ```text
  The owner has DECIDED the following behaviors. Treat each as fixed intent —
  they are not open choices; author examples (choosing your own representative
  inputs) that pin exactly these:
  - <decision[0] verbatim>
  - <decision[1] verbatim>
  …
  ```

  One bullet per decision, input order, each bullet the decision string
  VERBATIM. `renderDecisionBlock([])` returns the three header lines with no
  bullets (empty decision list is a caller error upstream, not here).
  **Rev 2:** when ≥1 decision is present, the exported `DECISION_DIVERSITY_HINT`
  is appended as a single trailing line after the bullets, separated by a blank
  line: `… - <last decision>\n\n<hint>`. The hint is literal-free, does not start
  with a `-` bullet marker (so it is not a bullet) and carries no
  `entry(args)`/`===` form, and is
  ABSENT from the empty-list output (that output is byte-unchanged from rev 1).
  The three header lines (including the trailing `inputs) that pin exactly
  these:`) are byte-unchanged, so the parity with `renderOwnerDecisions` and all
  rev-1 `.includes`/bullet-count assertions still hold.
- **`buildAnswerQueue`** produces one `OwnerAnswer` per escalation, in
  escalation order, with `decision: ""`. `requirementId` is the substring of the
  escalation before the first `": "` **iff** that prefix matches the warboss id
  grammar `/^[a-z][a-z0-9-]*$/` (the `<id>: fiat — …` / `<id>: intent-undecided
  — …` format); otherwise `""`. (Kills the reading that any text before a colon
  is an id.)
- **`loadOwnerAnswers(path)`** throws a descriptive error, BEFORE any model
  call, if: the file is unreadable / not valid JSON; `answers` is absent / not
  an array / empty; **any** answer's `decision` is empty or whitespace-only
  (kills "partial answers are fine" — every escalation must be ruled on, the E4
  all-knowns-covered discipline); or two answers carry the same `escalation`
  string. On success it returns the parsed `AnswerQueue` verbatim.

### E4 refactor (no behavior change)

`src/experiment/e4.ts` `renderOwnerDecisions(rulings)` becomes: run its existing
self-leak guard, then `return renderDecisionBlock(rulings.map(r => r.decision))`.
The emitted string is byte-identical to today's; every existing e4 test passes
unmodified. (The self-leak guard stays in e4 — it is battery-specific and has no
analogue in the battery-free live path.)

### Phase 1 — queue emission in `decompose-run`

In `runDecompose`, after the artifact is written: **iff
`draftSet.escalations.length > 0`**, write
`answers-needed-<ts>.json` (same `<ts>` as the artifact) into `outDir` =
`buildAnswerQueue({ intent, context, artifactPath, escalations })`, pretty JSON.
`RunDecomposeResult` gains `answerQueuePath?: string` (present only when a queue
was written). Console adds one line: `escalations: <n> → <answers-needed path>
(fill 'decision' for each, then re-run with --reauthor-from <artifact>
--answers <queue>)`. Zero escalations → no queue file, no `answerQueuePath`, no
extra console line. Emission is independent of `live` (deterministic file
output, so offline tests assert it).

### Phase 3 — re-author mode in `decompose-run`

Two new CLI flags, both-or-neither:

- `--reauthor-from <artifact-path>` — the SOURCE decompose artifact.
- `--answers <queue-path>` — the hand-filled `answers-needed-*.json`.

`parseCliArgs` rules (extends the existing exactly-one-of `--intent`/`--intent-file`):

- `--reauthor-from` and `--answers` must be given together; one without the
  other → descriptive throw.
- Re-author mode is **mutually exclusive** with `--intent`/`--intent-file`:
  giving an intent flag alongside `--reauthor-from` → descriptive throw (the
  intent comes from the source artifact, not the CLI).
- `--context`, `--max-requirements`, `--out` remain honored in both modes.

Re-author flow (in `runDecompose`, gated on a new `reauthorFrom?` / `answers?`
options pair):

1. Read + JSON-parse the source artifact; take its `intent` and `context`.
2. `loadOwnerAnswers(answers)` → validated queue (all decisions filled).
3. **Provenance cross-check:** if `basename(queue.artifact) !==
   basename(reauthorFrom)` → descriptive throw (answering the wrong run is a
   hard error). Compared by basename so relative/absolute path forms match.
4. Build the re-author context: `sourceContext` (the source artifact's
   `context`, or `""` when null) + (if non-empty) `"\n\n"` +
   `renderDecisionBlock(queue.answers.map(a => a.decision))`. (When the source
   had no context, the re-author context is just the block. Round-N re-authors
   inherit round-(N−1)'s decisions through the source context, so decisions
   accumulate.)
5. Run the normal `decompose` (HIGH, `maxRequirements` passthrough) + `admit`
   (probe-only, empty probes — identical to a first-pass run) with the source
   `intent` and the re-author context, tags `{ run: "reauthor-live" }`.
6. Write a new `decompose-<ts>.json` with the SAME `DecomposeArtifact` shape
   PLUS provenance: `reauthorOf: <reauthorFrom path>` and `answersPath:
   <answers path>`. Healthy first-pass runs OMIT both keys (like `deadRun`).
7. The re-author IS a `decompose-run`, so phase 1 re-applies to it: if its own
   `escalations` are non-empty it emits a fresh `answers-needed-<ts>.json` (loop
   iterates). Dead-run guard unchanged (`live` + zero ledger cost or zero
   requirements).

### Module layout & CLI

```text
src/kickback.ts                     NEW — renderDecisionBlock, OwnerAnswer/AnswerQueue, buildAnswerQueue, loadOwnerAnswers
src/experiment/e4.ts                renderOwnerDecisions → thin wrapper over renderDecisionBlock (no behavior change)
src/experiment/decompose-run.ts     phase-1 queue emit + phase-3 reauthor mode + provenance fields
test/kickback.test.ts               NEW — AC1–AC4 (pure module), offline
test/decompose-run.test.ts          AC5–AC9 added beside existing cases, offline fake client + fixture artifact/queue
```

No new npm script — re-author reuses the existing `decompose` script with the
new flags. **npm eats `--flags` on Windows** — invoke directly:
`node --env-file=.env --import tsx src/experiment/decompose-run.ts --reauthor-from runs/decompose-<ts>.json --answers runs/answers-needed-<ts>.json`.

## Acceptance criteria (Given / When / Then)

1. **AC1 — `renderDecisionBlock` format + E4 parity.** Given decisions `["A.",
   "B."]` → output is the three pinned header lines then `- A.` and `- B.`, in
   order, verbatim. Given e4's three rulings' decision strings, the output
   equals what `renderOwnerDecisions` returns for those rulings (parity assert:
   import both, compare). `renderDecisionBlock([])` → header lines only, no
   bullet.
2. **AC2 — `buildAnswerQueue` stubbing + id parse.** Given escalations
   `["bare-number: fiat — … → throws", "no colon here", "Bad Id: intent-undecided
   — …"]` → three `OwnerAnswer`s in order, each `decision: ""`; `requirementId`
   is `"bare-number"`, `""` (no `": "`), and `""` (`"Bad Id"` fails the id
   grammar) respectively. `intent`, `context`, `artifact` echo the args.
3. **AC3 — `loadOwnerAnswers` happy path.** A queue file with every `decision`
   filled (non-blank) and unique escalations → returns the parsed `AnswerQueue`
   verbatim (intent, context, artifact, answers all preserved).
4. **AC4 — `loadOwnerAnswers` guards.** Each → a descriptive throw, before any
   model call: (a) unreadable path; (b) invalid JSON; (c) `answers` missing /
   not array / `[]`; (d) one answer with `decision: ""`; (e) one answer with
   `decision: "   "` (whitespace-only); (f) two answers sharing an `escalation`
   string. The blank-decision message names the offending escalation.
5. **AC5 — phase-1 emit when escalations present.** `runDecompose` (fake client
   scripting a valid rev-4 decompose whose audit/resolutions yield ≥1 escalation)
   → writes `answers-needed-<ts>.json` in `outDir` with the SAME `<ts>` as the
   `decompose-<ts>.json`; the queue has one stubbed answer per escalation (blank
   decisions, parsed ids), and `RunDecomposeResult.answerQueuePath` points at it.
6. **AC6 — phase-1 silent when no escalations.** Same runner with a scripted
   decompose yielding zero escalations → NO `answers-needed-*.json` is written
   and `answerQueuePath` is absent/undefined.
7. **AC7 — phase-3 re-author wiring.** `runDecompose({ reauthorFrom, answers })`
   with a fixture source artifact (intent `I`, context `C`) and a filled queue
   → `decompose` is called with intent `I` and a context that CONTAINS `C` AND
   the rendered decision block (capture-assert), tagged `{ run: "reauthor-live"
   }`; the new artifact carries `reauthorOf` = the source path and `answersPath`
   = the queue path; a first-pass (non-reauthor) run omits both keys. Variant:
   source artifact with `context: null` → re-author context is exactly the
   decision block (no leading separator).
8. **AC8 — phase-3 provenance + arg guards.** `parseCliArgs`: `--reauthor-from`
   without `--answers` (and vice-versa) → throw; `--reauthor-from` together with
   `--intent` → throw; `--reauthor-from` + `--answers` (no intent) → options
   carry `reauthorFrom`/`answers` and NO `intent`. In `runDecompose`, a queue
   whose `artifact` basename ≠ the `reauthorFrom` basename → descriptive throw
   before any model call.
9. **AC9 — re-author iterates.** A re-author run whose own scripted decompose
   STILL yields ≥1 escalation → it writes its own `answers-needed-<ts>.json`
   (phase-1 re-applied to the re-author artifact), so the loop can continue;
   that fresh queue's `artifact` points at the NEW (re-author) artifact, not the
   source.
10. **AC10 (rev 2) — authoring-diversity hint.** Given decisions `["A.", "B."]`
    → `DECISION_DIVERSITY_HINT` appears in the output, AFTER the last bullet
    (`indexOf(hint) > lastIndexOf("- B.")`); the bullet count is still exactly 2
    (the hint is not a bullet); the third header line `inputs) that pin exactly
    these:` is still present verbatim; the hint contains no `entry(args)` form
    and no `===`. Given `[]` → the hint is ABSENT (header-only output unchanged
    from rev 1). (E4 inherits the hint through the unchanged
    `renderOwnerDecisions` delegation — see `e4-battery-authoring.spec.md` rev 4
    AC13; the live author-prompt effect is measured by the owner-gated e4 rerun,
    not asserted offline.)

## Verifies-with

- Tests: `test/kickback.test.ts` (AC1–AC4, pure/offline) +
  `test/decompose-run.test.ts` (AC5–AC9, offline fake client, fixture source
  artifact + fixture filled queue written into a temp `out` dir).
- Integration (live, owner-gated — the gate is the owner hand-filling
  `decision`s, NOT a model call): run `decompose-run` on a real intent that
  escalates → fill the emitted `answers-needed-*.json` → re-run with
  `--reauthor-from`/`--answers` → confirm the re-author artifact has fewer (ideally
  zero) escalations and frozen contracts that honor the decisions. ~$0.20–0.30
  for one decompose+reauthor pair on `duration-parse`.
- Falsifies / experiment link: this is the PRODUCTION wiring of the E4-validated
  loop — no new pass/fail criterion; the guardrail is that the live path now
  carries escalations end-to-end (emit → answer → re-author) without leaving the
  harness.
