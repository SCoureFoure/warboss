# review-core

First read `.warboss-horde/slices/_review-protocol.md` and follow it exactly.

- output: `.warboss-horde/out/review-core.md`
- scope: `src/contract.ts`, `src/runner.ts`, `src/sandbox.ts`, `src/sandbox-proc.ts`, `src/sandbox-child.mjs`,
  `src/agent.ts`, `src/models.ts`, `src/cost.ts`, `src/ledger-sink.ts`, `src/loop.ts`, `src/hooks/*.ts`
- context: read `CLAUDE.md` section "The membrane" and "Architecture" first; those state the intended invariants.

## What to look for

1. **Hash membrane.** Any path where `judge` / `judgeAsync` runs code without verifying the contract hash, or where
   two contracts that differ in `requirement`, `entry`, `version`, or `examples` can produce the same hash
   (for example key-order or `undefined` handling in the canonical form).
2. **Hidden battery leak.** Any feedback string, at any `Granularity`, that includes a hidden case's input or expected
   value instead of only a count.
3. **Un-metered model call.** Any call to the Anthropic SDK that does not record to the `Ledger`, including error and
   retry paths where usage is returned but dropped.
4. **Cost arithmetic.** Wrong unit (per-token versus per-million), cache token classes ignored or double-counted,
   a model id that maps to no price and silently yields `0`.
5. **Fail-open.** Any parser or gate in scope that returns a passing or permissive value on malformed input.
   `extractCode` on a reply with no fenced block, or with several, is one case to check.
6. **Loop stall and budget.** In `src/loop.ts`: off-by-one on `budget`, stall trackers that do not reset as the
   CLAUDE.md "loop.ts" bullet says, a stall that is reported as exhaustion or the reverse.
7. **Sandbox.** In `sandbox-proc.ts` / `sandbox-child.mjs`: a timeout that does not kill the child, output that is
   trusted without validation, a child crash reported as a pass.
8. **Ledger sink.** A line that can be written partially, or two calls that can share one request-id key.
