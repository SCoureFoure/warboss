# Spec — E3 intent divergence (pre-freeze surfacing of underdetermined semantics)

> Status: active · rev 1 · Feature: e3-intent-divergence · Added: 2026-06-12 · Maps to: PLAN Phase 4 follow-on (E2 standing consequence) + Lever 1 (gate rework, behavioral line)
> Source of truth for the experiment that tests the E2 consequence head-on:
> can the harness surface the intent-underdetermined semantic points of a
> task **before** a warboss freezes fiat resolutions into a contract? E2
> (`reports/e2-verdict.md`) located the delegation bet's residual failure in
> exactly three duration-parse inputs the prose intent does not decide —
> bare-number `"120"`, padded whitespace `" 1h 30m "`, decimal `"1.5h"` —
> which rev-3 decomposition resolved silently and which every introspective
> admission instrument missed (gruntJudge FAIL, deriveCheck FAIL,
> admit-in-anger 0 questions). E3 measures whether the two NEW pre-freeze
> instruments catch them: (1) the warboss's own fiat/escalation flags
> (warboss-decomposition **rev 4**) and (2) `intentProbe`'s prose-level
> behavioral divergence (readiness-gate **rev 2**). **This is the kick-back
> leg's falsification experiment: if neither instrument surfaces the known
> points, the author-tier line is in trouble too and the verdict must say
> so.**
> Depends on: `specs/warboss-decomposition.spec.md` rev 4 (fiat-flagging,
> escalations), `specs/readiness-gate.spec.md` rev 2 (`intentProbe`),
> `specs/e1a-harness.spec.md` (task assets, prompt idioms),
> `specs/decompose-run.spec.md` (artifact shape it extends).

## Requirement

Given a task's prose intent and a pinned candidate-input set containing the
known underdetermined inputs, the harness runs (a) one rev-4 `decompose`
(capturing `resolutions` and `escalations`) and (b) one `intentProbe` over
the prose intent, then mechanically evaluates, per known underdetermined
point, whether each instrument surfaced it — probe-side by exact input
membership in `splits`, author-side by a pre-registered needle match over
`escalations` — and computes the pre-registered E3 criterion (every known
point surfaced by ≥1 instrument). Authoring cost (HIGH) and probing cost
(LOW) are reported separately. Every model call is metered; the default test
path is offline via the injected fake client.

## Constraints (inherited)

- **Cost-metered.** Decompose calls are HIGH-tier, probe calls LOW-tier;
  the artifact embeds the full ledger and reports `authoringCostUsd` /
  `probingCostUsd` as distinct fields. One `cost-ledger-<ts>.jsonl` sidecar
  (H-16 ruling).
- **Membrane immutability.** The decompose output's contracts freeze as
  rev 4 specifies; E3 never edits them. E3 dispatches NO grunt loop — there
  is no grinding phase; nothing here touches a hidden battery.
- **Hidden battery never leaks — vacuously, and deliberately.** E3 scores
  nothing against the E2 hidden battery. The three known points were
  IDENTIFIED via E2's battery, but E3 asks only "is this point FLAGGED as
  undecided?", never "is it resolved the way the battery author resolved
  it?" — this neutralizes the E2 confound (the battery encodes the human
  author's coin flips) instead of inheriting it.
- **Grunt is a doer, not a planner.** Probe generations are single
  `Agent.generate` calls via `intentProbe`; E3 adds no loop logic.
- **Fail-up.** E3 computes its criterion mechanically and never re-rolls
  either instrument to chase a PASS. One decompose, one probe, one verdict.

## Decisions (pinned 2026-06-12)

### What E3 measures vs what it does NOT

- E3 measures **surfacing**: do the pre-freeze instruments raise the right
  kick-back questions? It does NOT measure resolution quality (that requires
  a God ruling round — out of scope), does NOT re-run the E2 criterion, and
  does NOT test probe-battery auto-generation (the candidate-input set is
  hand-pinned below, so the instrument question is isolated from the
  generation question — one experiment, one variable).
