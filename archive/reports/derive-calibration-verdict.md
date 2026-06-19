# Derive-calibration verdict — `deriveCheck` as the gate-FAIL rework

> Run: 2026-06-12 · task `duration-parse` · LOW tier (haiku-4-5) ·
> N=20 per config · artifact `runs/derive-calibration-20260612T132311Z.json` ·
> cost log `runs/cost-ledger-20260612T132311Z.jsonl` · total **$0.0778**.
> Configs (r2 prompt set): **A** prose-only · **B** full contract (5 examples,
> incl. `parseDuration("90") === 90`) · **C** partial (2 examples:
> `basic-hm`, `seconds-only` — no bare-number). Anchors (gruntJudge READY
> modal-share from r2): A 0.600 · B 0.967 · C 0.967.

## Result: deriveCheck FAILS as a calibration discriminator

| Config | decidedRate | total undecided bullets (20 runs) | bare-number hole flagged |
| --- | --- | --- | --- |
| A (prose-only) | **0.000** | 173 | 2 / 20 |
| B (full, pins `90`) | **0.000** | 131 | **20 / 20 ← false positive** |
| C (partial, no `90`) | **0.000** | 184 | 9 / 20 |

Two independent failures:

**1. `decidedRate` saturates at 0 — degenerate headline metric.**
deriveCheck emits at least one underivable bullet on *every* run of *every*
config, so the first line is `UNDECIDED` 60/60 → `decidedRate = 0` everywhere.
The pre-registered win "decidedRate B > A (density tracks right, reversing
gruntJudge)" is **unmeetable**: any single hole flips the whole run to
UNDECIDED, so the metric cannot resolve density. It is the wrong knob.

**2. Precision is broken — false-positive holes on *pinned* inputs.**
Config B's prompt contains `parseDuration("90") === 90` verbatim (confirmed:
hash `854c9eb8…`). deriveCheck nonetheless enumerated *"a bare number should
be interpreted as seconds, or if this is an invalid input"* as **underivable
in all 20 runs**. It flags an input the contract decides. Meanwhile config A —
where bare-number genuinely *is* underivable — flagged it only 2/20 (**low
recall on the true hole**), and C (also lacks it) 9/20.

So the bare-number signal is strongest exactly where it is *wrong* (B) and
weakest where it is *right* (A). The pre-registered win "config C enumerates
the bare-number hole gruntJudge missed 20/20" is only partially met (C 9/20)
and is contradicted by the instrument's own loudest signal being a B
false-positive.

## Reading: opposite pathology to gruntJudge, not a fix

`deriveCheck` was the gate-calibration FAIL rework — swap *confidence*
(gruntJudge declares READY) for *enumeration* (recall the underivable inputs).
It traded one failure mode for its mirror image:

- **gruntJudge**: over-confident — 20/20 READY, **0 recall** on the
  Corollary-D holes (`reports/gate-calibration-verdict.md`).
- **deriveCheck**: over-skeptical — 60/60 UNDECIDED, decidedRate 0, **low
  precision** (false-positive holes on pinned inputs), recall on the true hole
  noisy and non-monotone in density.

Neither instrument tracks contract density cleanly. The single honest gain:
deriveCheck's recall on a genuine hole is **nonzero** (A 2/20, C 9/20) where
gruntJudge's was flat zero — but the gain is swamped by false positives, so it
is not usable as an automated gate as built.

## Net verdict

**FAIL as a gate / calibration instrument.** The probe stays mandatory
(unchanged from gate-calibration). `deriveCheck` is not promotable to an
automated readiness gate in its rev-1 form.

## Candidate reworks (rev 2, planner's call)

1. **Drop `decidedRate`; report a per-input derivability matrix.** Score
   deriveCheck on *which* inputs it flags vs a ground-truth hole set, not on a
   whole-run binary. The metric must be hole-level, not run-level.
2. **Fix precision: instruct deriveCheck to first list contract-pinned inputs
   as DECIDED, then enumerate only the residual.** The B false positive is the
   model failing to subtract the pinned set before enumerating.
3. **Density monotonicity is the real target** (A 173 → B 131 holes *does*
   drop with the full contract; C 184 breaks it — partial contract may anchor
   the model to enumerate *more* adjacent ambiguity). Worth a MID-tier judge
   comparison, cheap.

## Cost

| Phase | Cost |
| --- | --- |
| deriveCheck × 60 (LOW) | $0.0778 |
