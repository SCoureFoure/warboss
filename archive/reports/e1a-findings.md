# E1a Findings — Second-Look Briefing

> Date: 2026-06-10  
> Author: first-pass synthesis (Sonnet 4.6)  
> Audience: Warboss (high-tier reviewer)  
> Artifact: `runs/e1a-20260610T214132Z.json`  
> Purpose: surface the raw findings, anomalies, and open interpretive questions for a second opinion before drawing conclusions or advancing to E1b.

---

## What E1a was designed to prove

The warboss thesis: a frozen executable contract (the membrane) collapses interpretation variance in cheap models, yielding correctness-per-dollar that beats a high-model one-shot. E1a is the single-shot, no-retry calibration instrument — it does not yet test the retry loop (that is E1b), only whether the contract changes behavior at all.

Four arms, N=30 independent single-shot generations each:

| Arm | Model | Prompt | Isolates |
|-----|-------|---------|----------|
| A | haiku (LOW) | prose only | baseline: max entropy, no contract |
| B | haiku (LOW) | prose + full contract (all 5 canonical examples + frozen hash) | contract effect |
| C | haiku (LOW) | prose + partial contract (2/5 examples, `basic-hm` + `seconds-only`) | Corollary D: does partial contract hurt uncovered cases? |
| D | opus (HIGH) | prose only (identical to A) | model-tier effect, no contract |

Task: `parseDuration(s)` — convert a human-readable duration string to seconds. Requirement deliberately silent on: bare numbers (`"90"` = 90s), repeated units (`"30m30m"` = 3600), carries (`"1h90m"` = 9000), decimals (`"1.5h"` = 5400), order (`"30m1h"` = 5400), whitespace, and invalid input (throws). Hidden battery: 12 cases, 5 covered by at least one canonical example, 7 uncovered.

Pre-registered criteria (written before any run):
1. `clusters(B) ≤ 2 AND clusters(A) ≥ 5`
2. `meanPassRate(B, covered) − meanPassRate(A, covered) ≥ 0.15`
3. `meanPassRate(C, notCovByC) ≤ meanPassRate(A, notCovByC)` (partial contract hurts or matches on uncovered cases)
4. Economics: deferred to E1b

---

## Run inventory — critical context

Five runs exist. **Only run 5 contains valid data.** Runs 1–4 produced $0 cost, all-zero pass rates, and single-cluster results across all arms — consistent with a harness defect that prevented code extraction or execution. The defect was resolved before run 5.

| Run | Timestamp | Total cost | Status |
|-----|-----------|-----------|--------|
| 1 | 20260610T213538Z | $0.00 | **all-zero — harness bug** |
| 2 | 20260610T213631Z | $0.00 | **all-zero — harness bug** |
| 3 | 20260610T213758Z | $0.00 | **all-zero — harness bug** |
| 4 | 20260610T213951Z | $0.00 | **all-zero — harness bug** |
| 5 | 20260610T214132Z | $0.51 | **valid** |

All analysis below is from run 5 only. There is no replication data.

---

## Results — run 5

### Per-arm summary

| Arm | Model | Clusters (sizes) | Mean pass | Covered pass | Uncovered pass | notCovByC pass | Cost |
|-----|-------|-----------------|-----------|-------------|----------------|----------------|------|
| A | haiku | 2 (26, 4) | 23.3% | 10.7% | 32.4% | 26.7% | $0.057 |
| B | haiku | 3 (28, 1, 1) | 72.8% | **96.7%** | 55.7% | 64.8% | $0.041 |
| C | haiku | 4 (17, 10, 2, 1) | 45.3% | 48.0% | 43.3% | 40.4% | $0.037 |
| D | opus | 3 (23, 5, 2) | **89.7%** | 80.0% | **96.7%** | 86.3% | **$0.379** |

### Criteria verdicts

| Criterion | Verdict | Detail |
|-----------|---------|--------|
| 1 — variance collapse | **FAIL** | clusters(B)=3 ≤ 2 ✗ AND clusters(A)=2 ≥ 5 ✗ |
| 2 — correctness delta | **PASS** | B covered − A covered = 0.967 − 0.107 = **0.860** (threshold 0.15) |
| 3 — Corollary D | **FAIL** | C notCovByC = 0.404 > A notCovByC = 0.267 (expected ≤) |
| 4 — economics | deferred | E1b |

---

## Anomalies requiring second-look interpretation

### 1. Arm A collapsed to 2 clusters, not ≥ 5

The criterion expected haiku without a contract to fan out across ≥ 5 behavioral clusters. Instead it produced only 2: a dominant cluster of 26 with identical all-false vectors (mean pass 16.7%) and a minor cluster of 4 with a common JS regex-based pattern (mean pass 66.7%).

Examining the code: the dominant cluster is ~80% Python impls that largely fail because the harness runs JS (`node:vm`). Several also call out to the Anthropic SDK from inside the generated function (language/runtime mismatch + API misuse). The minor cluster is JS with a working regex. Haiku's variance is behavioral (two paradigms: Python vs JS), not interpretation variance within one language.

**Question for warboss:** Is the low cluster count a task-specific artifact (haiku defaulting to Python, which fails the JS runner, creating artificial convergence on a failure mode)? If so, C1 failing does not falsify the variance-collapse claim — it means Arm A's "variance" is language-choice variance rather than semantic variance, which is a different phenomenon. Should the experiment control for language, or is language choice part of the interpretation surface?

