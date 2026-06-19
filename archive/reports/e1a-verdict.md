# E1a Verdict — Warboss Second Look

> Date: 2026-06-10
> Author: high-tier review (warboss)
> Responds to: `reports/e1a-findings.md`
> Artifact reviewed: `runs/e1a-20260610T214132Z.json` (run 5, the only valid run)
> Outcome: rung-1 re-run with JS-anchored prompt **before** rung-2 escalation. Spec amended (rev 2). Work item H-4 filed.

---

## New evidence gathered during review

The briefing asked five questions. Before ruling, I pulled three cuts of the
run-5 artifact that the first pass did not:

### 1. Hardcoding spot-check on Arm B — clean

Searched all 30 Arm B impls for canonical-input literals used as comparisons
(`"1h30m"`, `"30m30m"`, `"1h90m"`, etc. against `===`/`==`/object keys): **0/30
hits.** One impl (index 17) contains `"1h30m"` — in a docstring of a *Python*
impl (score 0.167, one of the two singleton clusters). Every JS impl in the
dominant 28-cluster is a general parser (unit-map + scan loop).

**The 96.7% covered pass rate is genuine generalization, not hardcoding.**
Bonus finding: the contract also anchors language — 29/30 Arm B impls are JS
vs 4/30 in Arm A.

### 2. Language census on Arm A — confound confirmed

