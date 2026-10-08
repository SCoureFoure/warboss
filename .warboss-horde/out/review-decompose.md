# review-decompose

## Findings

### F1 — Amend output may rewrite or drop existing examples/requirements and still be frozen
- where: `src/warboss.ts:532`
- severity: medium
- kind: fail-open
- evidence: "drafts = validateDrafts(amendedItems, maxRequirements);"
- why: The amend reply replaces `drafts` wholesale. `validateDrafts` only checks shape (>=2 examples, a throws example, unique ids and names). It does not check that every pre-amend requirement id and every pre-amend example is still there and unchanged. If the model changes an existing example's `expected`, drops a requirement, or rewrites `requirement` text, the altered version is frozen. The only per-gap check (lines 534-544) looks for a new example name and ignores everything else.
- fix: After parsing the amend reply, require that the id set equals the pre-amend id set and that every pre-amend example (deep-equal) still appears under its id. Otherwise treat it as `amendFailed`.
- check: Scripted amend that returns the same ids but flips one existing example's `expected`, plus a valid `pinned` entry. Expect the original drafts to be kept and the gap to stay in `auditGaps`. Before the fix the mutated contract is frozen.

### F2 — loadOwnerAnswers does not type-check `escalation`, `requirementId`, `intent` or `artifact`
- where: `src/kickback.ts:178`
- severity: medium
- kind: fail-open
- evidence: "const escalation = answer[\"escalation\"] as string;"
- why: Only `decision` is type-checked. `{"answers":[{"decision":"x"}]}` has no `escalation` and passes. The returned queue then has `escalation: undefined`, which the cast hides. Unknown, mistyped or missing escalation strings are accepted. `requirementId: a["requirementId"] as string ?? ""` (line 204) passes through any non-string value. A non-object element in `answers` (for example `null`) throws a raw TypeError at line 178 instead of a descriptive error. The same applies to a top-level `null` at line 158. `intent` and `artifact` are passed through unchecked.
- fix: In the validation loop, require `typeof escalation === "string" && escalation.length > 0`, and reject non-object answers and a non-object top level with a descriptive error. Type-check `intent` and `artifact` as strings, and `requirementId` as a string if present.
- check: `loadOwnerAnswers` on a queue file with `answers: [{decision:"x"}]` should reject. Today it resolves.

### F3 — Wilson ready rule returns ready with zero survivors when the lower-bound thresholds are <= 0
- where: `src/gate.ts:429-431`
- severity: low
- kind: fail-open
- evidence: "? wilsonLower(survivorCount, k, opts.wilson.z ?? 1.645) >= opts.wilson.minSurvivorLB &&"
- why: With zero survivors, `wilsonLower(0, k)` is 0 and `wilsonLower(0, 0)` returns 0 by definition. Passing `minSurvivorLB: 0, minAgreementLB: 0` gives `ready: true` with no survivors. The default (non-wilson) rule is fine because `NaN >= 0.5` is false. The same shape is at lines 764-767. Nothing guards `survivorCount === 0`.
- fix: Make `ready` false whenever `survivorCount === 0`, in both the vector and outcome paths.
- check: `convergenceProbe` with `wilson: {minSurvivorLB:0, minAgreementLB:0}` and all generations failing the contract. Expect `ready: false`. Today it is `true`.

## Open questions
- `src/warboss.ts:179` — `shapeCheckDrafts` rebuilds each example from `name/input/expected/throws` only, so a model-supplied `throwsMatch` is silently dropped. CLAUDE.md says "`throwsMatch` optionally pins the error message", and `SCHEMA_TEXT` does not offer it. Is dropping it intended for decompose output, or should it be carried through?
- `src/gate.ts:152` — `outcomeKey` uses JSON.stringify, so NaN, Infinity and null all key as `value:null`. Every throw is the bare key `throw`, so different error messages cluster together. The spec pins this format (readiness-gate.spec.md:245). Is that conflation acceptable for outcome clustering?
- `src/gate.ts:432` — The pinned rule `survivorRate >= 0.5 && modalShare >= 0.9` gives `ready: true` for k=1 with one survivor, and for k=2 with one survivor. Those are single-survivor "convergence". Is a minimum survivor count intended?
- `src/gate.ts:432` — In vector mode, survivors that all fail the same probe give an identical vector and `modalShare` 1, so `ready` is true. Outcome mode with `modalWrong` was built to catch this. Is vector mode meant to stay the default for admit(), which does not pass `clustering`?
- `src/kickback.ts:136` — The loader cannot check that the answers cover every escalation of the source artifact, or that none are unknown. The spec only has `decompose-run` cross-check the artifact basename (kickback-pipeline.spec.md:204). Is escalation-set coverage enforced in `decompose-run`? That file is out of scope for this slice.
- `src/warboss.ts:569` — Fiat escalations are computed from post-amend drafts, so an amend that deletes a `resolutions` entry removes its escalation. The spec says post-amend drafts (warboss-decomposition.spec.md:233). Is that intended, given F1?

## Files read
- .warboss-horde/slices/_review-protocol.md
- src/gate.ts
- src/warboss.ts
- src/kickback.ts
- specs/kickback-pipeline.spec.md (partial)
- specs/warboss-decomposition.spec.md (grep)
- specs/readiness-gate.spec.md (grep)
- src/contract.ts (grep)
