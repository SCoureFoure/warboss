# Spec — E2 contract authorship (human-authored vs warboss-authored contract)

> Status: active · rev 2 · Feature: e2-contract-authorship · Added: 2026-06-12 · Rev 2: 2026-06-12 · Maps to: PLAN Phase 4 "E2 — contract authorship" + `duh_plan.md:255-261`
> **Rev 2 changes** (driven by the 2026-06-12 live run, `reports/e2-verdict.md`):
> (1) the fixed hidden battery is replaced by a **contamination-disjoint
> residual battery** — collided cases are mechanically excluded and recorded,
> not fatal (rev 1's abort made the criterion unmeasurable whenever warboss's
> dense authoring re-derived a hidden input); (2) `analyzeE1bArm` is loosened
> to a structural `AnalyzableSession` param, deleting rev 1's
> `as unknown as SessionRecord[]` cast (H-15 report gap).
> Source of truth for the thesis's load-bearing experiment: does a *machine*
> author (warboss decomposition) write a contract dense enough that the same
> cheap grunt reaches the same hidden-battery correctness as a human-authored
> contract? E1a settled that a dense contract collapses a cheap grunt's variance
> (rung 1). E1b settled that the retry loop is 9.5× cheaper per green but
> plateaus below the HIGH one-shot on hidden correctness — and located the gap
> as **authoring debt** (Corollary D), not the grunt. E2 is the direct test of
> whether warboss authoring closes that gap. **This is where the delegation bet
> is won or falsified end-to-end.**
> Depends on: `specs/warboss-decomposition.spec.md` (produces the warboss
> contract, off-band, via `decompose`/`decompose-run`), `specs/e1b-harness.spec.md`
> (the product loop + session/analysis shapes this reuses), `specs/loop-core.spec.md`
> (the loop), `specs/e1a-harness.spec.md` (task assets, prompt format).

## Requirement

Given one task (its prose intent, its frozen human-authored contract, and its
held-out hidden battery) and a warboss-authored contract for the same task
(reconstructed from a `decompose` artifact), the harness runs N independent
retry-in-place sessions per **contract source** (`human` / `warboss`) with the
same LOW-tier grunt, the same budget, and the same feedback granularity; scores
every final implementation against the same hidden battery; splits that score
into happy-path and error-path subsets; and evaluates the pre-registered E2
criterion (warboss reaches ≥ 90% of human hidden-battery pass rate). Authoring
cost (warboss HIGH-tier spend) and grinding cost (LOW-tier loop spend) are
reported separately. Every model call is metered; the default test path is
offline via the injected fake client.

## Constraints (inherited)

- **Cost-metered.** Every grunt generation routes through `Agent` → `Ledger`;
  the artifact embeds the full grinding ledger. Authoring cost is read from the
  warboss artifact's `totalCostUsd` — the two costs are reported as distinct
  fields so the E2 economics split (authoring vs grinding) is computable.
- **Membrane immutability.** Both contracts are frozen; every `judge` call
  passes `expectedHash`. The warboss contract is reconstructed by re-freezing
  the artifact's requirement and its hash is asserted equal to the artifact's
  recorded hash before any session runs — a mismatch throws (no silent drift).
- **Hidden battery never leaks (rev 2: enforced by exclusion, not abort).**
  No hidden case that survives into the scoring battery appears in any prompt,
  feedback, or system string. Rev 2 achieves this by mechanically EXCLUDING
  every collided case up front (see "Contamination-disjoint residual battery")
  and then running `auditNoContamination` over BOTH source prompts against the
  RESIDUAL battery before any dispatch — by construction it passes; if it
  throws, the filter itself is defective and the throw stands. The warboss
  authoring step never saw the hidden battery (the decompose intent is the
  public prose only) — E2 inherits, never relaxes, this.
- **Grunt is a doer, not a planner.** One `Agent.generate` per attempt; the
  retry loop is `runLoop` (loop-core). E2 keeps no loop logic of its own.
- **`node:vm` is not a security sandbox.** E2's task stays a pure synchronous
  function; the existing sandbox suffices.

## Decisions (pinned 2026-06-12)

### What E2 measures vs what it does NOT

- E2 measures the **comparison**: two contract sources driving the identical
  product loop. It does **not** author the warboss contract itself — authoring
  is `decompose`/`decompose-run` (already built, H-9/H-14), run off-band as a
  God-funded live spend; its artifact is an *input* to E2. This keeps authoring
  (HIGH tier) and measurement (LOW tier grinding) on separate ledgers and lets
  the offline test inject a fixture contract without driving the warboss model.
