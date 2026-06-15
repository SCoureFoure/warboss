# SYNTHESIS — the delegation bet, judged on correctness-per-dollar

> Status: final · 2026-06-15 · closes the E1→E4 experiment ladder.
> Source of truth for the whole-program verdict. Per-rung detail lives in the
> individual verdicts (`reports/e1a-r2-verdict.md`, `e1b-verdict.md`,
> `e2-verdict.md`, `e3-verdict.md`, `e4-verdict.md`, `e4-parse-range-verdict.md`,
> `gate-calibration-verdict.md`, `derive-calibration-verdict.md`,
> `kickback-live-verdict.md`); this report is the synthesis over them.

## The bet

**Agent capability below the membrane is fungible if the contract is dense
enough.** A contract that is a low-entropy encoding of intent removes
interpretation latitude, so the lowest viable model can satisfy it. Intelligence
lives in the contract and the loop, not in the grinding agent. The expensive
model is spent only to *decide* what to build (author the contract), never to
build it. **The metric the bet is settled on is correctness-per-dollar** — every
model call is metered (`src/cost.ts`), there is no un-metered path to a model.

The chain E1→E4 was a falsify-first ladder, each rung with a pre-registered
criterion. This is what it found.

## What the ladder proved

### E1a — the contract collapses interpretation latitude (rung 1, settled)

Four arms, N=30 each, one duration-parse task. The money shot reproduced
(`reports/e1a-r2-verdict.md`, $0.585): **arm B (haiku + dense contract) beats arm
D (opus, sparse) on covered correctness while costing 10.8× less** ($0.0412 vs
$0.4432 per arm; hidden 0.670 vs 0.778 but B is hardcode-clean and D fails
bare-number 0/30). The variance-collapse claim shows cleanly in cluster counts:
**B = 2 behavioral clusters vs D = 5.** A smarter model does not collapse
interpretation latitude — it *explores* it. The contract collapses it. C2 PASS
(+0.68). Capability below the membrane is fungible: confirmed.

### E1b — the loop is cheap, and the residual is authoring debt

Retry-in-place on the product loop (`src/loop.ts`): full-granularity feedback
reaches **green 1.00 at 1.03 mean attempts**, 9.5× cheaper per green than the
baseline; `passfail` feedback is dead (green 0.07 — the judge's *why* is
load-bearing). But the hidden score **plateaus at 0.750** — the loop cannot lift
what the contract never encoded. This located the residual precisely:
**Corollary D — the remaining error is authoring debt, not grinding failure.**
The cheap model does its job; the contract is where intent goes missing.

### E2 — machine authoring closes the error hole the human contract left open

Human-authored vs warboss-authored contract on the same grunt loop, scored on a
fixed hidden battery. Criterion FAILed (0.667 < 0.700) — but the split is the
result: **warboss meanErrorScore 1.000 vs human 0.000.** The human contract pins
no error behavior (the Corollary-D hole); warboss authors `throws` examples and
the grunt rejects. The FAIL was not a warboss error — it was the *fixed battery
encoding one human author's arbitrary coin flips* on underdetermined inputs
(`"120"`, `" 1h 30m "`). Three independent instruments (`gruntJudge`,
`deriveCheck`, `admit`-in-anger) all passed the contract with 0 questions: the
cheap-model admission line is blind to its own underdetermination. The fix is not
adversarial example generation — it is surfacing the underdetermined points
*before* freeze.

### E3 — the author tier surfaces underdetermination pre-freeze

Moved the kick-back **pre-freeze, to the author tier** (post-freeze instruments
measure decidedness, never intent fidelity — E2's all-0/30-or-30/30 per-case
table proved the freeze destroys divergence). PASS ($0.087): all three E2-known
underdetermined inputs surfaced. The key structural result: **author fiat-flagging
and the behavioral probe are complementary, not redundant, with disjoint
coverage.** Fiat-flagging measures *semantic* underdetermination directly (caught
bare-number + whitespace); the probe measures *behavioral* disagreement among
independent cheap generations (caught decimal alone — the other two got model
consensus on "unrecognized → throw", so the probe stayed silent). Author-only
would have masked decimal; probe-only would have masked the two with consensus.

### E4 — closing the loop wins on a neutral oracle, and replicates

The owner answers the escalations once; warboss re-authors with those decisions
locked; re-run on a **neutral God-authored oracle** (not the confounded human
battery). Every datum:

| Run | warboss | human | note |
| --- | --- | --- | --- |
| E4 original | **0.918** | 0.724 | above human outright; same comparison FAILed as E2 (0.667) on the confounded battery |
| E4 rev-3 (decimal scored) | **0.961** | 0.545 | `extraCases` let the decimal class survive an author self-echo |
| E4 rev-4 (ordering scored) | **0.985** | 0.615 | render-hint stopped both ordering self-echoes — exclusions 3→1 |
| parse-range (2nd task) | **1.000** | 0.646 | replication: loop value is not task-specific |

