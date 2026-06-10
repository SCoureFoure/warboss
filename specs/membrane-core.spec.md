# Spec — Membrane core (contract, sandbox, runner, ledger, agent)

> Status: active · Feature: membrane-core · Added: 2026-06-09 · Maps to: PLAN Phase 1 + agent layer
> Source of truth for the Phase-1 primitives every experiment depends on: the
> hash-frozen contract, the vm execution sandbox, the judging runner, the cost
> ledger, and the single-call agent layer.

## Requirement
The harness can freeze human intent into an executable, hash-pinned contract;
run a candidate implementation against that contract inside a bounded sandbox;
judge it to a pass/fail vector plus a feedback signal whose richness is tunable;
meter every model call in dollars; and dispatch a grunt as one metered model
call. These are the load-bearing primitives — the experiments (E1a/E1b) are
orchestration on top of them.

## Constraints (inherited)
- **Cost-metered.** Every model call routes through `Ledger`; cost is derived
  from token usage × model price, never computed ad hoc.
- **Membrane immutability.** `Contract.freeze` content-hashes the frozen fields;
  the runner refuses to execute against a hash it was not registered for.
- **Hidden battery never leaks.** When the runner scores against a held-out
  battery, feedback exposes at most a failing count — never inputs/expected/actual.
- **`node:vm` is not a security sandbox.** It bounds runaway CPU for pure,
  synchronous E1 impls only; replace before Phase 4.
- **Grunt is a doer, not a planner.** The agent layer is one `messages.create`;
  the generate→judge→retry loop lives above it, in the experiment runner.

## Decisions (pinned 2026-06-09)
- **Hash input is canonical + ordered:** `{requirement, entry, version, examples}`
  with fixed key order, no timestamps. Any byte of frozen intent changes the hash.
- **Cache pricing folded into `costOf`:** cache reads ×0.1, cache writes ×1.25 of
  the input rate; fresh input and output at full rate.
- **Feedback granularity is `passfail | input | full`,** default `full` for
  covered cases. A hidden battery (`battery` passed, `revealInFeedback` unset)
  defaults to non-revealing regardless of granularity.
- **`deepEqual` treats `NaN === NaN` as true** (so numeric edge cases compare
  cleanly) and is structural over arrays and plain objects.
- **Code extraction:** first fenced block (optional lang tag); fall back to the
  whole trimmed response so a bare-code reply still runs; `undefined` when empty.
- **Agent client is injectable** so the agent layer is unit-testable offline.

## Acceptance criteria (Given / When / Then)
1. **AC1 — cost math.** Given a model price and a usage record, `costOf` returns
   `inTok×inRate + outTok×outRate`, with cache-read tokens billed at 0.1× and
   cache-write tokens at 1.25× the input rate.
2. **AC2 — ledger record + totals + tag filter.** Recording calls accumulates
   `costUsd` per entry; `totals()` sums calls/tokens/wall/cost; `totals(filter)`
   restricts to entries whose tags match every filter pair.
3. **AC3 — freeze determinism.** Identical `ContractInput` → identical hash;
   changing the requirement, an example, the entry name, or the version → a
   different hash.
4. **AC4 — frozen + verify.** A frozen contract is immutable (`Object.isFrozen`
   on the contract and its `examples`); `verify(ownHash)` is true and
   `verify(otherHash)` is false.
5. **AC5 — sandbox happy + errors.** `runImpl` returns `{ok:true, value}` for a
   correct pure function; `{ok:false, error}` when the impl throws; and reports a
   missing/non-function entry as `{ok:false}` rather than throwing.
6. **AC6 — sandbox bounds infinite loops.** An impl with `while(true){}` returns
   `{ok:false}` within the timeout and does not hang the runner.
7. **AC7 — import strip.** `stripImports` removes `import`/`export`/`require`
   so a pure function body defined with `export function` still runs bare.
8. **AC8 — judge pass/fail/score/vector.** All cases pass → `pass:true`,
   `score:1`, empty feedback; a mix → `vector` mirrors per-case results and
   `score` is the passing fraction.
9. **AC9 — feedback granularity.** On failure: `passfail` yields a count only;
   `input` names the failing input(s) but not expected/actual; `full` includes
   input, got, and expected.
10. **AC10 — hidden battery never leaks.** Judging against a passed-in `battery`
    with `revealInFeedback` unset → feedback reveals at most a failing count, no
    inputs/expected/actual, at any granularity.
11. **AC11 — mechanical freeze.** `judge` with a mismatched `expectedHash` throws
    `ContractHashMismatch`; with the contract's own hash it executes normally.
12. **AC12 — deepEqual structural.** Equal nested arrays/objects compare true,
    differing ones false; `NaN` compares equal to `NaN`.
13. **AC13 — agent meters one call.** `Agent.generate` (with an injected fake
    client) returns `{text, code, usage, cost, wallMs}`, records exactly one
    ledger entry carrying the call's tags, and the entry's `costUsd` equals the
    returned cost.
14. **AC14 — code extraction.** `extractCode` returns the first fenced block
    (with or without a language tag), falls back to the whole trimmed text when
    unfenced, and returns `undefined` for empty input.
15. **AC15 — system + thinking plumbing.** `generate` defaults `system` to
    `GRUNT_DOGMA` when unset and forwards a `thinking` config to the client only
    when one is provided.

## Verifies-with
- Tests: `test/cost.test.ts` (AC1–2), `test/contract.test.ts` (AC3–4),
  `test/sandbox.test.ts` (AC5–7), `test/runner.test.ts` (AC8–12),
  `test/agent.test.ts` (AC13–15).
- Integration: `npm run smoke` exercises freeze → judge → (live grunt) → meter.
- Falsifies / experiment link: n/a (foundational; E1a/E1b are the falsifiers).
