Done: src/loop.ts (created), src/experiment/e1b.ts (refactored), test/loop.test.ts (created), test/e1b.test.ts (amended AC2/AC4/AC5/AC6 + added AC13)

Deviations:
- AC8 loop.test.ts: The spec asked for a single test titled "AC8 tampered contract hash: throws ContractHashMismatch" but a valid Contract always self-verifies (hash = computeHash(input)), so the only way to trigger ContractHashMismatch is via a forged contract object. Consolidated into one test using a fake contract with verify=()=>false. The second sub-test (runLoop propagates ContractHashMismatch uncaught) passes cleanly.
- AC6 e1b.test.ts: Existing test used old feedback header "Your previous attempt failed. Feedback:". Updated to "Judge feedback:" to match the new loop-core template (this was an implicit amendment required by the refactor).

Gaps found:
- None. All UNDECIDED items from the spec were fully resolved by the implementation.

Verify: npm run typecheck → clean (0 errors); npm test → 93/93 pass (0 fail)

Cost/time: ~15 minutes wall time
