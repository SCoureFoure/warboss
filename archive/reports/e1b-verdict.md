# E1b verdict — retry-in-place economics (criterion 4)

> Run: 2026-06-11 (artifact `runs/e1b-20260612T015518Z.json`, UTC stamp) ·
> N=30 per arm × 3 feedback arms · task `duration-parse` · LOW tier
> (haiku-4-5) · budget 5 attempts/session · total cost **$0.0977**.
> Criterion-4 comparison vs E1a-r2 Arm D (`runs/e1a-20260610T224357Z.json`).
> The artifact's own `criterion4` field reads `deferred` — the `--e1a-arm-d`
> flag was eaten by npm's CLI arg handling on Windows (`npm run e1b -- --n 30
> …` reached the script as bare positionals). The verdict below is computed
> by hand from the two artifacts using the spec's pinned rule; numbers are
> exact.

## Per-arm results

| Arm | green | stall | mean attempts | hidden score | cost/green |
| --- | --- | --- | --- | --- | --- |
| passfail | 0.07 | 0.00 | 4.87 | 0.050 | $0.0015 |
| input | 1.00 | 0.00 | 1.13 | 0.750 | $0.0016 |
| **full** | **1.00** | 0.00 | **1.03** | **0.750** | **$0.00156** |

Best arm per the pinned tie-break: **full** (greenRate tie with `input`,
hidden-score tie, lower cost/green).

## Criterion 4 (pre-registered): **FAIL**

Rule: PASS iff `bestArm.meanFinalHiddenScore ≥ armD.meanHiddenScore` AND
`bestArm.meanCostPerGreenSession < armD.meanCostUsd`.

- Arm D (HIGH one-shot): hidden score **0.8167**, mean cost **$0.014774**.
- E1b full: hidden score **0.750** → `0.750 ≥ 0.8167` is **false**.
- Cost leg passes overwhelmingly: `$0.001559 < $0.014774` (**9.5× cheaper**).

FAIL on the correctness leg only.

## Reading (planner)

1. **The retry loop works as a mechanism.** Green rate 1.00 at ~1.1 mean
   attempts for both informative-feedback arms; zero stalls. The loop is not
   the bottleneck.
2. **The contract is.** Sessions converge to canonical-contract green almost
   immediately, then plateau at hidden score exactly 0.750 (modal impl passes
   9/12 hidden cases) — the residual 3/12 are behaviors the canonical
   examples do not pin. Retry-against-contract cannot buy correctness the
   contract does not encode. This is Corollary D measured directly: the gap
   between contract-green and hidden-green is the warboss's authoring debt,
   not the grunt's.
3. **`passfail` feedback is dead.** 0.07 green, 4.87 mean attempts — a bare
   failure count gives the grunt nothing to move on. Feedback granularity
   must carry at least the failing input.
4. **Economics are decisively in favor of cheap+retry** (9.5× per green) —
   so criterion 4's fate rests entirely on closing the hidden-score gap at
   the authoring source (denser examples), which is exactly what the
   decomposition module's error-coverage mandate + audit/amend pass exist to
   do. E2 tests whether they close it.

## Standing consequences

- Criterion 4 recorded as FAIL-as-measured; re-run is cheap ($0.10) once a
  denser contract (e.g. warboss-amended) exists for the same task — that
  re-run doubles as the first E2 data point.
- Tooling: npm eats `--flags` on Windows; live runners must be invoked as
  `node --env-file=.env --import tsx <script> --flags …` directly. Worth a
  CLI note in README.
- Hidden-score plateau at exactly 0.750 across 60 green sessions is a
  variance-collapse datum: the contract pins the impl to near-determinism —
  rung-1 finding reproduced under the retry loop.