- Rationale for the split (reuse, don't rebuild): the warboss pipeline is a
  frozen, separately-tested organ; re-driving it inside E2 would couple two
  experiments and double the offline-test scripting surface.

### Contract sources

- **`human`** — `task.grader` from `loadTask(tasks/<task>)`. For
  `duration-parse` this contract carries **zero** `throws` examples (the known
  Corollary-D hole that produced E1b's 0.750 plateau). E2 does not alter it.
- **`warboss`** — reconstructed from a `decompose` artifact
  (`DecomposeArtifact`, shape per `src/experiment/decompose-run.ts`):
  - The artifact MUST contain **exactly one** requirement. `> 1` or `0` →
    descriptive throw naming the count (the intent must be scoped to a single
    function; multi-requirement decomposition is out of scope for E2 rev 1).
  - Reconstruct: `Contract.freeze({ requirement: r.requirement, entry: r.entry,
    version: "1", examples: r.examples })` where `r = artifact.requirements[0]`.
  - **Hash integrity:** the reconstructed `contract.hash` MUST equal
    `artifact.contracts[0].hash`; mismatch → descriptive throw (artifact tamper
    or version skew). Re-freezing is deterministic (warboss stage 6), so a clean
    artifact always matches.
- **Entry-name independence (pinned, kills a wrong reading):** the two contracts
  may name different entry functions (e.g. `parseDuration` vs
  `parseDurationSeconds`). This is correct and must NOT be "fixed". Each arm is
  self-consistent: the grunt implements that source's entry, and the hidden
  battery is executed through that **same** contract's entry
  (`judge(sourceContract, code, { battery: hidden, expectedHash })`). Semantic
  equivalence is guaranteed by the shared prose intent, not by entry-name
  identity. E2 never rewrites the hidden battery per source.

### Contamination-disjoint residual battery (rev 2, replaces abort-on-collision)

The 2026-06-12 live run proved rev 1's design self-defeating: warboss's dense
authoring (34 examples, 22 `throws`) re-derived 3 of the 12 hidden inputs
(`"0s"`, `"30m1h"`, `"-1h"`), and the audit aborted before scoring — the very
density E2 exists to measure tripped the guard. Rev 2 makes collision a
**recorded, mechanical exclusion** instead of a fatal event:

1. **Build both prompts first** (unchanged shape, see "Session execution").
2. **Exclusion rule (one mechanical rule, no judgment):** hidden case `c` is
   excluded iff for ANY element `inp` of `c.input`, `JSON.stringify(inp)`
   appears as a substring of EITHER source prompt. This is verbatim the needle
   rule `auditNoContamination` already uses (`task.ts`) — the filter and the
   audit can never disagree. Example: hidden input `"0s"` → needle `"0s"`
   WITH the JSON quotes; it matches a prompt containing
   `parseDuration("0s") === 0`.
   - The substring rule over-matches (e.g. needle `"90"` would also match a
     prompt containing `"90m"` — string inputs carry their quotes, so this
     particular case does NOT collide; but unquoted numeric needles can
     over-match). Over-matching is DELIBERATE and safe: a false-positive
     exclusion only shrinks the battery; a false negative is impossible
     relative to the audit because the rules are identical.
3. **Symmetric exclusion:** a case leaked by EITHER prompt is excluded for
   BOTH sources. Both sources are always scored on the identical residual set
   (excluding per-source would hand each source a different exam).
4. **Residual battery** = hidden cases minus exclusions, original order
   preserved. ALL scoring — `finalVector`, `finalScore`, coverage split,
   the E2 criterion — runs over the residual ONLY. `finalVector.length` =
   residual length.
5. **Residual viability guard:** after exclusion the residual MUST retain
   ≥ 1 happy case AND ≥ 1 error case (`throws === true`); otherwise →
   descriptive throw naming the surviving counts, BEFORE any session runs
   (a battery that cannot produce both halves of the coverage split cannot
   answer E2). For the 2026-06-12 artifact the residual is 9 of 12
   (8 happy + 1 error: `garbage-unit`) — thin on the error side but viable.
6. **Belt-and-braces:** `auditNoContamination([humanPrompt, warbossPrompt],
   residual)` still runs after filtering. `task.ts` is NOT modified.
7. **Artifact records the exclusions** (see "Artifact"): every excluded case's
   `name` plus `leakedBy` — which source prompt(s) contained it
   (`["human"]`, `["warboss"]`, or both). The verdict needs this to report
   authoring-density side effects.

Why filter, not regenerate: the battery is a frozen hand-authored asset;
regenerating it post-authoring would cost a model call and need its own
contamination proof. Filtering is deterministic, mechanical, and $0.

### Analyzer loosening (rev 2, the only change to `e1b.ts`)

`analyzeE1bArm`'s param type narrows to the five fields it actually reads:

```ts
export interface AnalyzableSession {
  readonly green: boolean;
  readonly stalled: boolean;
  readonly attempts: number;
  readonly finalScore: number;
  readonly totalCostUsd: number;
}
export function analyzeE1bArm(
  feedbackArm: string,
  sessions: readonly AnalyzableSession[],
): FeedbackArmAnalysis;
```

`SessionRecord` and `E2SessionRecord` both satisfy it structurally; `e2.ts`
deletes the `as unknown as SessionRecord[]` cast. Zero behavior change —
e1b's own tests pass untouched.

### Session execution (per source, mirrors e1b)

- One session = one `runLoop` call followed by hidden-battery post-scoring,
  exactly as `e1b.ts` does, with the source's contract substituted:
  `runLoop({ agent, contract: sourceContract, prompt: sourcePrompt,
  granularity, budget: MAX_BUDGET, system: GRUNT_DOGMA, kind: "grunt.generate",
  tags: { source, sessionIndex } })`.
- **Prompt per source:** `task.prose + formatContractSection(sourceContract.entry,
  sourceContract.examples, sourceContract.hash)` — the e1a/e1b Arm-B format.
  `formatContractSection` is reused from `arms.ts` (exported by this change set;
  it is currently file-private). The `human` source's prompt is therefore
  byte-identical to `buildPrompt("B", task)`; the `warboss` source's prompt is
  the same shape over the warboss contract. No rewrapping.
- **Tier:** `TIERS.LOW` for all sessions, both sources (the grunt is the
  controlled variable; only the contract changes).
- **Granularity:** default `"full"` (E1b's best arm), overridable via
  `opts.granularity`. Same granularity for both sources in a run.
- **`MAX_BUDGET = 5`**, `maxTokens` per loop-core default, concurrency **4**
  across all sessions of both sources.
- **`SessionRecord`** is the `e1b.ts` interface, reused verbatim (imported), with
  one added field `source: "human" | "warboss"` replacing `feedbackArm`'s role
  as the partition key — see "Session record" below.
- E2 has a thin local `runE2Session` mirroring `e1b.runSession` (it is not
  exported by e1b); the loop and judging calls are identical, only the partition
  tag differs. No loop logic is duplicated — `runLoop` + `judge` are reused.

### Session record

```ts
interface E2SessionRecord {
  source: "human" | "warboss";
  sessionIndex: number;
  model: string;                    // TIERS.LOW.id
  attempts: number;
  stalled: boolean;
  green: boolean;                   // passed its OWN source contract
  finalCode: string | undefined;
  finalVector: readonly boolean[];  // RESIDUAL-battery vector, length = residual.length (rev 2)
  finalScore: number;               // residual-battery fraction passed (rev 2)
  totalCostUsd: number;
  totalWallMs: number;
}
```

### Per-source analysis

- The greenRate / meanAttempts / stallRate / meanFinalHiddenScore /
  meanCostPerGreenSession / totalCostUsd numbers reuse **`analyzeE1bArm`**
  (exported from `e1b.ts`) — call it per source with that source's sessions.
  (`analyzeE1bArm` keys its result by a string name; pass the source name.)
- **Coverage split (the E2-specific measurement):** partition the RESIDUAL
  battery (rev 2 — never the full battery) by the `throws` flag once, up front:
  - `happyIdx` = residual indices where `residual[i].throws !== true`.
  - `errorIdx` = residual indices where `residual[i].throws === true`.
  Per source, over its N sessions:
  - `meanHappyScore` = mean over sessions of (passed happy indices / `happyIdx.length`).
  - `meanErrorScore` = mean over sessions of (passed error indices / `errorIdx.length`).
  When a subset is empty for a task, its mean is reported as `null` (not 0 — a
  task with no error-path hidden cases has no error datum to average).
- **Static contract coverage:** `hasErrorExample(sourceContract)` =
  `examples.some(e => e.throws === true)`. Reported per source. For
  `duration-parse` this is expected `false` for `human`, `true` for `warboss`
  (the mandate) — the structural cause the score split should reflect.

### Pre-registered E2 criterion

```ts
interface E2Criterion {
  pass: boolean;
  detail: string;
}
```

- **PASS iff** `warboss.meanFinalHiddenScore >= 0.90 * human.meanFinalHiddenScore`
  (PLAN pre-registered criterion, `duh_plan.md:259`). `detail` carries both
  means and the threshold, formatted to 3 dp.
- **Degenerate guard:** if `human.meanFinalHiddenScore === 0` the ratio is
  undefined → `pass: false`, detail names the degenerate human baseline (a human
  contract that scores 0 hidden cannot anchor the comparison).
- **Secondary reference (reported, NOT gating):** when `opts.e1aArmD` is
  provided, the artifact also records whether each source's mean hidden score
  reaches Arm D's `meanHiddenScore` (the HIGH one-shot, 0.8167 for r2). This is
  context for the verdict write-up, not the criterion — E2's claim is
  warboss-vs-human, not warboss-vs-HIGH.

### Costs

- `grindingCostUsd` = ledger sum of the run's LOW-tier sessions (both sources).
- `authoringCostUsd` = the warboss artifact's `totalCostUsd` (HIGH-tier spend
  already incurred off-band; `0` when a contract is injected directly in tests).
- `totalCostUsd` (artifact top-level) = `grindingCostUsd` only — the live E2
  run's own spend. Authoring cost is a separate, clearly-named field so it is
  never double-counted into the run's metered total.

### Options & result

```ts
interface RunE2Options {
  client?: MessagesClient;        // fake for tests; omitted → real client (grunt)
  warbossArtifact?: string;       // path to a decompose artifact (live route)
  warbossContract?: Contract;     // injected (tests); takes precedence over the path
  task?: string;                  // default "duration-parse"
  n?: number;                     // default 30 per source
  granularity?: FeedbackArm;      // default "full"
  out?: string;                   // default "runs"
  tasksDir?: string;              // default the repo tasks dir (e1b idiom)
  e1aArmD?: E1aArmDStats;         // optional secondary reference (reused type)
  live?: boolean;                 // CLI true, tests false
}

interface RunE2Result { readonly deadRun: boolean; }
```

- **Warboss source selection (exactly one):** `warbossContract` present → use it
  (skip reconstruction). Else `warbossArtifact` present → reconstruct per the
  rules above. Neither → descriptive throw before any model call. Both → the
  injected contract wins (documented precedence; no throw — tests set both only
  by mistake, and precedence is deterministic).

### Artifact

`runs/e2-<ISO8601-basic>.json` (timestamp idiom shared with e1a/e1b):

```json
{
  "config": { "n": 30, "task": "duration-parse", "granularity": "full", "budget": 5 },
  "taskName": "duration-parse",
  "warbossArtifactPath": "runs/decompose-….json or null when injected",
  "contracts": {
    "human":   { "hash": "…", "entry": "parseDuration",        "hasErrorExample": false },
    "warboss": { "hash": "…", "entry": "…",                    "hasErrorExample": true  }
  },
  "hiddenBattery": {
    "total": 12,
    "excluded": [ { "name": "zero-seconds", "leakedBy": ["warboss"] } ],
    "residualCount": 9,
    "happyCount": 8,
    "errorCount": 1
  },
  "analysis": { "human": FeedbackArmAnalysis, "warboss": FeedbackArmAnalysis },
  "coverageSplit": {
    "happyIdx": [/* residual indices */], "errorIdx": [/* residual indices */],
    "human":   { "meanHappyScore": 0.0, "meanErrorScore": 0.0 },
    "warboss": { "meanHappyScore": 0.0, "meanErrorScore": 0.0 }
  },
  "e2Criterion": { "pass": false, "detail": "…" },
  "armDReference": { "meanHiddenScore": 0.8167, "humanReaches": false, "warbossReaches": false } /* or null */,
  "grindingCostUsd": 0.0,
  "authoringCostUsd": 0.0,
  "sessions": [ /* E2SessionRecord[] */ ],
  "ledger": [ /* LedgerEntry[] */ ],
  "totalCostUsd": 0.0,
  "deadRun": false
}
```

- **Dead-run guard** (e1a/e1b lesson): `live: true` AND (grinding ledger cost
  `0` OR every session of every source has `finalScore === 0`) → `deadRun: true`,
  loud `DEAD RUN` warning, CLI exits nonzero. Else `false`.
- Emits `cost-ledger-<ts>.jsonl` (one line per grunt call), same as e1b.

### Module layout & CLI

```text
src/experiment/e2.ts    runE2(opts): exported fn + CLI entry
src/experiment/e1b.ts   rev 2: AnalyzableSession export + analyzeE1bArm param loosening (only change)
test/e2.test.ts         AC1–AC13 (offline, fake MessagesClient + fixture artifact)
```

- Export from `e2.ts`: `runE2`, `RunE2Options`, `E2SessionRecord`, the coverage
  helpers needed by tests, and (rev 2) the residual-battery filter helper so
  AC11/AC12 can unit-test it directly.
- Export `formatContractSection` from `arms.ts` (the only change to `arms.ts`,
  done in rev 1 — already shipped).
- npm script: `"e2": "node --env-file=.env --import tsx src/experiment/e2.ts"`.
- CLI flags: `--warboss-artifact <path>` (required for live), `--task`,
  `--n`, `--granularity`, `--out`, `--e1a-arm-d <path>`. **npm eats `--flags`
  on Windows** — invoke directly: `node --env-file=.env --import tsx
  src/experiment/e2.ts --warboss-artifact runs/decompose-….json --n 30`.

## Acceptance criteria (Given / When / Then)

1. **AC1 — two sources, same loop.** Fake client returns a passing impl on
   attempt 1. `runE2({ client, warbossContract, n: 1 })` (human from a fixture
   task) → 2 sessions total (1 `human`, 1 `warboss`), both `green: true`; each
   session's loop ran against its OWN contract (capture-assert: the human
   session's prompt contains `task.grader.hash`; the warboss session's prompt
   contains `warbossContract.hash`). Ledger tagged `{ source, sessionIndex }`.

2. **AC2 — warboss reconstruction from artifact.** Given a fixture decompose
   artifact with exactly one requirement whose re-frozen hash equals the
   artifact's recorded `contracts[0].hash`, `runE2({ client, warbossArtifact })`
   reconstructs the warboss contract, and the artifact's
   `contracts.warboss.hash` equals that hash. Variant: artifact with `2`
   requirements → descriptive throw naming the count, before any model call.

3. **AC3 — hash integrity guard.** Fixture artifact whose recorded
   `contracts[0].hash` does not match the re-frozen requirement → descriptive
   throw naming the mismatch, before any session runs.

4. **AC4 — hidden scored through each source's own entry.** A fake grunt that
   emits an impl defining the warboss entry name (different from
   `parseDuration`): the warboss session's `finalVector` is computed via the
   warboss contract's entry and is non-degenerate (not forced all-false by an
   entry-name mismatch). The human session scores through `parseDuration`.

