# review-core

## Findings

### F1 — Contract freeze is shallow: example objects stay mutable after hashing
- where: `src/contract.ts:79`
- severity: high
- kind: invariant
- evidence: "Object.freeze(this); Object.freeze(this.examples);"
- why: Only `this` and the `examples` array are frozen. `contract.examples[0].expected = 99` (or `.input`) succeeds, `this.hash` is unchanged, `verify(hash)` stays true, and `judge` scores against the altered case. `examples` is also the caller's own array (`this.examples = input.examples`, line 75), so the caller's retained case objects are the same mutable objects.
- fix: Deep-copy and deep-freeze each case (and its `input` array) in the constructor, or have `judge` recompute `Contract.computeHash` over the live fields.
- check: `Contract.freeze(...)`; mutate `c.examples[0].expected`; `judge(c, code, {expectedHash: c.hash})` must throw `ContractHashMismatch` or the mutation must throw.

### F2 — Distinct examples can produce the same hash (JSON.stringify lossy values)
- where: `src/contract.ts:92`
- severity: medium
- kind: invariant
- evidence: "const canonical = JSON.stringify({"
- why: Inside `input`/`expected`, `JSON.stringify` maps `NaN`, `Infinity`, `-Infinity` and `undefined` (array element) to `null`, and `-0` to `0`. Two contracts with `input: [NaN]` vs `input: [null]`, or `expected: [undefined]` vs `[null]`, hash identically although `deepEqual` (runner.ts:240) distinguishes `NaN` from `null`. runner.test.ts:193 shows NaN is a supported value.
- fix: Use a canonical serializer that tags non-finite numbers, `-0` and `undefined`, or reject them at freeze.
- check: `computeHash` of `[NaN]` vs `[null]` example inputs must differ.

### F3 — Sandbox/infra failure is scored as a pass for every `throws` case
- where: `src/runner.ts:104` (same logic at `src/runner.ts:214`); source of the failure value at `src/sandbox-proc.ts:60`
- severity: medium
- kind: fail-open
- evidence: "return { ...labelOf(c), pass: true };" / "resolve({ ok: false, error: `sandbox crashed: ${detail}` });"
- why: A `throws` case passes on any `!run.ok`. If the child cannot start or dies (spawn `error` at sandbox-proc.ts:83, non-zero exit, `--permission` rejected, OOM, "no result from sandbox"), every `throws` case without `throwsMatch` passes, so a harness failure inflates score and can yield `pass: true` for a contract whose examples are all throws-cases. The comment at runner.ts:93 makes timeouts and missing-entry intentional, but not crashes of the sandbox itself.
- fix: Have `runImplProc` return a distinct infra-failure marker (e.g. `infra: true`) that `judgeAsync` never counts as a thrown error.
- check: `judgeAsync` with a runner returning `{ok:false,error:"sandbox crashed: spawn"}` on a `throws:true` case must give `pass:false`.

### F4 — Stream-split requests can be double-counted across hook invocations, or counted from a partial record
- where: `src/hooks/cost-from-transcript.ts:119` and `src/hooks/record-cost.ts:49`
- severity: medium
- kind: cost
- evidence: "if (rec.requestId !== undefined && seenRequestIds.has(rec.requestId)) continue;" / "const r = JSON.parse(line) as { uuid?: string };"
- why: `seenRequestIds` is local to one pass, and the persisted dedup set (`seenUuids`) holds only `uuid`. If a request's records (same `requestId`, different `uuid`) land in two different Stop/SubagentStop invocations, the second is priced again. Within a pass, the first record seen wins, and an early streamed record can carry partial `output_tokens`.
- fix: Seed `seenRequestIds` from the ledger's stored `requestId` field, and keep the record with the largest `output_tokens` per `requestId`.
- check: call `extractCostRows` twice with a transcript that grows by a second record sharing the first one's `requestId`; the second call must return no rows.

### F5 — Ledger sink failure makes `generate` throw after the call is billed; loop then re-bills
- where: `src/cost.ts:132`, `src/loop.ts:97`
- severity: low
- kind: cost
- evidence: "this.sink?.(entry);" / "} catch {"
- why: If `appendFileSync` throws (disk full, locked file), `Ledger.record` throws after pushing the entry, so `Agent.generate` rejects. `runLoop` swallows it and re-calls up to 3 times, each billed and recorded in the ledger, but never added to `AttemptRecord.costUsd`/`LoopResult.costUsd`, so loop totals diverge from the ledger.
- fix: Catch sink errors inside `Ledger.record` (or surface them distinctly), and have the loop rethrow non-API errors.
- check: Ledger with a throwing sink plus a fake client: `runLoop` must call `create` once and report ledger cost equal to `result.costUsd`.

### F6 — Child result is JSON-cast without shape validation
- where: `src/sandbox-proc.ts:72`
- severity: low
- kind: fail-open
- evidence: "const result = JSON.parse(last.slice(\"##RESULT##\".length)) as SandboxResult;"
- why: Any parseable JSON (e.g. `{}`, `null`, `{"ok":true}` with no `value`) is returned as a `SandboxResult`. `null` makes `run.ok` throw a TypeError in `judgeAsync`, rejecting the whole `Promise.all`; `{"ok":true}` yields `value: undefined`. The `##RESULT##` line is also trusted from stdout of a process that runs grunt code.
- fix: Validate `typeof r === "object" && r !== null && (r.ok === true || (r.ok === false && typeof r.error === "string"))`, else return `no result from sandbox`.
- check: a fake child printing `##RESULT##null` must give `{ok:false,error:"no result from sandbox"}`.

### F7 — `runLoop` passes the contract's own hash as `expectedHash`
- where: `src/loop.ts:141`
- severity: low
- kind: invariant
- evidence: "expectedHash: opts.contract.hash,"
- why: `contract.verify(contract.hash)` is always true, so the membrane check in the loop is a tautology; a registered frozen hash is never consulted. Combined with F1, a mutated contract passes the loop's check.
- fix: Add an `expectedHash` field to `LoopOptions` and pass it through.
- check: `runLoop` with `expectedHash` of a different contract must throw `ContractHashMismatch`.

## Open questions
- `src/agent.ts:162` — `extractCode` returns the whole reply when there is no fence, and the first block when there are several. The doc comment says the fallback is intentional; is a prose-only reply (e.g. "I cannot do this") acceptable as "code"? It will fail judging, but it is recorded as a non-failed generation.
- `src/loop.ts:140` — the loop judges with the synchronous `judge`/`runImpl` (host-process `node:vm`, no await). An `async` entry returns a Promise and always fails `deepEqual`, while `sandbox-child.mjs` awaits. Is the loop intended to be sync-only?
- `src/hooks/cost-from-transcript.ts:37` — unknown model ids price at $0 (documented as intended at line 20). Should the current main model id be in `DEV_MODEL_PRICES`? A missing id silently under-reports spend.
- `src/cost.ts:74` — cache writes are priced at a flat 1.25x; 1-hour-TTL cache writes bill at 2x. Is only the 5-minute TTL ever used?
- `src/cost.ts:152` — `totals()` sums only `inputTokens`/`outputTokens`, omitting cache token classes; confirm that is intended.

## Files read
- .warboss-horde/slices/_review-protocol.md
- .warboss-horde/slices/review-core.md
- src/contract.ts
- src/runner.ts
- src/sandbox.ts
- src/sandbox-proc.ts
- src/sandbox-child.mjs
- src/agent.ts
- src/models.ts
- src/cost.ts
- src/ledger-sink.ts
- src/loop.ts
- src/hooks/record-cost.ts
- src/hooks/cost-from-transcript.ts
