# E2 verdict — contract-authorship (human vs warboss)

> **Rev-2 re-run measured the criterion: see the second section below.
> Headline: FAIL as pre-registered (0.667 < 0.700), but the split decomposes
> into a fully-closed error path (warboss 1.000 vs human 0.000) and two
> deterministic ambiguity-resolution divergences on the happy path.**

## Attempt 1 (rev 1) — UNMEASURABLE, contamination abort

> Run: 2026-06-12 · task `duration-parse` · LOW tier (haiku-4-5) grunt loop ·
> N=30 per source planned · `--granularity full`.
> Warboss source: `runs/decompose-20260612T132205Z.json` (live decompose,
> HIGH tier, **$0.1632**). Human source: `tasks/duration-parse/task.json`.
> **Outcome: criterion UNMEASURABLE as specced — contamination guard blocked
> scoring before any grunt session ran. Grinding cost $0.00.**

### What happened

`runE2` aborted at the pre-flight contamination audit
([e2.ts:328](../src/experiment/e2.ts#L328)), before the ledger/agent were
even constructed (line 336+), so **zero grinding dollars were spent** — only
the $0.1632 authoring decompose.

```text
Error: Contamination in prompt[1]: hidden case "zero-seconds" input "0s" appears in prompt
```

`prompt[1]` is the **warboss** prompt. The warboss-authored contract carries
**34 examples (22 `throws`)** — exactly the dense error coverage the thesis
predicts. But that density collided with the held-out hidden battery:

| hidden case | input | warboss example that leaked it |
| --- | --- | --- |
| `zero-seconds` | `"0s"` | `zero-value` |
| `reversed-order` | `"30m1h"` | `reordered-segments` |
| `negative` (throws) | `"-1h"` | `error-leading-sign` |

**Human contract: 0 collisions** (5 hand-picked examples, disjoint from the
12-case battery by construction).

### Reading

This is a genuine finding, not a code defect. The contamination guard is
mandatory — it stops a grunt from being scored on inputs its own prompt
already contained (teaching-to-the-test inflation). The guard fired because
warboss authored densely and, having no knowledge of the held-out set,
re-derived three of its inputs verbatim.

So the E2 ≥0.90× criterion is **unmeasurable against a fixed battery that
warboss's authoring can overlap**. The sparse human contract never collides
*because* it is sparse — the very asymmetry E2 was built to test (dense error
authoring) is what trips the guard. The prediction (warboss `meanErrorScore`
>> human's null lifts hidden score past E1b's 0.750 plateau) was not falsified;
it was simply not reached.

The contract inspection still confirms the thesis mechanism qualitatively:
warboss authored 22 error-path examples (max-safe-integer overflow, non-string
inputs, fullwidth/Arabic-Indic digits, internal whitespace, stray chars,
unknown units, signs) for a function whose human contract pins **no** error
behavior at all.

### Spec gap → E2 rev 2

The held-out hidden battery must be **contamination-disjoint from any
contract a source may author**, not just from the two contracts shipped today.
Candidate rev-2 fixes (planner's call):

1. **Generate the hidden battery AFTER authoring**, excluding every input
   present in either source contract — then the guard can never fire on a
   legitimately-authored contract and the score is the real comparison.
2. Or treat a warboss-vs-hidden collision as a **scored event** (the grunt is
   credited 0 on the leaked case, not aborted) — but this changes the guard's
   meaning and risks masking real contamination; rejected unless 1 is
   infeasible.
3. The contamination audit itself is correct and stays.

Until rev 2, the ≥0.90× number is undefined. Authoring economics datum stands:
warboss authored a 34-example contract for **$0.1632** vs the human's
hand-written 5.

### Cost ledger

| Phase | Cost |
| --- | --- |
| Authoring (decompose, HIGH) | $0.1632 |
| Grinding (N×2 sessions, LOW) | $0.0000 (never dispatched) |
| **Total** | **$0.1632** |

> Procedural note: `--max-requirements 1` is a post-validation cap, NOT a
> prompt constraint ([warboss.ts:306](../src/warboss.ts#L306)) — the model
> first decomposed `parseDuration` into 6 sub-requirements and the run
> fail-closed rejected. A single requirement was obtained by adding a
> `--context` SCOPE CONSTRAINT instructing one atomic requirement. Decompose
> cannot be forced to a requirement count via the cap alone; the intent must
> be shaped. (decompose-run rev 2 candidate: surface `maxRequirements` into
> the decompose prompt.)

## Attempt 2 (rev 2) — MEASURED: criterion FAIL, error path fully closed

> Run: 2026-06-12 · artifact `runs/e2-20260612T142157Z.json` · spec rev 2
> (H-17, residual-battery exclusion) · same warboss artifact reused
> (`runs/decompose-20260612T132205Z.json`, $0.1632 authoring) · N=30 per
> source · LOW tier (haiku-4-5) · `--granularity full` · grinding **$0.2272**.
> Residual battery: 9 of 12 (8 happy + 1 error) — exclusions exactly as the
> spec predicted: `zero-seconds`, `reversed-order`, `negative`, all
> `leakedBy: ["warboss"]`. `deadRun: false`.

### Headline numbers

| Source | green | mean attempts | hidden (residual) | happy | error | cost/green |
| --- | --- | --- | --- | --- | --- | --- |
| human | 1.00 | 1.00 | **0.778** | 0.875 | **0.000** | $0.0016 |
| warboss | 1.00 | 1.70 | **0.667** | 0.625 | **1.000** | $0.0060 |

**Pre-registered criterion: FAIL** — `warboss 0.667 < 0.900 × human 0.778
(threshold 0.700)`.

### Per-case decomposition (the real finding)

Every per-case rate below is over 30 sessions; all are 0/30 or 30/30 —
the contracts drive the grunt **deterministically** (rung 1 reconfirmed:
a dense contract collapses interpretation; here it can collapse it onto the
*wrong* resolution).

| residual case | input | human | warboss | why warboss differs |
| --- | --- | --- | --- | --- |
| plain-hours | `"2h"` | 1.00 | 1.00 | — |
| plain-minutes | `"10m"` | 1.00 | 1.00 | — |
| three-units | `"3h2m1s"` | 1.00 | 1.00 | — |
| bare-number-2 | `"120"` | 1.00 | **0.00** | warboss never pinned bare-number (human pins `"90"→90`); its `error-trailing-digits` example teaches grunts to throw |
| carry-minutes | `"1h90m"` | 1.00 | 1.00 | — |
| repeat-units | `"30m30m"` | 1.00 | 1.00 | — |
| decimal-hours | `"1.5h"` | **0.00** | **0.00** | NEITHER contract decides decimals — both grunt populations fail |
| whitespace | `" 1h 30m "` | 1.00 | **0.00** | warboss pins whitespace as `throws` (3 examples); battery says accept → 5400 |
| garbage-unit (err) | `"1x"` | **0.00** | **1.00** | human contract pins no error behavior; warboss pins 22 |

### Reading the measurement

1. **The sharp prediction held**: warboss `meanErrorScore` 1.000 vs human
   0.000. The throws mandate + dense error authoring close the Corollary-D
   error gap *completely*. Authoring debt on the error path is solved by
   machine authoring.
2. **The criterion still FAILs, and the failure is pure ambiguity-resolution
   divergence**, not capability. Both warboss happy-path losses are inputs the
   prose intent **underdetermines** (is a bare number seconds? is padded
   whitespace tolerated?). The hidden battery encodes the *human author's*
   resolutions; warboss resolved both the other way and its denser contract
   enforced those choices deterministically. E2 as designed partially measures
   "did the machine guess the battery author's coin flips" — a confound to
   name in any rev 3.
3. **The admission gate missed both divergences.** `admit` passed this
   contract with **0 questions** (auditGaps 0), yet bare-number and whitespace
   are exactly the kick-back questions a working gate should have raised to
   God. Third independent datum that the cheap-judge admission line is blind
   (gruntJudge FAIL, deriveCheck FAIL, now admit-in-anger miss).
4. **Loop economics held**: both sources green 1.00; warboss needed 1.70
   attempts vs 1.00 (34 examples are harder to satisfy) → 3.75× cost/green,
   still trivial absolute ($0.006).
5. Human hidden 0.778 ≈ E1b's 0.750 plateau (consistent re-measurement on the
   residual battery).

### Consequence (standing PLAN rule)

The pre-registered consequence fires: warboss decomposition needs an
**ambiguity-resolution pass before the hierarchy is trusted end-to-end** —
but the data narrows *what kind*: not adversarial example generation (error
coverage is already perfect), rather **surfacing underdetermined happy-path
semantics as kick-back questions** (bare-number, whitespace, decimals were
all derivable as "the intent does not decide this"). That is the admission
gate's job; the gate line is the broken organ, and it failed here on a live
artifact, not a calibration synthetic.

### Cost ledger (both attempts + authoring)

| Phase | Cost |
| --- | --- |
| Authoring (decompose, HIGH, shared) | $0.1632 |
| Attempt 1 grinding | $0.0000 |
| Attempt 2 grinding (60 sessions, LOW) | $0.2272 |
| **E2 total** | **$0.3904** |