5. **AC5 — coverage split (rev 2: over the residual).** Synthetic sessions with
   known `finalVector`s over a RESIDUAL battery containing both `throws !== true`
   and `throws === true` cases → `coverageSplit.happyIdx` / `errorIdx` partition
   exactly by the flag over residual indices; `meanHappyScore` / `meanErrorScore`
   per source equal the hand-computed means. A residual with no error-path case
   is unreachable in rev 2 (the viability guard throws first — AC12); the
   `meanErrorScore: null` branch remains only for the helper's direct unit test.

6. **AC6 — static contract coverage.** For the real `duration-parse` human
   contract, `contracts.human.hasErrorExample === false`; a warboss contract
   carrying a `throws: true` example → `contracts.warboss.hasErrorExample === true`.

7. **AC7 — E2 criterion.** Synthetic per-source analyses:
   `warboss.meanFinalHiddenScore = 0.92`, `human = 1.0` → `pass: true` (`0.92 ≥
   0.90`); `warboss = 0.80`, `human = 1.0` → `pass: false`; `human = 0` →
   `pass: false` with the degenerate-baseline detail. `detail` carries both
   means in all three.

8. **AC8 — collision excludes, never aborts (rev 2, replaces rev 1's
   abort-on-collision).** A warboss contract whose examples include hidden
   input `"X"` (a happy case) → `runE2` does NOT throw; the case appears in
   `hiddenBattery.excluded` with `leakedBy: ["warboss"]`; sessions run; every
   `finalVector` has length `residualCount`; and
   `auditNoContamination([humanPrompt, warbossPrompt], residual)` was satisfied
   (no throw). The full battery is never scored.

