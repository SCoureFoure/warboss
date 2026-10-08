# fix-gate-zero-survivors

First read `.warboss-horde/slices/_fix-protocol.md` and follow it exactly.

Forks: zero survivors is never ready = `intent` (fail-closed; the probe has no evidence of agreement).

- files: `src/gate.ts`, `test/gate.test.ts`, `specs/readiness-gate.spec.md` (append criteria only)
- context: `.warboss-horde/out/review-decompose.md` finding F3.

## Defect

At the end of `convergenceProbe` in `src/gate.ts` (near line 429), the Wilson branch computes
`wilsonLower(0, k) >= minSurvivorLB && wilsonLower(0, 0) >= minAgreementLB`. With thresholds of `0` and zero
survivors this is `true`, so a contract nobody could satisfy is reported ready.

## Behavior

`ready` MUST be `false` whenever `survivorCount === 0`, in both the Wilson branch and the default branch. Implement
by guarding the existing expression:

```ts
const ready = survivorCount > 0 && ( <existing expression, unchanged> );
```

Change nothing else in `src/gate.ts`.

## Cases (in `test/gate.test.ts`)

Use the same injected fake-agent pattern the existing `convergenceProbe` tests use.

1. Wilson, zero survivors: every one of the `k` generations fails the contract's examples;
   `wilson: { minSurvivorLB: 0, minAgreementLB: 0 }`. Result: `ready === false`, `survivors === 0`.
   (Under the old code `ready` is `true`.)
2. Default rule, zero survivors: same generations, no `wilson` option. Result: `ready === false`.
3. No regression: an existing passing Wilson case with at least one survivor still returns the `ready` value it
   returned before. Do not add a test for this if an existing test already asserts it — name that test in your reply.
