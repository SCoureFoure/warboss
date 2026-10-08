# fix-throws-kind

First read `.warboss-horde/slices/_fix-protocol.md` and follow it exactly.

Forks: a `throws` case passes only when the implementation itself threw = `intent` (owner decision, 2026-10-08).
Missing entry function does not count as a throw = `intent` (same decision). The four `kind` names = `fiat`.
Unserializable return value classified `infra` = `fiat`.

- files: `src/sandbox.ts`, `src/sandbox-proc.ts`, `src/sandbox-child.mjs`, `src/runner.ts`,
  `src/contract.ts` (doc comment on `ContractCase.throws` only),
  `test/sandbox.test.ts`, `test/sandbox-proc.test.ts`, `test/runner.test.ts`,
  `specs/membrane-core.spec.md`, `specs/sandbox-hardening.spec.md`
- Exception to the file list: any OTHER file under `src/` or `test/` that constructs a failing sandbox result
  literal (`{ ok: false, error: ... }` typed or used as `SandboxResult`) must gain the `kind` field so the project
  typechecks. Grep `src/` and `test/` for `ok: false` and fix each such construction; make no other change in those
  files, and list every one in your reply.
- context: `.warboss-horde/out/review-core.md` findings F3 and F6.

## Defect

`judge` and `judgeAsync` in `src/runner.ts` pass a `throws` case on ANY `{ ok: false }` result. A timeout (infinite
loop), a sandbox crash, a missing entry function, or a child that printed nothing all count as "the impl threw".

## Behavior

1. **Type** (`src/sandbox.ts`):

   ```ts
   export type SandboxFailureKind = "threw" | "timeout" | "no-entry" | "infra";
   export type SandboxResult =
     | { readonly ok: true; readonly value: unknown }
     | { readonly ok: false; readonly error: string; readonly kind: SandboxFailureKind };
   ```

   `kind` is required. `error` strings are unchanged everywhere.

2. **`runImpl`** (`src/sandbox.ts`) sets `kind`:
   - the entry function ran and threw (the inner `catch`) → `"threw"`
   - `typeof entry !== "function"` → `"no-entry"`
   - the outer `catch` around `runInNewContext`: if the caught error's `code` is `"ERR_SCRIPT_EXECUTION_TIMEOUT"` →
     `"timeout"`; anything else (syntax error, an error thrown by top-level impl code outside the entry call) →
     `"infra"`

   Use a second context slot (for example `__kind`) set inside the script; do not infer `kind` from the message text.

3. **`sandbox-child.mjs`** sets `kind` on every failing result it prints, by the same rules: inner `catch` →
   `"threw"`; missing entry → `"no-entry"`; outer `catch` → `"timeout"` when `e.code` is
   `"ERR_SCRIPT_EXECUTION_TIMEOUT"`, else `"infra"`; `"unserializable result"` → `"infra"`.

4. **`runImplProc`** (`src/sandbox-proc.ts`):
   - wall-clock kill (`timedOut`) → `kind: "timeout"`
   - `sandbox crashed: ...` (both the `close` branch and the `error` event) → `kind: "infra"`
   - `no result from sandbox` (no line, or unparseable JSON) → `kind: "infra"`
   - **Validate the parsed child result** before resolving it. It is valid iff it is a non-null object and either
     (`ok === true` and it has an own `value` key) or (`ok === false` and `typeof error === "string"` and `kind` is
     one of the four names). Anything else resolves `{ ok: false, error: "no result from sandbox", kind: "infra" }`.

5. **`judge` and `judgeAsync`** (`src/runner.ts`), for a case with `throws`:
   - `run.ok === true` → fail, as today (`actual: run.value`).
   - `run.ok === false` and `run.kind === "threw"` → today's logic: pass, or test `throwsMatch` against `run.error`.
   - `run.ok === false` and `run.kind !== "threw"` (including a missing `kind` from an untyped fake runner) →
     `{ ...labelOf(c), pass: false, error: run.error }`. `throwsMatch` is not consulted.
   Replace the two "any error, including timeout/missing-entry" comments with one that states this rule.
   Non-`throws` cases are unchanged.

