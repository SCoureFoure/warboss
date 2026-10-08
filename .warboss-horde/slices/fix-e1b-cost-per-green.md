# fix-e1b-cost-per-green

First read `.warboss-horde/slices/_fix-protocol.md` and follow it exactly.

Forks: spec wins over code = `intent` (owner decision, 2026-10-08).

- files: `src/experiment/e1b.ts`, `test/e1b.test.ts`

## Behavior

`specs/e1b-harness.spec.md:130` defines `meanCostPerGreenSession` as `totalCostUsd / greenCount; Infinity if
greenCount=0`. `analyzeE1bArm` in `src/experiment/e1b.ts` currently divides only the green sessions' cost.

Change the returned field to:

```ts
meanCostPerGreenSession: greenCount > 0 ? totalCostUsd / greenCount : Infinity,
```

where `totalCostUsd` is the existing sum over ALL sessions. Remove the `greenCost` variable if nothing else uses it.
Change nothing else in `src/experiment/e1b.ts`.

## Cases (in `test/e1b.test.ts`)

1. The existing assertion at about line 427
   (`assert.ok(Math.abs(a.meanCostPerGreenSession - 0.02) < 1e-9); // (0.02+0.02)/2`) is the one this contract names:
   replace its expected value with (sum of `totalCostUsd` over every session in that fixture) / (number of green
   sessions in that fixture). Read the fixture and compute the number; write the arithmetic in the trailing comment.
   If every session in that fixture is green, add one non-green session with `totalCostUsd: 0.06` to the fixture so
   the new value differs from `0.02`, and adjust any other assertion on that same fixture that the added session
   changes (`greenRate`, `meanAttempts`, `stallRate`, `meanFinalHiddenScore`, `totalCostUsd`) to its new correct value.
2. The `Infinity` assertions (zero green sessions) stay as they are.
3. Grep `test/` for every other assertion on `meanCostPerGreenSession` or on a "cost per green" value. For each, check
   whether its fixture has a non-green session with nonzero cost. If it does and the file is `test/e1b.test.ts`,
   update the expected value by the same rule. If it is in another file, do not edit it — list the `path:line` in
   your reply.
