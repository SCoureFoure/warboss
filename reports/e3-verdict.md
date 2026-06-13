# E3 verdict — intent-divergence surfacing (kick-back leg)

> **E3 criterion: PASS** — all three E2-known underdetermined inputs surfaced
> by at least one pre-freeze instrument. **On genuine signal the two arms are
> disjoint:** author (fiat escalations) caught bare-number + whitespace; probe
> (split) caught decimal — and decimal is caught by probe ALONE. The artifact's
> `e3Criterion` also marks decimal `surfacedByAuthor: true`, but that is a
> **needle false positive** (the needle `"decimal"` matched an unrelated
> Unicode-digits escalation, not the `1.5h` case — see Author arm below). PASS
> is robust to the FP; the attribution is not. Total cost: $0.087.
> Artifact: `runs/e3-20260613T191532Z.json`.

## Run metadata

Run: 2026-06-13 · task `duration-parse` · k=8 probe grunts · 12 candidate
inputs · artifact `runs/e3-20260613T191532Z.json` · `deadRun: false`.

Author arm: HIGH tier (opus-4-8) decompose + audit.
Probe arm: LOW tier (haiku-4-5) intentProbe — **k=8 grunts TOTAL** (not per
input). Each grunt generates ONE contract-free impl; each viable impl is then
executed across all 12 candidate inputs; a split = ≥2 distinct outcome keys
among the viable impls on a given input ([gate.ts:438](../src/gate.ts#L438)).

## Headline numbers

| Instrument | bare-number `"120"` | whitespace `" 1h 30m "` | decimal `"1.5h"` | Genuine |
| --- | --- | --- | --- | --- |
| Author (fiat escalation) | **caught** | **caught** | FP¹ | 2/3 |
| Probe (split) | missed | missed | **caught** | 1/3 |
| Surfaced (OR, genuine) | **yes** (author) | **yes** (author) | **yes** (probe) | **3/3 → PASS** |

¹ Artifact reports `surfacedByAuthor: true` for decimal, but it is a needle
false positive (matched `"decimal"` in an unrelated Unicode-digits escalation).
Removing it, the two arms' genuine catches are **disjoint** and the OR still
covers all three. Pre-registered criterion (ALL THREE surface) met.

## Pre-registered prediction accuracy

| Known | Pre-reg prediction | Actual |
| --- | --- | --- |
| bare-number | probe-split | author-only — **pre-reg wrong** |
| whitespace | author fiat-flag ✓ | author-only — **pre-reg correct** |
| decimal | live question | probe genuine; author = needle FP — **probe alone** |

## Per-instrument detail

### Author arm

Decompose (rev 4) produced **1 requirement, 8 fiat resolutions, 4 intent-undecided escalations, 0 auditGaps**.

The two E2 happy-path failures each appear explicitly as fiat escalations:

```
parse-duration-to-seconds: fiat — Whether a bare number with no unit (e.g. '90') is valid
  → Invalid; every digit group must be followed by a unit, so '90' throws

parse-duration-to-seconds: fiat — Whether whitespace is permitted anywhere in the string
  → No whitespace allowed; any whitespace throws
```

Both are tagged `"basis": "fiat"` in the resolutions array, which means warboss
flagged them as author-supplied coin flips with no prose justification. The
spec's needle-match rule matches escalation #4 on `"bare"` + `"no unit"`
(bare-number needles) and escalation #5 on `"whitespace"`. **These are genuine
catches** — the escalation text is squarely about the underdetermined input.

**Decimal is NOT genuinely caught by the author arm.** The artifact's
`e3Criterion` marks `surfacedByAuthor: true` for decimal, but tracing the
needle match: decimal needles are `["decimal", "1.5", "fraction",
"non-integer", "float"]`, and the only escalation containing any of them is
intent-undecided escalation #11 — *"Whether non-ASCII **decimal** digits like
Unicode numeral characters are accepted"*. That escalation is about Unicode
numeral acceptance, **not** about the `1.5h` decimal-point case. The substring
`"decimal"` collided. No fiat resolution or escalation actually addresses
fractional-hour parsing. So the author arm genuinely surfaced **2 of 3**; the
third is a needle artifact.

This is an **E3-instrument finding**: the needle list is a substring matcher and
can spuriously credit the author arm. It does not change the PASS (decimal is
genuinely caught by probe), but a rev-2 evaluator should tighten decimal needles
(drop bare `"decimal"`; require `"1.5"` / `"fractional"` / `"decimal point"` /
`"decimal hour"`).

The 4 intent-undecided escalations cover genuine spec blanks (error type for
grammar violations, very-long-digit overflow, non-ASCII/Unicode digits, Unicode
surrogates). bare-number and whitespace were resolved by **fiat** (escalations
4 and 5, not left open); decimal landed in **none** of the twelve escalations.

### Probe arm

8 impls generated, **4 viable, 4 nonviable** (50% discard rate). Across all 12
inputs run over the 4 viable impls, exactly **one** split:

| input | outcomes (over 4 viable impls) | verdict |
| --- | --- | --- |
| `"1.5h"` | `value:18000` ×1 vs `value:54000` ×3 | **split — divergence detected** |

The two output clusters: **54000s** is consistent with stripping the decimal
point (`"1.5h"` → `"15h"` → 15×3600), the 3-impl majority; **18000s** = 5×3600
is the lone divergent reading. **Neither equals 5400s** — the value a "1.5 hours
→ 5400s" reading would give — so all four impls are "wrong" against a battery
that accepts `1.5h` as 1.5 hours. But they *disagree with each other*, and that
inter-impl disagreement is what the probe detects. The probe measures
divergence, not correctness; here divergence happens to fire.

bare-number and whitespace produced **no split** — all 4 viable impls converged
on the same behavior (throw) without any contract. This is the load-bearing
observation: when the model population uniformly agrees on an underdetermined
point, a divergence probe **cannot** detect the ambiguity. It surfaces only
ambiguity that manifests as *behavioral disagreement*. For bare-number and
whitespace the model's prior ("unrecognized input → throw") is strong enough to
produce consensus without a spec — consensus on the answer that *loses* against
a battery that says accept, but consensus nonetheless, so the probe stays silent.

**The nonviable rate (4/8) is elevated** — the probe prompt has no contract
section, only task prose + `Implement: ${entry}`. Some grunts apparently
produced implementations that didn't parse as callable (nonviable). This is an
AC8-adjacent signal: the probe is operating without the scaffolding a real
contract provides and the viability floor may limit split resolution at small k.

## Reading the measurement

1. **Fiat-flagging is the primary kick-back signal.** The two E2 divergences
   (bare-number, whitespace) were recoverable by fiat escalation alone. The
   author arm resolved them with `"basis": "fiat"` and produced an escalation
   entry that God can now read. Under the kick-back design, these escalations
   flow to the human owner as questions before freeze — exactly what was missing
   in the rev-3 decompose that caused the E2 FAIL.

2. **Probe is complementary, not redundant — and this run proves it.** Decimal
   is surfaced by probe **alone** (the author "catch" is a needle false
   positive). Probe in turn missed bare-number and whitespace, because
   behavioral consensus is not the same as semantic determination. The two
   instruments' genuine catches are **disjoint**: author 2, probe 1, no overlap.
   Neither alone reaches 3/3; the OR does. Had E3 shipped only the author arm,
   decimal would have gone unsurfaced (the FP would have *masked* the gap — a
   reason to fix the needle matcher, not rely on it).

3. **Pre-reg bare-number was wrong.** I expected a probe-split on `"120"` based
   on E2 heterogeneity, but grunts without a contract all chose "throw" —
   the model's strong prior on "unrecognized input → throw" overrides the
   ambiguity. This is a constraint on probe: it measures *behavioral* underdetermination,
   not *semantic* underdetermination. Fiat-flagging measures the latter directly.

4. **Admission gate confirmed blind again.** The E2 decompose that caused two
   deterministic hidden-score losses admitted with 0 questions. E3's rev-4
   decompose on the same task now produces 8 fiat escalations + 4 intent-undecided
   items for a one-requirement function — the gate itself did not change; the
   *authoring pass* changed. H-18's escalation machinery is what surfaces these,
   not any improvement to the admission probe.

5. **The kick-back loop design is validated end-to-end (offline).** The chain
   `decompose → fiat-flags → escalations → God query` would have caught bare-number
   and whitespace before freeze. The only missing piece is a live God-review
   session where a human answers the kick-back questions and the contract is
   re-authored with those answers locked in. That is the battery-authoring leg.

## Consequence

E3 PASS closes the kick-back leg's falsification check. The pre-registered
consequence: `decompose-run admission now kicks back everything (no probe
batteries exist) until a battery-authoring leg`. That consequence stands — the
escalation list is machine-visible but God has not yet answered the fiat questions,
so no contract in the system is underdetermination-free.

**Next leg candidates (post-E3):**

1. **Battery-authoring leg** — human answers the fiat escalations, warboss
   re-authors with locked resolutions, re-runs E2 against a battery derived from
   that second contract. This is the experiment that was never reachable from E2.
2. **decompose-run rev 2** — 5 open gaps (incl. `--max-requirements` never in
   prompt; `--context` SCOPE CONSTRAINT workaround still in use).
3. **Probe-prompt signature fix** — `signature=""` (AC8 textbook fail-up from H-20)
   means the probe prompt is `Implement: parseDuration` with no signature; a
   task.json `signature` field or a separate lookup would close the gap.
4. **Probe nonviable investigation** — 4/8 nonviable is too high for reliable
   split detection at k=8 (only 4 impls vote per input). Either k increases or
   the probe prompt needs a minimal harness snippet.
5. **E3 evaluator rev 2 — needle matcher** — `surfacedByAuthor` is a substring
   match and false-positived decimal on `"decimal"` in an unrelated escalation.
   Tighten decimal needles (drop bare `"decimal"`; require `"1.5"` /
   `"fractional"` / `"decimal point"` / `"decimal hour"`). Audit the other two
   needle lists for the same collision class before trusting attribution.

## Cost ledger

| Phase | Model | Cost |
| --- | --- | --- |
| Authoring: decompose (HIGH) | opus-4-8 | $0.05191 |
| Authoring: audit (HIGH) | opus-4-8 | $0.01844 |
| Probe: 8 intent grunts (LOW) | haiku-4-5 | $0.01598 |
| **E3 total** | | **$0.08633** |
