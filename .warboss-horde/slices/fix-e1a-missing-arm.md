# fix-e1a-missing-arm

First read `.warboss-horde/slices/_fix-protocol.md` and follow it exactly.

Forks: a verdict needs all three arms, missing arm fails every criterion = `intent` (fail-closed convention).
Leaving `rescore`'s `?? 0` field defaults alone = `fiat` (assumed to exist for older artifacts).

- files: `src/experiment/e1a.ts`, `src/experiment/rescore.ts`, `src/experiment/analysis.ts`,
  `test/e1a.test.ts`, `specs/e1a-harness.spec.md` (append criteria only)
- context: `.warboss-horde/out/review-experiment.md` finding F1.

## Defect

`runE1a` (`src/experiment/e1a.ts`, near line 228) and `rescore` (`src/experiment/rescore.ts`, near line 48) call
`evaluateCriteria(A, B, C)`. When an arm was not run, they substitute an all-zero analysis, and some criteria then
report `pass: true`.

## Behavior

1. Add to `src/experiment/analysis.ts` an exported pure function that takes the three arm analyses, each possibly
   `undefined`, and returns the same criteria type `evaluateCriteria` returns:
   - all three present → exactly `evaluateCriteria(a, b, c)`;
   - any missing → every criterion in the returned object has `pass: false` and a `detail` string that contains
     `arm <ID> not run` for each missing arm id (`A`, `B`, `C`). Every other field each criterion carries keeps a
     type-valid value.
   Name it `evaluateCriteriaOrFail`.
2. `runE1a` calls it with `analysisMap["A"]`, `analysisMap["B"]`, `analysisMap["C"]` — where an arm id that is not in
   the run's arm list is passed as `undefined`. Remove the `defaultAnalysis` substitution at that call. If
   `defaultAnalysis` is then unused, delete it.
3. In `src/experiment/rescore.ts`, extract the criteria computation into an exported pure function
   `rescoreCriteria(artifact)` that returns the criteria object; `rescore()` calls it and prints as before. An arm
   key absent from `artifact.analysis` is passed as `undefined`. Do NOT change the existing `?? 0` defaults for
   numeric fields of an arm that IS present.
4. No change to `evaluateCriteria` itself, to printed output format, or to artifact shape.

## Cases (in `test/e1a.test.ts`)

1. `evaluateCriteriaOrFail(a, b, c)` with three real analyses deep-equals `evaluateCriteria(a, b, c)`. Reuse analyses
   an existing test in this file already builds.
2. `evaluateCriteriaOrFail(undefined, b, c)`: every criterion has `pass === false`, and every criterion's `detail`
   includes `arm A not run`. Iterate over `Object.values(result)` so a criterion added later is covered.
3. `evaluateCriteriaOrFail(undefined, undefined, c)`: every `detail` includes both `arm A not run` and
   `arm B not run`.
4. `runE1a` run with arms `["B", "C"]` only, using the same offline fake client pattern the existing `runE1a` tests
   in this file use, with implementations that pass every case: every criterion in the result has `pass === false`.
   (Under the old code, criteria 1 and 2 pass here.)
5. `rescoreCriteria` on an artifact object whose `analysis` has keys `B` and `C` only: every criterion has
   `pass === false`.
6. `rescoreCriteria` on an artifact with all three arms returns the same object as calling `evaluateCriteria` on the
   three built arm analyses (no regression).

If `runE1a`'s result does not expose the criteria object, or `rescore.ts` cannot be imported by a test without
running its CLI entry, leave `// UNDECIDED:` and report it.