6. `src/contract.ts`: change only the doc comment on `throws` to
   `/** When true, the case passes iff the entry function itself throws. Timeout, crash, or a missing entry fail. */`.

7. Specs: in `specs/membrane-core.spec.md` and `specs/sandbox-hardening.spec.md`, find each sentence that says a
   `throws` case passes on any error, on timeout, or on a missing entry, and rewrite that sentence to state rule 5.
   This is the one place this contract permits editing existing spec text. Append new criteria as the protocol says.

## Cases

`test/sandbox.test.ts` — `runImpl(code, "f", [])`:

1. `function f(){ throw new Error("bad") }` → `{ ok: false, error: "bad", kind: "threw" }`.
2. `function g(){ return 1 }` (no `f`) → `ok === false`, `kind === "no-entry"`.
3. `function f(){ while(true){} }` with `timeoutMs: 50` → `ok === false`, `kind === "timeout"`.
4. `function f( {` (syntax error) → `ok === false`, `kind === "infra"`.
5. `throw new Error("top"); function f(){ return 1 }` → `ok === false`, `kind === "infra"`.

`test/sandbox-proc.test.ts` — `runImplProc`, using the existing tests' options pattern:

6. Impl throws `new Error("bad")` → `kind === "threw"`, `error === "bad"`.
7. Missing entry → `kind === "no-entry"`.
8. `async function f(){ await new Promise(() => {}) }` with a short wall-clock timeout → `kind === "timeout"`.
9. Impl that returns a function (`function f(){ return () => 1 }`) → `ok === false`, `kind === "infra"`.
10. If the existing tests have a way to substitute the child's output or script, add: child prints `##RESULT##null`
    → `{ ok: false, error: "no result from sandbox", kind: "infra" }`; child prints
    `##RESULT##{"ok":false,"error":"x"}` (no `kind`) → same result. If there is no such seam, extract the validation
    into an exported pure function `parseChildResult(line: string): SandboxResult` in `src/sandbox-proc.ts` and test
    that function directly with those two inputs plus `##RESULT##{"ok":true,"value":3}` → `{ ok: true, value: 3 }`.

`test/runner.test.ts` — one contract `{ entry: "f", examples: [{ input: [], expected: undefined, throws: true }] }`
unless stated; run each case through BOTH `judge` (real `runImpl`) and `judgeAsync` (with an injected `runner`
returning the stated result) where applicable:

11. `judge`, impl `function f(){ throw new Error("bad") }` → `pass === true`.
12. `judge`, impl `function f(){ while(true){} }`, `timeoutMs: 50` → `pass === false`. (Old code: `true`.)
13. `judge`, impl `function g(){}` (missing entry) → `pass === false`. (Old code: `true`.)
14. `judge`, impl `function f(){ return 1 }` → `pass === false`.
15. `judgeAsync`, runner returns `{ ok: false, error: "sandbox crashed: spawn", kind: "infra" }` → `pass === false`.
16. `judgeAsync`, runner returns `{ ok: false, error: "timeout", kind: "timeout" }` → `pass === false`.
17. `judgeAsync`, runner returns `{ ok: false, error: "bad", kind: "threw" }` → `pass === true`.
18. `judgeAsync`, runner returns `{ ok: false, error: "bad" }` cast to bypass the type (no `kind`) → `pass === false`.
19. `throwsMatch: "bad"` on the example; `judgeAsync` runner returns
    `{ ok: false, error: "bad timeout", kind: "timeout" }` → `pass === false` (message matches, kind does not).
20. `throwsMatch: "bad"`; runner returns `{ ok: false, error: "bad", kind: "threw" }` → `pass === true`;
    runner returns `{ ok: false, error: "other", kind: "threw" }` → `pass === false`.

Existing tests that assert a `throws` case PASSES on a timeout or on a missing entry are named by this contract:
change them to assert `pass === false`. Existing fake runners that return `{ ok: false, error }` for a case meant to
represent an impl throw gain `kind: "threw"`. List every such changed test in your reply.