- The two instruments run INDEPENDENTLY (decompose does not see probe
  output, probe does not see the contract). E3 is the experimental
  composition; production wiring into a single authoring pipeline is a
  follow-on leg gated on E3's verdict.

### Known underdetermined points (pinned — the measurement targets)

From `reports/e2-verdict.md` per-case table, exactly three, with ids:

| id | input (verbatim) | E2 evidence |
| --- | --- | --- |
| `bare-number` | `"120"` | warboss never pinned; grunts converged 0/30 vs battery |
| `whitespace` | `" 1h 30m "` | warboss pinned throws by fiat; battery says accept |
| `decimal` | `"1.5h"` | NEITHER source decides; both populations 0/30 |

### Candidate input set (pinned — hand-authored, rev 1)

Twelve single-argument tuples, exact strings, order pinned:

```ts
const E3_CANDIDATE_INPUTS: readonly (readonly [string])[] = [
  ["2h"],          // 1  filler happy
  ["45m"],         // 2  filler happy
  ["3h2m1s"],      // 3  filler multi-unit
  ["120"],         // 4  KNOWN bare-number
  [" 1h 30m "],    // 5  KNOWN whitespace
  ["1.5h"],        // 6  KNOWN decimal
  [""],            // 7  empty
  ["0m"],          // 8  zero
  ["-30m"],        // 9  negative
  ["1H"],          // 10 uppercase unit
  ["90s"],         // 11 seconds unit
  ["1h90m"],       // 12 carry
];
```

- The three knowns sit among nine fillers; the probe receives NO marking of
  which is which (it cannot — inputs carry no expected outputs, and the
  instrument treats all twelve identically).
- Including the knowns is NOT contamination: there are no expected outputs
  to leak (readiness-gate rev 2 pins this ruling on `intentProbe` itself).
- Hand-pinning is rev 1's deliberate control: if the instrument works on a
  set known to contain the targets, the NEXT question is whether a warboss
  can author such a set (follow-on leg). If it fails even here, generation
  is moot.

### Surfacing rules (mechanical, pre-registered)

Per known point, two booleans:

- **`surfacedByProbe`** — true iff `intentProbe`'s `splits` contains an entry
  whose `input` deep-equals the known's tuple (`deepEqual` from `runner.ts`;
  index lookup over the pinned set is equivalent and acceptable).
- **`surfacedByAuthor`** — true iff ANY entry of the decompose artifact's
  `escalations` array, lowercased, contains ≥1 needle from the known's
  pinned needle list (case-insensitive substring; needle lists pinned
  below). `auditGaps` entries are NOT consulted — they are the amendable
  remainder, not the escalation channel (kills the "scan everything"
  reading).

Needle lists (pre-registered; chosen for recall over precision — a false
positive only weakens the verdict's wording, a needle miss is reported and
may be overruled IN PROSE in the verdict, never in the computed criterion):

```ts
const E3_NEEDLES: Record<string, readonly string[]> = {
  "bare-number": ["120", "bare", "unitless", "unit-less", "no unit", "without unit", "digits only", "number only", "numeric only"],
  "whitespace":  ["whitespace", "white space", "space", "trim", "padded", "padding", "leading", "trailing"],
  "decimal":     ["decimal", "1.5", "fraction", "non-integer", "float"],
};
```

### Pre-registered E3 criterion

```ts
interface E3Criterion {
  pass: boolean;
  perKnown: readonly {
    id: string;
    surfacedByProbe: boolean;
    surfacedByAuthor: boolean;
    surfaced: boolean;          // OR of the two
  }[];
  detail: string;               // names every known and which instrument(s) caught it / missed it
}
```

- **PASS iff ALL THREE knowns have `surfaced === true`.** Strict by design —
  these are the three points we KNOW about; an instrument pair that cannot
  surface known targets cannot be trusted on unknown ones.
- Sharp sub-predictions (recorded for the verdict, not gating):
  `whitespace` should surface by AUTHOR (the warboss demonstrably noticed
  it — it authored 3 deliberate whitespace-throws examples in the E2
  artifact — rev 4 makes it report the choice); `bare-number` should surface
  by PROBE (prose-level populations plausibly split minutes-vs-throw);
  `decimal` is the live question — E2 showed both POST-freeze populations
  converged on failing it, so its prose-level divergence is genuinely
  unknown. If `decimal` alone misses, the verdict should weigh a
  needle-list false negative before declaring instrument failure.
