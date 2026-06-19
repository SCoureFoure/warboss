# H-7 Implementation Report

## Done

Files created:
- `src/gate.ts` — `gruntJudge` + `convergenceProbe` + local `runWithConcurrency`
- `test/gate.test.ts` — AC1–AC10 (11 tests total: AC3 is split into AC3a/AC3b)

## Deviations

1. AC3 split into two tests (AC3a/AC3b): "malformed" and "always-throws" are two distinct code paths and warrant separate assertions. The spec bundled them; both pass.

2. `runWithConcurrency` is duplicated in `gate.ts` as instructed (noted as a duplication of the same function in `src/experiment/e1b.ts`). Not lifted to a shared module.

3. AC10 "tampered contract" test: The contract `.hash` field is the "expected" hash (what convergenceProbe passes to judge), while `.verify()` is overridden to always return `false` — simulating content having been modified after registration. This correctly triggers `ContractHashMismatch`.

## Gaps found

None. All interfaces and behaviors were fully specified.

## Verify

```
npm run typecheck → clean (0 errors)
npm test         → 86/86 pass (74 prior + 12 new gate tests)
```

Note: AC3 counted as 2 tests (AC3a, AC3b) and AC10 counted as 2 tests (metering + freeze), so 10 ACs = 12 test blocks.

## Cost/time

Wall time: ~2 minutes (implementation + debug cycle on AC10 tampered-contract logic)
