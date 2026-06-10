/**
 * Execution sandbox for grunt-produced implementations.
 *
 * PLAN, E1 scope: grunt impls run in `node:vm` with a hard timeout (grunts WILL
 * write infinite loops). Constraint, written so it cannot silently break: all E1
 * tasks are pure functions — no I/O, no imports, no globals. Imports are stripped
 * before execution.
 *
 * SECURITY BOUNDARY — read before reusing this past Phase 4. `node:vm` is NOT a
 * security sandbox: it bounds runaway CPU (the timeout interrupts synchronous
 * loops) but it does NOT isolate the process. It is adequate only because E1
 * impls are pure and synchronous. Before Phase 4 — when tasks stop being pure
 * functions — this must be replaced with isolated-vm or a permission-stripped
 * child process. Do not mount untrusted async/IO code here.
 */

import { runInNewContext } from "node:vm";

export type SandboxResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: string };

/** Strip imports/requires/exports so a pure function body runs bare in the vm. */
export function stripImports(code: string): string {
  return code
    .replace(/^\s*import\s.*$/gm, "")
    .replace(/^\s*export\s+(?=function|const|let|var|class|async)/gm, "")
    .replace(/^\s*export\s+default\s+/gm, "")
    .replace(/\brequire\s*\([^)]*\)/g, "undefined");
}

export interface RunOptions {
  /** Hard wall-clock cap for the synchronous call. */
  readonly timeoutMs?: number;
}

/**
 * Define `entry` from `code` and call it with `args`, under a hard timeout.
 * Returns a structured result; never throws for impl-level errors (those are
 * captured into `{ ok: false }`).
 */
export function runImpl(
  code: string,
  entry: string,
  args: readonly unknown[],
  opts: RunOptions = {},
): SandboxResult {
  const timeout = opts.timeoutMs ?? 1000;
  const stripped = stripImports(code);

  // The vm context gets the call args and a slot for the result. The script
  // installs the impl, then invokes it. A missing/!function entry is reported,
  // not thrown past the caller.
  const context: Record<string, unknown> = {
    __args: args,
    __result: undefined,
    __error: undefined,
  };

  const script = `
    ${stripped}
    ;(function () {
      if (typeof ${entry} !== "function") {
        __error = "entry function '${entry}' is not defined";
        return;
      }
      try {
        __result = ${entry}(...__args);
      } catch (e) {
        __error = e && e.message ? String(e.message) : String(e);
      }
    })();
  `;

  try {
    runInNewContext(script, context, { timeout });
  } catch (e) {
    // Thrown here means compile error or timeout (vm raises on timeout).
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  if (context["__error"] !== undefined) {
    return { ok: false, error: String(context["__error"]) };
  }
  return { ok: true, value: context["__result"] };
}