- **Degenerate guard:** `intentProbe.viable === 0` → `pass: false`, detail
  names the dead probe (a population with no viable impl measured nothing).

### Execution

- **Authoring arm:** `decompose` (rev 4) with the duration-parse prose
  intent (`loadTask(tasks/duration-parse).prose` — the same public prose E2
  used), HIGH tier, `maxRequirements: 1` (rev 4 injects the cap into the
  prompt; the E2 `--context` SCOPE-CONSTRAINT workaround is retired),
  `tags: { experiment: "e3", arm: "author" }`. The DraftSet's `escalations`
  and `resolutions` are recorded in the artifact verbatim.
- **Probe arm:** `intentProbe` with `prompt` = the task prose + one line
  naming entry and signature (exact format:
  `Implement: ${entry}${signature}` — NO examples, NO contract section),
  `entry` from the task, `inputs: E3_CANDIDATE_INPUTS`, `k: 8`, LOW tier,
  `tags: { experiment: "e3", arm: "probe" }`.
- Arms run sequentially (author then probe — no shared state, but
  deterministic artifact ordering); concurrency inside each arm per its own
  spec.
- **Offline path:** fake client scripts both arms (a scripted decompose
  output with pinned escalations; k scripted probe impls). The runner takes
  `client?: MessagesClient` exactly like e1b/e2.

### Costs

- `authoringCostUsd` = DraftSet.costUsd (HIGH calls).
- `probingCostUsd` = IntentProbeVerdict.costUsd (LOW calls).
- `totalCostUsd` = sum of both (this run's own spend — unlike E2 there is no
  off-band artifact reuse; rev-4 decompose must run fresh because the
  2026-06-12 artifact predates the `resolutions` schema).

### Options & result

```ts
interface RunE3Options {
  client?: MessagesClient;     // fake for tests; omitted → real client
  task?: string;               // default "duration-parse"
  k?: number;                  // default 8 (probe arm)
  out?: string;                // default "runs"
  tasksDir?: string;           // default repo tasks dir (e1b idiom)
  live?: boolean;              // CLI true, tests false
}

interface RunE3Result { readonly deadRun: boolean; }
```

### Artifact

`runs/e3-<ISO8601-basic>.json`:

```json
{
  "config": { "task": "duration-parse", "k": 8, "candidateInputCount": 12 },
  "knowns": [ { "id": "bare-number", "input": ["120"] }, ... ],
  "author": {
    "requirements": 1,
    "resolutions": [ /* per requirement, verbatim */ ],
    "escalations": [ /* verbatim */ ],
    "auditGaps": [ /* verbatim */ ],
    "contractHashes": ["…"]
  },
  "probe": { /* IntentProbeVerdict verbatim (splits, viable, decidedRate, costUsd) */ },
  "e3Criterion": { "pass": false, "perKnown": [ ... ], "detail": "…" },
  "authoringCostUsd": 0.0,
  "probingCostUsd": 0.0,
  "totalCostUsd": 0.0,
  "ledger": [ /* LedgerEntry[] */ ],
  "deadRun": false
}
```

- **Dead-run guard:** `live: true` AND (`totalCostUsd === 0` OR
  `probe.generated === 0`) → `deadRun: true`, loud `DEAD RUN` warning, CLI
  exits nonzero. Else `false`.
- Emits `cost-ledger-<ts>.jsonl` (one line per call, both arms).

### Module layout & CLI

```text
src/experiment/e3.ts    runE3(opts): exported fn + CLI entry (guarded like e1b/e2)
test/e3.test.ts         AC1–AC8, offline, fake MessagesClient
```

- Exports from `e3.ts`: `runE3`, `RunE3Options`, `E3_CANDIDATE_INPUTS`,
  `E3_NEEDLES`, `evaluateE3Criterion` (the pure surfacing/criterion helper,
  so AC1–AC3 unit-test it directly).
