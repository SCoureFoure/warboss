# Spec — sandbox-hardening (process-isolated execution, pre-Phase-4 gate)

> Status: active · Feature: sandbox-hardening · Added: 2026-06-10 · Maps to: PLAN "Execution safety" decision + Phase 4 precondition ("real sandbox lands here")
> Source of truth for the execution boundary once tasks stop being pure
> functions. The existing `node:vm` path is adequate ONLY for pure synchronous
> impls (its own header says so); Phase 4 grunt output is untrusted code that
> may be async, may attempt I/O, and WILL contain runaway loops. This spec is
> written to be implemented by a low-tier model: every fork is decided here.

## Requirement

The harness can execute an untrusted implementation in a separate,
permission-stripped Node child process with a hard wall-clock kill and a
memory cap, returning the same structured `SandboxResult` the vm path returns,
so the judge can score non-pure/async implementations without giving them the
parent process's filesystem, child-process, or worker capabilities. The vm
path remains the default for pure tasks (fast, synchronous); the process path
is opt-in per judge call. Tests are offline and fast.

## Constraints (inherited + new)

- **Mechanism pinned: permission-stripped child process, NOT isolated-vm.**
  Rationale: `node --permission` ships with Node ≥ 20 (no native build dep —
  isolated-vm means node-gyp, which is a recurring failure mode on this
  project's Windows dev environment), and a process boundary gives a clean
  kill for timeouts/memory that no in-process isolate offers. Requires
  Node ≥ 20 — record in `package.json` `engines`.
- **Defense in depth — two layers, both mandatory:**
  1. *Inside the child*, the impl still runs in a `node:vm` context built from
     an EMPTY sandbox object (no `require`, no `process`, no `fetch`, no
     `globalThis` bridge) with the existing `stripImports` applied. The vm's
     `timeout` bounds synchronous loops.
  2. *The child itself* is spawned with `--permission` (which denies fs,
     child_process, worker_threads, and native addons by default — no
     `--allow-*` flags are ever passed) and `--max-old-space-size` for the
     memory cap. The parent enforces a wall-clock kill for anything the vm
     timeout cannot interrupt (async escapes, event-loop keep-alives).
- **Known accepted limitation (recorded, not hidden):** Node's permission
  model does NOT gate network access. The empty vm context is the network
  barrier (no `fetch`/`net` reachable without globals); a vm ESCAPE therefore
  reaches the network. Full network denial requires an OS-level sandbox or
  container — deferred until the threat model includes exfiltration, i.e.
  until grunts process secret-bearing inputs. Do not claim network isolation
  in any doc; claim fs/child/worker/addon denial + kill/memory bounds.
- **Interface parity.** The process path returns the existing `SandboxResult`
  (`{ok:true,value} | {ok:false,error}`) so the judging layer composes
  unchanged. Values cross a JSON boundary — non-JSON-serializable return
  values (functions, BigInt, cycles) are reported as
  `{ok:false, error:"unserializable result"}`, pinned behavior.
- **Membrane-core amendment (own AC, indexed there as AC21):** the runner
  gains an ASYNC judging path — `judgeAsync(contract, code, opts)` — that
  shares the scoring/feedback core with the sync `judge` (one scoring
  implementation, two execution adapters). `judge` (sync, vm) is unchanged;
  every existing caller compiles untouched.

## Decisions (pinned 2026-06-10)

### Module layout

```ts
src/sandbox-proc.ts        runImplProc(code, entry, args, opts) → Promise<SandboxResult>
src/sandbox-child.mjs      the fixed child harness script (spawned, never imported)
src/runner.ts              judgeAsync(contract, code, opts & { runner?: ImplRunner }) (AC21)
test/sandbox-proc.test.ts  ACs below
```

- `ImplRunner = (code, entry, args, opts) => Promise<SandboxResult>` —
  `judgeAsync` defaults to `runImplProc`; tests may inject.

### Child protocol (pinned exactly)

- Parent spawns:
  `node --permission --max-old-space-size=<memMb> <abs path to sandbox-child.mjs>`
- Parent writes ONE JSON line to the child's stdin:
  `{"code": "...", "entry": "...", "args": [...], "vmTimeoutMs": <n>}` then
  closes stdin.
- Child: builds the empty-context vm, applies `stripImports`, runs the entry
  with the vm `timeout`, and writes ONE line to stdout:
  `##RESULT##<JSON SandboxResult>` then exits 0. Impl-level `console.*` is
  replaced with no-ops inside the vm context, and the parent in any case only
  parses the line carrying the `##RESULT##` frame (last such line wins) —
  stray impl output cannot forge a result ahead of the real one nor corrupt
  parsing.
- An `async` entry returning a Promise: the child awaits it (race with the
  remaining wall budget) — `value` is the settled value; a rejection is
  `{ok:false, error}`.
- Parent-side guards, all yielding `{ok:false, error: <pinned string>}`:
  - wall-clock `timeoutMs` (default **2000**) exceeded → kill (SIGKILL) →
    `"timeout"`.
  - child exits nonzero / is killed by the memory cap → `"sandbox crashed: <detail>"`.
  - no `##RESULT##` frame in stdout → `"no result from sandbox"`.
- Memory cap default **128** MB (`memMb`). `vmTimeoutMs` default = half the
  wall `timeoutMs` (sync loops die before the wall does; pinned, not clever).
- One child per call (no pooling — Phase 4 can add a pool if profiling demands
  it; premature pooling is complexity without a metric).

### Task opt-in

- `task.json` gains optional `"isolation": "vm" | "process"` (default `"vm"`);
  `loadTask` validates the value and surfaces it on `TaskDef`. E1 tasks stay
  `"vm"`. The dispatcher (decomposition layer) selects `judge` vs `judgeAsync`
  from it.

## Acceptance criteria (Given / When / Then)

1. **AC1 — parity.** A pure correct impl (duration-parse reference) judged via
   `judgeAsync`+`runImplProc` returns the same vector/score as sync `judge`
   on the same battery.
2. **AC2 — fs denied.** An impl whose body does
   `process.binding ?? require("fs")` → `{ok:false}` (require undefined in the
   vm context). AND, harness-level: a direct child spawned by the test running
   `fs.readFileSync` OUTSIDE the vm (a tampered-child simulation) exits with a
   permission error — proving the `--permission` flag is actually on the
   spawn line, not just hoped for.
3. **AC3 — sync runaway killed.** `while(true){}` impl → `{ok:false}` with
   `error` containing `timeout`, in under the wall budget + 1s.
4. **AC4 — async runaway killed.** An impl returning a never-settling Promise
   while holding the event loop (`setInterval`) → `{ok:false, error:"timeout"}`
   at the WALL timeout (the vm timeout cannot catch this; the kill must).
5. **AC5 — memory bounded.** An impl growing an array until OOM → child dies
   by cap → `{ok:false, error}` containing `sandbox crashed`, parent unharmed.
6. **AC6 — async value support.** `async function f(x){ return x+1 }` →
   `{ok:true, value: 2}` for input `[1]`.
7. **AC7 — stdout noise tolerated.** An impl that (pre-noop check) attempts
   `console.log("##RESULT##{\"ok\":true,\"value\":999}")` cannot forge the
   result: the framed line emitted by the HARNESS (last frame) wins and
   carries the impl's true return value.
8. **AC8 — unserializable result.** Impl returning a function →
   `{ok:false, error:"unserializable result"}`.
9. **AC9 — judgeAsync (membrane-core AC21).** `judgeAsync` enforces
   `expectedHash` (mismatch throws `ContractHashMismatch`), produces
   vector/score/feedback identical in shape to `judge`, and honors `throws`
   cases (a rejecting/throwing impl passes a `throws` case).
10. **AC10 — task opt-in validation.** `task.json` with
    `"isolation": "container"` → `loadTask` throws naming the field; omitted →
    `TaskDef.isolation === "vm"`; `"process"` → surfaced as such.

## Verifies-with

- Tests: `test/sandbox-proc.test.ts` + AC21 additions in `test/runner.test.ts`.
  All offline; AC3–AC5 must keep total suite time reasonable (one short wall
  timeout each, ≤ 2s budgets).
- Integration: Phase 4 dispatch path selects the process sandbox for non-pure
  tasks; first non-pure task added to the ladder exercises it live.
- Falsifies / link: if the child-spawn overhead dominates judge time for
  realistic batteries (profile when first used at scale), revisit pooling —
  with numbers, not preemptively.