9. **AC9 — artifact structure & costs.** `runE2` with fake client, `n: 1`,
   injected warboss contract writes exactly one `runs/e2-<ts>.json` and one
   `cost-ledger-<ts>.jsonl`; artifact has `config`, `contracts` keyed
   `human`/`warboss`, `hiddenBattery` (rev 2: `total`, `excluded`,
   `residualCount`, `happyCount`, `errorCount`), `analysis`, `coverageSplit`,
   `e2Criterion`, `grindingCostUsd` (= ledger sum), `authoringCostUsd` (= `0`
   for injected contract; = the artifact's `totalCostUsd` when reconstructed
   from a path), `totalCostUsd` (= grinding only), `ledger`, and `sessions` of
   length `2n`.

10. **AC10 — dead-run guard.** `live: true` + fake client yielding all-zero
    final scores → `deadRun: true` stamped and `{ deadRun: true }` returned;
    same fixture `live: false` → no dead-run failure; `live: true` with nonzero
    scores and cost → `deadRun: false`.

11. **AC11 — exclusion rule mechanics (rev 2).** Fixture where the warboss
    contract's examples contain hidden input `"X"` and the HUMAN contract's
    examples contain hidden input `"Y"` (both happy cases, distinct) → both
    cases excluded; `excluded` entries carry `leakedBy: ["warboss"]` and
    `leakedBy: ["human"]` respectively; an input present in BOTH prompts →
    `leakedBy: ["human", "warboss"]` (array order pinned: human first);
    residual preserves the original hidden order minus exclusions. Needle
    examples (kill both readings): string input `"90"` → needle `"90"`
    INCLUDING the JSON quotes, which is NOT a substring of a prompt containing
    only `parseDuration("90m") === 5400` (after `90` comes `m`, not a quote) →
    NOT excluded; numeric input `90` → needle `90` WITHOUT quotes, which IS a
    substring of that same prompt → excluded (deliberate over-match, assert
    it).

