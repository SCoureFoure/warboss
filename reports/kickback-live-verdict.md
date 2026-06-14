# Kick-back pipeline — live verdict (production wiring)

> **PASS — the kick-back loop runs end-to-end in the live `decompose-run` path.**
> On a real underdetermined intent the pipeline emitted an owner-answer queue,
> the owner answered it by hand, and re-author **drained all answered escalations
> and converged**: 9 → 3, where the 3 residuals are strictly *deeper,
> finer-grain* questions surfaced by the now-more-decided contract — not
> unanswered originals. `auditGaps: 0` throughout. This discharges verdict
> candidate #1 from `reports/e4-verdict.md` (production wiring). Total cost: $0.273.

## Run metadata

Run: 2026-06-14 · `src/experiment/decompose-run.ts` (H-27 production wiring) ·
`maxRequirements: 1`.

Intent: *"Parse a human duration string like '1h 30m' into a total number of
seconds."* — chosen as a known under-determined intent (bare-number / whitespace
/ decimal / ordering all undecided by the prose).

- **Phase-1 (decompose):** `--intent …` → 9 escalations →
  `runs/answers-needed-20260614T222745Z.json`. Artifact
  `runs/decompose-20260614T222745Z.json`. Cost $0.0589.
- **God-gate:** owner authored all 9 `decision` fields by hand (6 fiat affirmed
  the warboss-proposed resolutions; 3 intent-undecided were new rulings:
  leading-zeros/safe-int overflow, Error type/text, non-string coercion).
- **Phase-3 (re-author):** `--reauthor-from … --answers …` → 3 escalations →
  `runs/answers-needed-20260614T223451Z.json`. Artifact
  `runs/decompose-20260614T223451Z.json`. Cost $0.2140.

## The drain

Phase-1 surfaced 9 escalations (6 `fiat`, 3 `intent-undecided`). After folding
the owner's 9 decisions back into a fresh decompose, phase-3 surfaced **3** — all
**new**, none a carried-over original:

1. `fiat` — whether `MAX_SAFE_INTEGER` overflow is checked per-token *in addition
   to* the final sum (a refinement of the owner's overflow ruling).
2. `intent-undecided` — whether leading/trailing ASCII spaces (`' 1h'`, `'1h '`)
   are accepted or throw (the owner pinned *inter-token* separators; the *edge*
   case is a level deeper).
3. `intent-undecided` — whether an empty token from a leading/trailing separator
   behaves differently from internal multiple spaces.

Each is a finer slice of a region the owner's decisions *opened up* by pinning the
coarser behavior. The escalation count is **monotone decreasing** (9 → 3); the
loop converges rather than oscillating.

## Reading the measurement

1. **The wiring works as specified.** Phase-1 emits a queue iff
   `escalations.length > 0`; the owner fills `decision` for each; phase-3 consumes
   `--reauthor-from`/`--answers`, cross-checks provenance, augments the decompose
   context via `renderDecisionBlock`, and re-runs. No step required harness
   surgery — this is the standing `decompose-run` path, not an experiment rig.

2. **Re-author IS a decompose-run (AC9 iterate, confirmed live).** Phase-3 is
   itself a phase-1 — it re-applies the escalation pass to the re-authored
   contract and emits a fresh queue. The 3 residuals come with their own
   re-run hint, so a third round (answer 3 → re-author) would drive toward 0.
   We **stopped at one round**: convergence and full drain-of-answered are
   already demonstrated; a third round adds spend without new signal.

3. **The owner never had to guess silently.** The 6 fiat escalations arrived with
   warboss's own proposed resolution attached (`… → any order accepted; values
   summed`), so affirming them was cheap; only the 3 intent-undecided required
   genuinely new rulings. This is the kick-back's intended ergonomics — surface
   the decision, propose where the author has a defensible default, and reserve
   the owner's attention for the genuinely open points.

## Consequence

Production wiring (verdict candidate #1) is discharged: `escalations →
owner-answer queue → re-author` is a working, converging pipeline stage in the
live path. Together with the E4 rev-3 rerun (decimal scored) and the
`parse-range` replication, **all four `e4-verdict.md` §Consequence candidates are
now addressed** — three discharged (production wiring, decimal measurement,
multi-task replication) and one (ordering happy-lift) re-opened with a concrete
rev-4 fix.

## Cost ledger

| Phase | Model | Cost |
| --- | --- | --- |
| Phase-1 decompose (HIGH) | opus-4-8 | $0.0589 |
| Phase-3 re-author decompose (HIGH) | opus-4-8 | $0.2140 |
| **Live pair total** | | **$0.2729** |
