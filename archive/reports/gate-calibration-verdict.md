# Gate-calibration verdict — LOW-tier gruntJudge vs r2 anchors

> Run: 2026-06-11 (artifact `runs/gate-calibration-20260612T022723Z.json`,
> UTC stamp) · N=20 per config · task `duration-parse` · judge LOW tier
> (haiku-4-5) · total cost **$0.0706**.
> Protocol: `specs/readiness-gate.spec.md` "Calibration protocol" — compare
> READY rates against E1a-r2 viable-only modal shares.

## Results

| Config | Prompt | READY rate | r2 modal-share anchor | malformed | questions |
| --- | --- | --- | --- | --- | --- |
| A | prose only | **0.850** | 0.600 | 0 | 31 |
| B | full contract | **0.700** | 0.967 | 0 | 56 |
| C | partial contract (bare-number hole) | **1.000** | 0.967 | 0 | 0 |

Useful signal was pre-registered as: READY high for B, low for A, and C
revealing whether the judge sees Corollary-D holes.

## Verdict: the LOW-tier judge, as prompted, is NOT a usable gate

1. **Anti-correlation on A vs B.** The judge says READY *more often* for
   bare prose (0.85) than for the full frozen contract (0.70). It rewards
   freedom and penalizes density — the opposite of what admission needs.
2. **B's 56 questions are noise, not signal.** The densest prompt in the
   system drew the most kick-back questions; spot pattern is consistent with
   the judge treating long contracts as "more surface to question" rather
   than "fewer undecided behaviors".
3. **C confirms the pre-registered failure mode.** 20/20 READY, zero
   questions, on the config whose bare-number hole is real and known. The
   spec's own sentence lands: the judge misses Corollary-D holes, so **the
   convergence probe stays mandatory for partial contracts** — and by (1),
   for everything else too, until the judge is reworked.
4. Mechanically clean run: 0 malformed verdicts in 60 calls — the failure is
   judgment quality, not parse plumbing.

## Standing consequences

- `gruntJudge` alone must NOT gate admission. In `admit`, treat READY as
  necessary-but-weak; the probe (or a reworked judge) carries the decision.
  Until then, kicked-back questions from the cheap judge are advisory color,
  not underspecification proof.
- Rework candidates for a rev: ask the judge to enumerate inputs whose
  output it cannot derive from the prompt (mechanical task), rather than
  declare readiness (calibrated-confidence task); and/or MID tier comparison
  run (~$0.07 per config-sweep, cheap).
- The instrument itself is good: one $0.07 sweep cleanly falsified the
  cheap-judge hypothesis. Keep the runner for every judge-prompt rev.