- npm script: `"e3": "node --env-file=.env --import tsx src/experiment/e3.ts"`.
- CLI flags: `--task`, `--k`, `--out`. **npm eats `--flags` on Windows** —
  invoke directly: `node --env-file=.env --import tsx src/experiment/e3.ts --k 8`.

## Acceptance criteria (Given / When / Then)

1. **AC1 — probe-side surfacing rule.** Synthetic `IntentProbeVerdict` whose
   `splits` contains an entry with `input: ["120"]` and no entry for the
   other knowns → `evaluateE3Criterion` marks `bare-number`
   `surfacedByProbe: true`, the other two `false`; a split on a FILLER input
   (e.g. `["1H"]`) marks no known.
2. **AC2 — author-side needle rule.** Escalations
   `["parse-duration: fiat — bare numeric string → throws"]` → `bare-number`
   `surfacedByAuthor: true` (needle `"bare"`, case-insensitive). Variant: an
   escalation mentioning none of a known's needles → `false`. Variant:
   needle text present only in `auditGaps`, escalations empty → `false`
   (auditGaps is not consulted).
3. **AC3 — criterion.** All three surfaced (any mix of instruments) →
   `pass: true`; exactly one missed → `pass: false` and `detail` names the
   missed known and both instrument verdicts for it; `viable: 0` probe →
   `pass: false` with the degenerate detail.
4. **AC4 — candidate set pins the knowns.** `E3_CANDIDATE_INPUTS` contains
   exactly the three known tuples (deep-equality membership) among ≥9 other
   tuples; the knowns' indices match the `knowns` artifact block the runner
   writes.
5. **AC5 — end-to-end offline run.** Fake client scripting (a) a valid rev-4
   single-requirement decompose with one fiat escalation and (b) k=4 probe
   impls that split on `["120"]` → `runE3` writes one `runs/e3-<ts>.json` +
   one `cost-ledger-<ts>.jsonl`; artifact carries `author` (escalations
   verbatim), `probe` (the split), `e3Criterion` with the per-known table,
   and separate `authoringCostUsd` / `probingCostUsd` equal to their
   ledger-kind sums.
6. **AC6 — instrument independence.** In the AC5 run, capture-assert: no
   probe-arm request contains any contract hash or example line from the
   author arm's output, and the decompose requests contain no candidate
   input beyond what the prose itself carries (the arms share only the
   prose).
7. **AC7 — dead-run guard.** `live: true` + a fake client whose probe arm
   yields zero generated impls → `deadRun: true` and nonzero CLI intent
   (returned `{ deadRun: true }`); same fixture `live: false` → no dead-run
   flag.
8. **AC8 — probe prompt shape.** The probe arm's prompt is the task prose +
   the exact `Implement: ${entry}${signature}` line and contains neither the
   word `contract` nor any `===` example line (capture-asserted) — the probe
   arm measures PROSE latitude, nothing else.

## Verifies-with

- Tests: `test/e3.test.ts` — AC1–AC8, offline, fake `MessagesClient`.
- Integration (live, God-gated, sequenced AFTER H-18 + H-19 merge): one run,
  `node --env-file=.env --import tsx src/experiment/e3.ts --k 8`
  (~$0.17 HIGH authoring + ~$0.03 LOW probing ≈ **$0.20**). Verdict to
  `reports/e3-verdict.md`: the per-known table, plus prose discussion of any
  needle false negative.
- Falsifies / experiment link: **E3 pre-registered criterion above.** PASS →
  the kick-back leg is validated; next legs = warboss-authored candidate
  inputs + wiring intentProbe/escalations into the production authoring
  pipeline + thresholds for `decidedRate`. FAIL → per-known autopsy: if
  ONLY `decimal` missed by probe, weigh prose-level convergence (a real
  finding about divergence limits, E2 hinted at it) vs needle miss; if
  `whitespace` missed by author, the rev-4 fiat mandate does not bind the
  model and prompt-level control needs a different lever (schema-forced
  per-example provenance is the named candidate).
