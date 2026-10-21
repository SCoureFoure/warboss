# review-decompose

First read `.warboss-horde/slices/_review-protocol.md` and follow it exactly.

- output: `.warboss-horde/out/review-decompose.md`
- scope: `src/gate.ts`, `src/warboss.ts`, `src/kickback.ts`
- context: read `CLAUDE.md` bullets for `gate.ts`, `warboss.ts`, `kickback.ts` first. Then
  `specs/warboss-decomposition.spec.md`, `specs/readiness-gate.spec.md`, `specs/kickback-pipeline.spec.md` state the
  intended behavior; a deviation from a spec sentence is a finding, behavior a spec asks for is not.

## What to look for

1. **Fail-closed parsing.** In `decompose()`: any malformed, partial, or ambiguous model reply that ends in a frozen
   contract instead of an error. Check the one-reask path: what happens when the reask also fails to parse.
2. **Mandatory fields.** A requirement accepted without `resolutions[]`, or without a `throws` example, or with a
   `resolutions` entry whose kind is neither `intent` nor `fiat`.
3. **Escalations dropped.** A `fiat` resolution or an intent-undecided audit gap that does not become an escalation.
4. **Admission.** In `admit()`: any decision input other than `convergenceProbe`. `gruntJudge` or `deriveCheck`
   influencing `ready` is a finding. `intentProbe` returning or implying a `ready` value is a finding.
5. **convergenceProbe.** Agreement computed over zero survivors or one survivor reported as converged; probe cases
   compared with an equality that treats `NaN`, `-0`, `undefined`, or key order wrongly; thrown errors compared only
   by "both threw".
6. **decomposeRecursive.** Duplicate ids that merge instead of failing; exhausted depth that returns a partial result
   as success; a sub-intent whose model calls bypass the `Ledger`.
7. **kickback.** `loadOwnerAnswers` accepting an unanswered, duplicated, or unknown-id entry; `buildAnswerQueue`
   dropping or reordering an escalation; answers that are not folded into the fresh decompose prompt.
8. **Hidden battery.** Any place in scope where held-out probe or hidden cases are placed on the `Contract` or into
   a prompt string.