26/30 Arm A impls are Python (`def`/`elif`/`import re` heuristic); 7 of those
also try to call the Anthropic SDK from inside the function. The harness runs
`node:vm`, so all 26 die at parse/run time. Arm A's "2 clusters" are
**executability clusters, not semantic clusters**: {Python → can't run} and
{JS regex → runs}. Criterion 1's `clusters(A) ≥ 5` was never measured.

### 3. Per-case pass table — two findings the briefing missed

Pass counts out of 30 per hidden case:

| case | A | B | C | D |
|---|---|---|---|---|
| plain-hours | 4 | 29 | 18 | 30 |
| plain-minutes | 4 | 29 | 18 | 30 |
| zero-seconds | 4 | 29 | 18 | 30 |
| three-units | 4 | 29 | 18 | 30 |
| bare-number-2 | 0 | 29 | 0 | **0** |
| carry-minutes | 4 | 29 | 18 | 30 |
| repeat-units | 4 | 28 | 18 | 30 |
| decimal-hours | 0 | **0** | 0 | 30 |
| reversed-order | 4 | 29 | 18 | 30 |
| whitespace | 4 | 29 | 17 | 25 |
| negative (throws) | **26** | 0 | 10 | 28 |
| garbage-unit (throws) | **26** | 0 | 10 | 30 |

**Finding 3a — the throws-grading artifact.** Arm A "passes" the two throws
cases 26/30 — exactly the 26 Python impls. The judge counts *any* `{ok:false}`
as a pass on a `throws` case (the spec's "known accepted limitation"), so an
impl that cannot even parse gets 2/12 free. This is why the dominant Arm A
cluster has mean pass 16.7% instead of 0. Arm A's baseline is distorted in
*both* directions: deflated on value cases (language mismatch), inflated on
throws cases (grading artifact). The limitation is no longer acceptable — it
moved arm-level numbers in a criterion-relevant way.

**Finding 3b — Arm D's bare-number failure is a thesis datapoint.** Opus fails
`"120"` → 120 at **0/30** — and the consistency matters: all 30 picked the same
non-canon interpretation of a case the prose is silent on. Prose ambiguity is
not solved by model tier; it is resolved *differently but confidently*.
Meanwhile Arm B (haiku + contract, which canonizes `"90"` = 90) passes 29/30.
This is the membrane claim in miniature: the convention lives in the contract,
not in the model's intelligence. (The briefing's claim that D "fails decimals"
is wrong — D passes decimal-hours 30/30; B fails it 0/30.)

**Finding 3c — in-arm Corollary D signal inside Arm B.** Arm B scores 0/30 on
*both* throws cases and 0/30 on decimal-hours — precisely the uncovered
behaviors the contract is silent on. Where the contract speaks, B is at
28–29/30; where it is silent, B confidently does the wrong thing (returns a
value instead of throwing, truncates the decimal). That is the Corollary D
shape — partial coverage produces confident wrongness on uncovered behavior —
visible *within* the full-contract arm, independent of the broken A baseline.

---

## Rulings on the five questions

**1. Language confound — confirmed, dominant.** The census settles it. The
correction is (i): anchor JS in the system prompt, uniformly across arms.
Language choice is *not* part of the interpretation surface we can measure,
because the harness can only execute JS — an un-anchored prompt confounds
"interpreted differently" with "wrote a language the runner can't execute."
A polyglot sandbox (option ii) would make language variance measurable but
buys nothing for the thesis and adds execution surface. Treating the rung as
a wash and escalating (option iii) is answered under ruling 4.

**2. Thesis signal — visible and now stronger than the briefing stated.** C2's
0.86 delta survives the confound (it is B-vs-A on covered cases, and B's number
is real per the hardcode check; A's covered baseline is deflated, but even
against Arm D's *clean* 80% covered rate, B is +16.7pp at 9.2× cheaper).
Finding 3b adds an independent line of support. Preliminary — single run,
N=30, one task — but the direction is unambiguous.

**3. Corollary D — C3 verdict voided, corollary alive.** The C-vs-A comparison
is uninterpretable: explanation (b) is confirmed (A's notCovByC baseline is
made of broken Python), so C3's inversion is an artefact. But finding 3c gives
a cleaner signal than the C-arm design did: contract silence produced 0%
correct behavior on uncovered error cases *inside Arm B*. Corollary D is not
refuted; it found different, better evidence. No dispatch-gate design change —
coverage-as-a-gate stands.

**4. Next action — re-run rung 1 JS-anchored; rung-2 escalation deferred.**
The pre-registered trigger ("C1 or C2 fails → escalate to rung 2") fired on a
confounded measurement. Escalating now would carry the same confound into a
harder task and waste the rung-2 instrument. **Deviation, recorded:** re-run
rung 1 as **E1a-r2** with the JS-anchored prompt and the grading fix below;
the escalation rule then applies to r2's verdicts with full force:
- r2 C1 *and* C2 pass → rung 1 concludes, proceed to E1b.
- r2 C1 fails (with language controlled, it is then a real failure) → escalate
  to rung 2 (csv-quoting) per plan before drawing conclusions.
- Run 5 stands as the recorded pilot; no further analysis hangs on it.

**5. Hardcoding spot-check — done during this review, clean (see above).** No
re-run needed for this question; r2 should preserve the check as a standing
analysis habit, not an automated gate (regex-level detection is too weak to
gate on).

---

## Harness defects to fix before r2 (spec rev 2, handed off as H-4)

1. **JS anchor:** `E1A_SYSTEM` gains "in JavaScript", uniform across arms.
2. **Viability gating on throws cases:** an impl that passes zero non-throws
   hidden cases is non-viable; its throws-case entries are forced false and
   the run record carries `viable: false`. Kills the finding-3a artifact
   mechanically instead of by footnote.
3. **Dead-run guard:** a live run whose ledger totals $0, or where every arm's
   every score is zero, fails loudly (nonzero exit + warning in the artifact).
   Runs 1–4 burned four silent attempts on a defect this guard catches in one.

## For the roadmap (plan-level, recorded in duh_plan.md)

- **E1b stays blocked on r2.** Its economics criterion compares against Arm D;
  it needs a clean rung-1 baseline.
- **Contract canon note for future tasks:** finding 3c means a "full" contract
  whose examples cover only the happy path still leaves a Corollary D hole on
  error behavior. When the warboss authors contracts (Phase 4 / E2), error
  behavior needs at least one canonical example — pin this in the E2 design.
- **Grunt-readiness-judge calibration (pinned idea):** r2's variance numbers,
  not run 5's, are the calibration target — run 5's cluster counts measure
  language executability, not latitude.