### 2. Arm B covered pass rate (96.7%) exceeds Arm D covered pass rate (80%)

Haiku with the full contract beats opus without it on covered cases. This is the core thesis signal in preliminary form. But the cause warrants inspection: the contract injects exact I/O pairs, which may cause Arm B to hardcode the examples rather than implement the general function. If Arm B's impls are over-fitted to the canonical examples (i.e., they match the covered hidden cases only because the covered hidden cases share expected values with canonical examples), this is an artefact rather than generalization evidence.

Arm B's uncovered pass rate (55.7%) is non-trivial and higher than Arm A's (32.4%), suggesting the contract does generalize somewhat beyond the literal examples — but this needs case-level inspection.

**Question for warboss:** Does the contract produce genuine generalization, or is 96.7% on covered cases explained by hardcoding? Recommend inspecting a sample of Arm B impls for hardcoded if/else on canonical inputs.

### 3. Arm C (partial contract) helped on uncovered cases — Corollary D not supported

C3 expected partial contract to hurt or match on uncovered cases (≤). The result is 40.4% vs 26.7% — partial contract helped. Two possible explanations:

(a) **Transfer generalization:** seeing 2 canonical examples anchors the model on the h/m/s unit system and JS, which generalizes to uncovered cases even without those examples.  
(b) **The Arm A baseline is depressed by Python failures:** if most of Arm A's failures are language-mismatch failures (Python in a JS runner), then the "no contract" baseline is artificially low. Arm C's contract is also JS, so it suppresses Python generation and trivially outperforms a depressed A baseline.

If (b) is the correct explanation, C3's failure is an artefact of the same language issue as C1's failure, not a genuine refutation of Corollary D.

**Question for warboss:** Does the task design — running impls in `node:vm` without language specification — confound interpretation variance with language-choice variance? If yes, how should this be corrected: (i) specify JS in the system prompt, (ii) run a polyglot sandbox, or (iii) treat this rung as a wash and escalate to rung 2?

### 4. Arm D (opus, prose-only) underperforms Arm B (haiku, full contract) on covered cases

80% vs 96.7% on covered cases. Opus with prose fails on bare numbers and decimals (uncovered hidden cases where it actually does better: 96.7%). This means opus is better at generalizing to edge cases from prose, but worse at locking onto the exact canonical-example behavior. This is directionally coherent — a higher-entropy prompt to a higher-model produces a "smarter" but less predictable implementation — but it is worth noting.

**Question for warboss:** Is the covered/uncovered split informative here, or is it masking the fact that Arm D's 80% covered pass rate is simply because it gets some covered-adjacent cases wrong that are genuinely hard (e.g., `repeat-units` = `"30m30m"` → 3600 is unusual)?

### 5. Cost signal (preliminary — E1b settles this)

| Comparison | Cost | Covered pass |
|------------|------|-------------|
| B (haiku + contract, single-shot) | $0.041 | 96.7% |
| D (opus, single-shot) | $0.379 | 80.0% |
| B/D ratio | 9.2× cheaper | +16.7 pp |

B beats D on both dimensions in single-shot. E1b adds the retry loop cost, which may change this, but the single-shot baseline is favorable for the thesis.

---

## Pre-registered escalation condition

The plan specifies: if criterion 1 or 2 fails at N=30 on rung 1, escalate to rung 2 (CSV quoting) before drawing conclusions. C1 failed, C2 passed strongly.

**Interpretation ambiguity:** the spec escalation trigger fires when C1 or C2 fails. C1 did fail. But C1 may have failed for a confounded reason (language-choice variance) rather than because the contract failed to collapse variance. If the cluster counting is measuring language choice rather than semantic variance, C2's strong pass is the more reliable signal and escalation to rung 2 may be premature.

**Question for warboss:** Does C1's failure, given the apparent language-confound hypothesis, justify escalating to rung 2 before drawing conclusions? Or should we first re-run with a JS-anchored system prompt to isolate semantic variance from language variance?

---

## What this briefing is asking for

Your judgment on:

1. **Language confound:** Is the Arm A Python-vs-JS split the dominant explanation for C1's failure and C3's inversion? If yes, what is the right correction?
2. **Thesis signal strength:** Given C2 (0.86 delta, strongly PASS) and the cost comparison (9.2× cheaper, higher covered pass rate), is the core thesis signal already visible despite C1/C3 failures?
3. **Corollary D status:** Is C3's failure a genuine refutation of Corollary D for this task, or an artefact? Does this change the dispatch-gate design?
4. **Next action:** Re-run rung 1 with JS-anchored prompt? Escalate to rung 2 as specified? Both? Proceed to E1b on current evidence?
5. **Hardcoding risk in Arm B:** Should a spot-check of B impls be run before trusting the 96.7% covered pass rate as a generalization signal?

---

## Appendix — raw data references

- Spec: `specs/e1a-harness.spec.md`
- Plan: `duh_plan.md` (E1a section, saturation risk + escalation notes)
- Valid run artifact: `runs/e1a-20260610T214132Z.json`
- Harness entry: `src/experiment/e1a.ts`
- Task assets: `tasks/duration-parse/`
