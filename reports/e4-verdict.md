# E4 verdict — battery authoring (close the kick-back loop)

> **E4 criterion: PASS** — on a NEUTRAL God-authored oracle the re-authored
> warboss contract reaches **0.918**, not merely ≥ 0.90 × human (0.724) but
> **above human outright**. The same comparison FAILed as E2 (0.667) against the
> old human-coin-flip battery. The driver is error coverage: human scores
> **0.000** on every error-path God case (its contract pins no error behavior —
> the Corollary-D hole), warboss **0.878** (God told it to throw; it authored
> throws examples). **The kick-back loop — escalate → God answers → re-author —
> closes the E2 gap end-to-end, measured on a battery that encodes neither
> author's coin flips.** Total cost: $0.252.
> Artifact: `runs/e4-20260614T144326Z.json` · re-author:
> `runs/decompose-20260614T144347Z.json`.

---

## rev-3 rerun (2026-06-14) — decimal now scored, gap widened

> **Still PASS — and the decimal class is now measured.** Re-run on the rev-3
> battery (H-28: `extraCases` + ordering rulings): warboss **0.961** vs human
> **0.545** (threshold 0.491). The gap *widened* vs the original run (0.918 vs
> 0.724) because the decimal class — **excluded and unmeasured** in the original
> run — is now scored. Total cost: $0.173. Artifact:
> `runs/e4-20260614T222406Z.json` · re-author: `runs/decompose-20260614T222423Z.json`.

**Headline (rev-3):**

| | human | warboss | threshold |
| --- | --- | --- | --- |
| meanFinalHiddenScore (God oracle) | 0.545 | **0.961** | ≥ 0.491 → **PASS** |
| meanHappyScore | 0.750 | 1.000 | — |
| **meanErrorScore** | **0.000** | **0.856** | — |
| meanAttempts | 1.00 | 1.13 | — |

God battery: total **14** = 7 untouched task-hidden + 5 overrides-in-place +
**2 appended decimal extras** (`"2.5h"`→9000, `"0.5h"`→1800). Residual **11**,
exclusions **3**.