12. **AC12 — residual viability guard (rev 2).** Fixture whose exclusions
    leave zero error-path cases in the residual (e.g. the only `throws` hidden
    input appears in the warboss examples) → descriptive throw naming the
    surviving happy/error counts, BEFORE any session runs (fake client records
    zero generate calls). Same for zero happy cases.

13. **AC13 — analyzer loosening (rev 2).** `e1b.ts` exports
    `AnalyzableSession` with exactly the five fields pinned in Decisions;
    `analyzeE1bArm` accepts `readonly AnalyzableSession[]`; `e2.ts` contains
    no `as unknown as` cast (grep-assertable); `npm run typecheck` passes and
    every pre-existing e1b test passes unmodified.

## Verifies-with

- Tests: `test/e2.test.ts` — AC1–AC13, offline, fake `MessagesClient` + a small
  fixture decompose artifact (written by the test into a temp `out` dir).
- Integration (live, God-gated — rev 2 needs ONE spend, the authoring artifact
  already exists):
  1. ~~decompose-run~~ DONE 2026-06-12: `runs/decompose-20260612T132205Z.json`
     ($0.1632, 1 requirement, 34 examples / 22 throws, admitted, auditGaps 0).
     Reuse it — do not re-author.
  2. `node --env-file=.env --import tsx src/experiment/e2.ts --warboss-artifact
     runs/decompose-20260612T132205Z.json --n 30 --granularity full`
     (~$0.10 LOW tier). Expected exclusions vs that artifact: `zero-seconds`
     (`"0s"`), `reversed-order` (`"30m1h"`), `negative` (`"-1h"`) — all
     `leakedBy: ["warboss"]`; residual 9 (8 happy + 1 error).
  Verdict appended to `reports/e2-verdict.md` (rev-2 section).
- Falsifies / experiment link: **E2** (PLAN pre-registered). Sharp prediction:
  the warboss arm's `meanErrorScore` exceeds the human arm's (which is ~0, the
  human contract pins no error behavior), lifting `warboss.meanFinalHiddenScore`
  to ≥ 0.90 × human and past E1b's 0.750 plateau. If the warboss mandate +
  audit/amend pass do NOT close the gap, warboss decomposition needs an
  adversarial example-generation pass before the hierarchy is trusted
  end-to-end (the standing PLAN consequence).