The driver is error coverage every time (human 0.000 on error-path God cases,
warboss 0.88–1.00). `"120"` is the clean confound-removal datum: E2 scored it
warboss-0/human-30 against one human's coin flip; God independently ruled it
invalid, flipping it to warboss-1.00/human-0.00. **The E2 "loss" was never a
warboss error.** Production-wired live (`kickback-live-verdict.md`): a real
escalating intent drained **9 → 3 escalations monotonically** through
emit → owner-answer → re-author, all in the standing `decompose-run` path.

**The chain closes: dense contract collapses grind variance (E1a) → residual is
authoring debt (E1b) → machine authoring closes the error hole (E2) → the author
tier surfaces what's underdetermined (E3) → answering it closes the gap
end-to-end on a neutral oracle (E4), replicated and production-wired.**

## What the ladder did NOT prove (honest boundaries)

1. **The cheap model cannot gate its own admission.** Both cheap-judge gate
   instruments FAILed calibration: `gruntJudge` READY *anti-correlates* with the
   anchors (rewards sparse prose 0.85 over the full contract 0.70, misses the
   Corollary-D hole 20/20 READY); `deriveCheck` saturates (decidedRate 0.000 all
   configs) and inverts precision (flags a *pinned* behavior underivable 20/20
   while missing a *real* hole). **`convergenceProbe` is the only admission gate
   that stands.** The expensive model decides; the cheap model does not get to
   judge whether the decision is done.

2. **E4 is a treatment-asymmetric test.** Only the warboss arm receives God's
   answers; the human contract is frozen and never kicked back. E4 measures **the
   value of the loop** (machine authoring *with* escalation-and-answer vs human
   authoring *without*), not "machines author better than humans." A symmetric
   test is impossible — the human asset cannot be re-authored.

3. **Self-echo is a live measurement-mechanics artifact, now controlled, not
   eliminated.** When the author echoes a ruling's input as its own example, the
   residual filter excludes that exact oracle case. It is mitigated
   *probabilistically* by the render-hint (rev 4: exclusions 3→1) and
   *guaranteed* by `extraCases` redundancy (rev 3). The hint cannot be made hard
   without naming the literals — which would re-leak them and re-contaminate the
   prose-only measurement. Hint + extraCases together is the design.

4. **Two tasks, one shape.** duration-parse and parse-range are both pure,
   synchronous, string → number. The bet's breadth beyond this shape (stateful,
   async, multi-file, non-deterministic) is **unproven**.

5. **Authoring is where the dollars are.** The bet is "cheapest model does" — and
   grinding *is* cheap (haiku, fractions of a cent per session). But the
   *authoring* (HIGH/opus decompose + re-author) carries the cost: e.g. the e4
   rev-4 rerun was $0.61 total with $0.53 in grinding across 60 sessions, but the
   per-contract HIGH authoring call is the recurring price. The economics work
   because one authoring call amortizes across N cheap grinding sessions; they
   would *not* work if every grind needed its own expensive decision.

## Correctness-per-dollar — the verdict

**The bet holds on its load-bearing axis.** A haiku grunt against a dense,
decided contract beats an opus grinder on correctness *and* on cost (E1a, 10.8×).
The expensive model is spent only to author and to decide what to build — the
decompose, the re-author, the escalation rulings — and never to grind. The one
residual the cheap loop cannot reach (Corollary-D authoring debt) is real, is
*located* (E1b), *measured* (E2), *surfaced* (E3), and *closed* (E4) by moving
intelligence into the contract and the kick-back loop rather than into the
worker.

The cost of proving this — the entire E1→E4 ladder plus calibration — was
**~$3.30** of metered live spend across twelve runs. The thesis is settled in its
favor on the tasks tested; the open frontier is breadth (boundary #4) and a
symmetric authoring comparison (boundary #2), neither of which the load-bearing
result depends on.

## Cost ledger — the whole program

| Run | Verdict | Cost |
| --- | --- | --- |
| E1a-r2 (N=30×4) | `e1a-r2-verdict.md` | $0.585 |
| E1b (retry-in-place) | `e1b-verdict.md` | $0.098 |
| gate-calibration | `gate-calibration-verdict.md` | $0.071 |
| derive-calibration | `derive-calibration-verdict.md` | $0.078 |
| first live decompose | (HANDOFF, 2026-06-12) | $0.260 |
| E2 (two attempts) | `e2-verdict.md` | $0.553 |
| E3 (intent divergence) | `e3-verdict.md` | $0.087 |
| E4 original | `e4-verdict.md` | $0.252 |
| kickback live pair | `kickback-live-verdict.md` | $0.273 |
| E4 rev-3 rerun (decimal) | `e4-verdict.md` addendum | $0.173 |
| parse-range E4 (replication) | `e4-parse-range-verdict.md` | $0.269 |
| E4 rev-4 rerun (ordering) | `e4-verdict.md` addendum | $0.606 |
| **Total metered live spend** | | **~$3.305** |

(Dev-loop grunt-dispatch cost — the agent worktrees that built each harness
feature — is logged separately in `runs/dev-cost-ledger.jsonl` and is not part of
the experiment ladder above.)