**What rev-3 fixed — decimal measurement (verdict candidate #2, discharged).**
The original run excluded `decimal-hours "1.5h"` entirely because the warboss
author coincidentally chose `1.5h` as its own example (`leakedBy: ["warboss"]`).
H-28's `extraCases` added two more inputs of the *same class* — `"2.5h"`,
`"0.5h"` — to the decimal ruling. In this run the canonical `1.5h` was **again**
self-echoed and excluded, **but the extras survived** and carried the decimal
class into the residual. This is exactly the H-28 design: the decimal class is
scored when ≥1 of {canonical, extras} survives the self-leak filter; the author
can echo at most one input. The class is now measured despite the (recurring)
canonical self-echo.

**New residual — ordering happy-lift still unmeasured (verdict candidate #3,
NOT discharged).** The three exclusions this run were `decimal-hours`,
`repeat-units "30m30m"`, and `reversed-order "30m1h"` — all `leakedBy: ["warboss"]`.
H-28 added God ordering rulings (`30m30m`→3600, `30m1h`→5400) precisely to
measure whether the loop lifts the happy path on repeat/reversed unit order. But
the warboss author echoed **both** ordering inputs as its own examples, so both
were excluded from the residual — the ordering rulings overrode the hidden cases
in place (overridden=5) yet never reached scoring. **The ordering happy-path
question remains open.** rev-4 candidate: apply the same `extraCases` mitigation
to the ordering rulings (give each a sibling input the author is unlikely to
echo), or add a render-hint forbidding the author from using a ruling input as
an example. The self-echo mechanism is now the dominant source of residual
erosion (3/3 exclusions this run).

**Multi-task replication (verdict candidate #4)** — discharged in a sibling run
on `parse-range`; see `reports/e4-parse-range-verdict.md` (warboss 1.000 vs human
0.646, same error-coverage signature).

**Production wiring (verdict candidate #1)** — discharged via the live kick-back
pair; see `reports/kickback-live-verdict.md`.

---

## Run metadata

Run: 2026-06-14 · task `duration-parse` · N=30 sessions/source · granularity
`full` · `deadRun: false`. God-answers: `tasks/duration-parse/god-answers.json`
(3 rulings: `"120"`→throws, `" 1h 30m "`→5400, `"1.5h"`→5400).

- **Author arm:** HIGH (opus-4-8) — one rev-4 `decompose`, `maxRequirements: 1`,
  God decisions rendered into `context` as **literal-free prose** (E4 rev 2 /
  H-26). Authoring cost $0.056.
- **Grinding arm:** LOW (haiku-4-5) — `runE2` over the God battery, both contract
  sources, same loop. Grinding cost $0.196.

God battery: 12 cases = 9 untouched task-hidden + 3 God rulings, each of which
**overrode an existing hidden case in place** (all three contested inputs were
already in the hidden battery). Scored residual: **11** (one excluded, below).

## Headline numbers

| | human | warboss | threshold |
| --- | --- | --- | --- |
| meanFinalHiddenScore (God oracle) | 0.724 | **0.918** | warboss ≥ 0.652 → **PASS** |
| meanHappyScore (8 cases) | 0.996 | 0.933 | — |
| **meanErrorScore (3 cases)** | **0.000** | **0.878** | — |
| greenRate | 1.00 | 1.00 | — |
| meanAttempts | 1.00 | 1.77 | — |
| grinding cost | $0.046 | $0.149 | — |
| `hasErrorExample` | false | true | — |

Compare E2 (`reports/e2-verdict.md`, old fixed battery): warboss 0.667 < 0.700 =
**FAIL**. Same loop, same grunt; the change is (a) the neutral oracle and (b) the
re-author informed by God's answers.

## Per-case scoring (residual, 30 sessions/source)

| idx | case | God ruling | human | warboss |
| --- | --- | --- | --- | --- |
| 4 | `bare-number-2` `"120"` | **throws** (was happy `120` in E2) | **0.00** | **1.00** |
| 8 | `whitespace` `" 1h 30m "` | 5400 | 0.97 | 1.00 |
| 9 | `negative` `"-1h"` | throws | 0.00 | 0.63 |
| 10 | `garbage-unit` `"1x"` | throws | 0.00 | 1.00 |
| 0–3,5 | plain/zero/multi/carry happy | values | 1.00 | 1.00 |
| 6 | `repeat-units` `"30m30m"` | value | 1.00 | 0.77 |
| 7 | `reversed-order` `"30m1h"` | value | 1.00 | 0.77 |
| — | `decimal-hours` `"1.5h"` | 5400 | **EXCLUDED** | **EXCLUDED** |

## Reading the measurement

1. **The error path is the whole story — and it is the kick-back loop's payoff.**
   The human `duration-parse` contract carries zero `throws` examples (the
   Corollary-D hole E1b first measured). On the three God error cases the human
   grunt scores 0.000 across the board — it never learned to reject. Warboss,
   handed God's "this input is invalid" rulings, authored throws examples and its
   grunt scores 0.878. This is exactly the sharp prediction E2 made and could not
   confirm (E2's battery was confounded); E4 confirms it on a neutral oracle.

2. **`"120"` is the clean confound-removal datum.** In E2 the fixed battery
   encoded the human author's coin flip `"120" → 120` (treat as 120 seconds), and
   warboss — which threw on bare numbers — *lost* that case 0/30. God independently
   ruled `"120"` **invalid → throws**. On the God oracle the polarity flips:
   warboss 1.00, human 0.00. The E2 "loss" was never a warboss error; it was the
   battery scoring warboss against one human's arbitrary resolution. Replace the
   coin flip with the owner's ruling and the delegation bet wins the case.

3. **Prose-only rendering worked for 2 of 3 contested inputs; decimal hit the
   predicted backstop.** Rev 2 (H-26) removed the input literal from the owner
   decisions so the contested cases would survive the contamination filter.
   `"120"` and `" 1h 30m "` survived and were scored. `"1.5h"` was **excluded**:
   the warboss author, told "a fractional quantity before a unit is accepted …
   result is 5400 seconds," coincidentally chose `1.5h` itself as its
   representative example → the literal entered the warboss prompt → the residual
   filter excluded `decimal-hours` (`leakedBy: ["warboss"]`). This is precisely
   spec rev-2 prediction #3: prose-only makes the leak *rare* (1/3, by
   coincidence), not *guaranteed* (3/3, as rev 1 was). The PASS rests on 11/12
   scored cases — robust — but decimal itself remains unmeasured here.

4. **Warboss trails human slightly on the happy path (0.933 vs 0.996).** Two
   cases drag it: `repeat-units "30m30m"` and `reversed-order "30m1h"` at 0.77.
   The denser warboss contract (more examples, error mandate) costs more to
   satisfy — meanAttempts 1.77 vs 1.00, grinding 3.2× — and occasionally a grunt
   final still misses an unusual happy case. The error-path gain (+0.878)
   dwarfs the happy-path give-back (−0.063); net warboss > human.

5. **Treatment asymmetry stands, and is the point.** Only the warboss arm
   received God's answers; the human contract is frozen and never got a
   kick-back. E4 measures the VALUE OF THE LOOP — machine authoring *with*
   escalation-and-answer vs human authoring *without* — not authoring talent in
   the abstract. A symmetric test is impossible (the human asset cannot be
   re-authored). The headline is therefore "the kick-back loop beats an
   un-kicked-back human contract on a neutral oracle," not "machines author
   better than humans."

## Consequence

E4 PASS closes the chain E1→E2→E3→E4. E1 settled that a dense contract collapses
a cheap grunt's variance; E1b located the residual as authoring debt (Corollary
D); E2 measured the debt and FAILed because the fixed battery encoded the human
author's coin flips; E3 showed the author tier can surface the underdetermined
points as escalations pre-freeze; **E4 shows that once the owner answers those
escalations, the re-authored contract closes the gap end-to-end on a neutral
oracle.** The delegation bet is won on the load-bearing experiment.

**Next-leg candidates (post-E4):**

1. **Production wiring** — the experiment chain is done; the next leg is wiring
   `escalations → owner-answer queue → re-author` into the live `decompose-run`
   path so the kick-back is a standing pipeline stage, not an experiment harness.
2. **E4 rev 3 — decimal measurement** — `"1.5h"` was excluded by a coincidental
   warboss self-example. Options: forbid the author from using the exact ruling
   input as an example (a render hint), or run a second God battery whose decimal
   case uses a different fractional input (`"2.5h"`) so the prose ruling and the
   scored input differ. Either lets E4 score the decimal case it currently can't.
3. **Owner happy-path coverage** — warboss's two happy dips (`30m30m`, `30m1h` at
   0.77) suggest the re-author under-pins repeat/reversed unit ordering; a God
   ruling on ordering semantics (or a denser author mandate there) would test
   whether the loop also lifts the happy path, not just the error path.
4. **Multi-task replication** — E4 is one task (`duration-parse`). The loop's
   value should replicate on a second task before the pipeline is trusted broadly.

## Cost ledger

| Phase | Model | Cost |
| --- | --- | --- |
| Authoring: re-author decompose (HIGH) | opus-4-8 | $0.05649 |
| Grinding: human arm, 30 sessions (LOW) | haiku-4-5 | $0.04640 |
| Grinding: warboss arm, 30 sessions (LOW) | haiku-4-5 | $0.14927 |
| **E4 total** | | **$0.25216** |

One shared `cost-ledger-20260614T144326Z.jsonl` (E4 rev-2 single-sidecar fix —
authoring + grinding in one file).

---

## Addendum — rev-4 render-hint rerun (2026-06-15, PASS), candidate #3 DISCHARGED

**Run:** `e4-20260615T141249Z.json` · re-author `runs/decompose-20260615T141316Z.json` · total **$0.606278** (authoring $0.073270 HIGH, grinding $0.533008 LOW). H-30 / e4 spec rev 4 / kickback spec rev 2.

**Result: PASS — warboss 0.985 ≥ 0.900 × human 0.615 (threshold 0.554).** God battery total=14, residual=13, **exclusions = 1** (down from **3** in the rev-3 rerun).

**The render-hint discharged candidate #3 (ordering happy-lift).** The literal-free `DECISION_DIVERSITY_HINT` (appended to the shared `renderDecisionBlock`) steered the warboss author off the obvious ordering inputs: the rev-3 rerun excluded BOTH `repeat-units "30m30m"` and `reversed-order "30m1h"` (author self-echo); this run excludes **neither** — both survive the residual and are scored. With ordering in-battery, warboss is 0.985 overall versus its earlier 0.77 dip on exactly those two cases. The dominant residual-erosion mechanism (self-echo, 3/3 last run) collapsed to 1/3.

**The one residual exclusion is the decimal extra-case `"2.5h"`** (`god-2-extra-0`, `leakedBy: ["warboss"]`) — the author still coincidentally echoed one fractional input. **But the decimal CLASS stayed scored anyway**, exactly as rev-3 `extraCases` was designed: with `{1.5h, 2.5h, 0.5h}` all pinning the same ruling, one echo does not erase the class. This is the **hint (probabilistic) and extraCases (hard backstop) working together** — the hint removed two of three echoes, the backstop absorbed the third.

**Reading the measurement.** The offline ACs (kickback AC10, e4 AC13) only proved the hint reaches the author prompt; this live rerun is the proof it *changes author behavior* — self-echo fell from 3 to 1. It remains probabilistic (a literal-free hint cannot name the inputs to avoid), so the residual `2.5h` echo is expected, not a regression; the `extraCases` redundancy is the guarantee, the hint is the global discipline that makes echoes rare.

**Cost note:** total **$0.61**, ~4× the $0.15 pre-estimate — grinding 30 sessions × 2 arms on the denser warboss contract dominates ($0.533). The estimate was low; the result is unaffected.

## Consequence

**All four e4-verdict §Consequence candidates are now discharged** (#1 production wiring, #2 decimal, #3 ordering happy-lift, #4 multi-task replication). The E1→E4 chain is closed with no open residual. Next: **H-31 SYNTHESIS.md** — the correctness-per-dollar writeup over the whole chain.
