# fix-gate-zero-survivors-outcome

First read `.warboss-horde/slices/_fix-protocol.md` and follow it exactly.

Forks: zero survivors is never ready, in outcome mode too = `intent` (same fail-closed rule as vector mode).

- files: `src/gate.ts`, `test/gate.test.ts`, `specs/readiness-gate.spec.md` (append criteria only)

## Behavior

In `src/gate.ts`, the outcome-mode probe computes (near line 766-773):

```ts
// UNDECIDED: outcome-mode ready is not guarded by survivorCount > 0 ...
const ready = thresholdsOk && modalWrong.length === 0;
```

Replace those two lines with exactly:

```ts
const ready = survivorCount > 0 && thresholdsOk && modalWrong.length === 0;
```

The `// UNDECIDED:` comment line is deleted. Change nothing else in `src/gate.ts`.

## Cases (in `test/gate.test.ts`)

Find the existing tests that exercise the outcome-mode path (the one whose result carries `modalWrong`) and use the
same call and the same injected fake-agent pattern.

1. Outcome mode, Wilson, zero survivors: every one of the `k` generations fails the contract's examples;
   `wilson: { minSurvivorLB: 0, minAgreementLB: 0 }`. Result: `ready === false`, `survivors === 0`.
   (Under the old code `ready` is `true`.)
2. Outcome mode, default rule, zero survivors: same generations, no `wilson` option. Result: `ready === false`.

Name the tests with the next two criterion ids after AC23 (`AC24`, `AC25`), following the naming of the
`AC22` / `AC23` tests at the end of the file, and append `AC24` and `AC25` to the spec after `AC23`.
