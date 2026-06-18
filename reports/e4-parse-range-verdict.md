# E4 verdict — multi-task replication (`parse-range`)

> **E4 criterion: PASS — replicated.** On a second, independent task
> (`parse-range`, integer-range expansion) the re-authored warboss contract
> reaches **1.000** on the neutral Leader oracle versus human **0.646** —
> not merely ≥ 0.90 × human (threshold 0.581) but a perfect score outright.
> The driver is identical to `duration-parse`: **error coverage**. The human
> contract scores **0.000** on every error-path Leader case (no `throws` examples —
> the Corollary-D hole), warboss **1.000** (Leader ruled the inputs invalid; warboss
> authored throws). The E4 result is **not task-specific** — the kick-back loop's
> value generalizes. Total cost: $0.269.
> Artifact: `runs/e4-20260614T222537Z.json` · re-author:
> `runs/decompose-20260614T222603Z.json`.

## Run metadata

Run: 2026-06-14 · task `parse-range` · N=30 sessions/source · granularity
`full` · `deadRun: false`. Leader-answers: `tasks/parse-range/leader-answers.json`
(5 rulings). Contested inputs from `tasks/parse-range/contested.json` drive the
coverage check (H-29 generalization — `requiredInputs`, not a module constant).

- **Author arm:** HIGH (opus-4-8) — one rev-4 `decompose`, `maxRequirements: 1`,
  Leader decisions rendered into `context` as **literal-free prose**.
  Authoring cost $0.073.
- **Grinding arm:** LOW (haiku-4-5) — `runE2` over the Leader battery, both contract
  sources, same loop. Grinding cost $0.196.

Leader battery: **9 cases** = 4 untouched task-hidden + 2 appended Leader cases +
3 overrides-in-place. Scored residual: **8** (one excluded, below).

## Headline numbers

| | human | warboss | threshold |
| --- | --- | --- | --- |
| meanFinalHiddenScore (Leader oracle) | 0.646 | **1.000** | warboss ≥ 0.581 → **PASS** |
| meanHappyScore | 0.861 | 1.000 | — |
| **meanErrorScore** | **0.000** | **1.000** | — |
| greenRate | 1.00 | 1.00 | — |
| meanAttempts | 1.00 | 1.60 | — |
| grinding cost | $0.037 | $0.159 | — |

## Leader rulings

| input | Leader ruling | note |
| --- | --- | --- |
| `"5-1"` | **throws** | reversed bounds — invalid |
| `"1-3,2-4"` | `[1,2,3,4]` | overlapping ranges → set union, deduped + sorted |
| `" 1 - 3 "` | `[1,2,3]` | whitespace tolerated |
| `"1,,3"` | **throws** | empty segment — invalid |
| `"-2-2"` | **throws** | negative bound — invalid |

Three of five contested inputs are error-path. The human arm scores 0.000 on all
three; warboss 1.000 — the same Corollary-D split E4 found on `duration-parse`.

## Reading the measurement

1. **The signature replicates exactly.** On both tasks warboss wins entirely on
   the error path (human 0.000, warboss ≥ 0.856) and matches or beats human on
   the happy path. Two independent tasks, one mechanism: the human contract pins
   no error behavior; the re-authored warboss contract — handed Leader's "this input
   is invalid" rulings — authors throws and its grunt learns to reject. The E4
   PASS is not a `duration-parse` artifact.

2. **Cleaner than `duration-parse`.** warboss scores a perfect 1.000 here (vs
   0.961 on duration-parse) and the happy/error split is perfect on both axes.
   Only one self-echo exclusion (vs three on duration-parse), so the residual is
   less eroded.

3. **One exclusion — `error-empty-segment` (`"1,,3"`).** The warboss author
   echoed `"1,,3"` as its own example → the residual filter excluded that hidden
   case (`leakedBy: ["warboss"]`). The PASS rests on 8/9 scored cases; two other
   error cases (`"5-1"`, `"-2-2"`) survived and warboss scored them 1.000, so the
   error-path conclusion is robust to the single exclusion.

4. **Owner authoring ruling on overlap (`"1-3,2-4"` → `[1,2,3,4]`).** The H-29
   grunt's fixture read overlapping ranges as a deduped, sorted set union. The
   Leader ruling here affirms that reading. This is a fiat the owner pinned — a
   different owner could have ruled "concatenate with duplicates"; the point is
   the ruling is explicit and the grunt satisfies it, not that union is the only
   defensible answer.

## Consequence

**Multi-task replication — verdict candidate #4 from `e4-verdict.md` — is
discharged.** The kick-back loop's value (machine authoring *with*
escalation-and-answer beats un-kicked-back human authoring on a neutral oracle)
holds on a second, structurally different task. The pipeline is no longer
single-task evidence.

Residual rev-candidate: same self-echo erosion mechanism as duration-parse — the
author occasionally chooses a contested input as its own example, excluding that
case. One exclusion of five here; the `extraCases` mechanism (H-28) is the
existing mitigation and could be extended to `parse-range`'s contested inputs if
tighter per-class measurement is wanted.

## Cost ledger

| Phase | Model | Cost |
| --- | --- | --- |
| Authoring: re-author decompose (HIGH) | opus-4-8 | $0.07269 |
| Grinding: human arm, 30 sessions (LOW) | haiku-4-5 | $0.03709 |
| Grinding: warboss arm, 30 sessions (LOW) | haiku-4-5 | $0.15905 |
| **E4 total** | | **$0.26883** |

One shared `cost-ledger-20260614T222537Z.jsonl`.
