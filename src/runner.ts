/**
 * The runner: verifies the membrane, then judges an implementation against it.
 *
 * Two jobs, in order:
 *   1. Mechanical freeze enforcement — refuse to execute against a contract
 *      whose hash does not match its frozen registration. This is the membrane
 *      applied to ourselves.
 *   2. Honest judging — run the impl against a battery of cases in the sandbox
 *      and report pass/fail + a feedback signal whose richness is a first-class
 *      experimental variable (E1b feedback-granularity arms).
 */

import { Contract, type ContractCase } from "./contract.ts";
import { runImpl } from "./sandbox.ts";
import type { SandboxResult } from "./sandbox.ts";
import { runImplProc, type ProcRunOptions } from "./sandbox-proc.ts";

/**
 * Feedback granularity. The AlphaProof loop works because the judge says *why*;
 * how much it says is exactly what E1b varies.
 *   - passfail: bare boolean, no detail.
 *   - input:    which input failed, nothing else.
 *   - full:     input + expected + actual. Default for covered cases.
 * The hidden battery is NEVER surfaced through feedback at any granularity.
 */
export type Granularity = "passfail" | "input" | "full";

export interface CaseResult {
  readonly name?: string;
  readonly input: readonly unknown[];
  readonly expected: unknown;
  readonly actual?: unknown;
  readonly pass: boolean;
  readonly error?: string;
}

export interface JudgeResult {
  /** All cases passed. */
  readonly pass: boolean;
  /** Pass/fail per case, in order — the behavioral vector used for clustering. */
  readonly vector: readonly boolean[];
  readonly results: readonly CaseResult[];
  /** Fraction of cases passed, [0,1]. */
  readonly score: number;
  /** Retry signal at the requested granularity. Empty when all pass. */
  readonly feedback: string;
}

export class ContractHashMismatch extends Error {
  constructor(expected: string, actual: string) {
    super(
      `refusing to execute: contract hash ${actual} does not match frozen registration ${expected}`,
    );
    this.name = "ContractHashMismatch";
  }
}

export interface JudgeOptions {
  /**
   * Cases to score against. Defaults to the contract's own examples. For hidden-
   * battery scoring, pass the held-out cases here — they stay out of feedback.
   */
  readonly battery?: readonly ContractCase[];
  /** Whether `battery` cases may appear in feedback. Hidden battery → false. */
  readonly revealInFeedback?: boolean;
  readonly granularity?: Granularity;
  /** The hash the runner was registered to expect. Enforces mechanical freeze. */
  readonly expectedHash?: string;
  readonly timeoutMs?: number;
}

/** Verify the membrane, run `code` against the battery, and score it. */
export function judge(
  contract: Contract,
  code: string,
  opts: JudgeOptions = {},
): JudgeResult {
  if (opts.expectedHash !== undefined && !contract.verify(opts.expectedHash)) {
    throw new ContractHashMismatch(opts.expectedHash, contract.hash);
  }

  const battery = opts.battery ?? contract.examples;
  const granularity = opts.granularity ?? "full";
  const reveal = opts.revealInFeedback ?? opts.battery === undefined;

  const results: CaseResult[] = battery.map((c) => {
    const run = runImpl(code, contract.entry, c.input, {
      ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
    });
    if (c.throws) {
      // Case passes iff the impl threw (any error, including timeout/missing-entry).
      const pass = !run.ok;
      return { ...labelOf(c), pass, ...(run.ok ? { actual: run.value } : {}) };
    }
    if (!run.ok) {
      return { ...labelOf(c), pass: false, error: run.error };
    }
    const pass = deepEqual(run.value, c.expected);
    return { ...labelOf(c), pass, actual: run.value };
  });

  const vector = results.map((r) => r.pass);
  const passed = vector.filter(Boolean).length;
  const allPass = passed === vector.length;

  return {
    pass: allPass,
    vector,
    results,
    score: vector.length === 0 ? 1 : passed / vector.length,
    feedback: allPass ? "" : buildFeedback(results, granularity, reveal),
  };
}

function labelOf(c: ContractCase): { name?: string; input: readonly unknown[]; expected: unknown } {
  return {
    ...(c.name !== undefined ? { name: c.name } : {}),
    input: c.input,
    expected: c.expected,
  };
}

function buildFeedback(
  results: readonly CaseResult[],
  granularity: Granularity,
  reveal: boolean,
): string {
  const failing = results.filter((r) => !r.pass);
  if (failing.length === 0) return "";

  // When the battery is hidden, never name specifics — only the count leaks.
  if (!reveal) {
    return `${failing.length} hidden case(s) failed.`;
  }

  if (granularity === "passfail") {
    return `${failing.length} case(s) failed.`;
  }

  const lines = failing.map((r) => {
    const inp = fmt(r.input);
    if (granularity === "input") {
      return `- input ${inp} failed`;
    }
    // full
    if (r.error !== undefined) {
      return `- input ${inp}: errored (${r.error}); expected ${fmt(r.expected)}`;
    }
    return `- input ${inp}: got ${fmt(r.actual)}, expected ${fmt(r.expected)}`;
  });
  return lines.join("\n");
}

function fmt(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export type ImplRunner = (code: string, entry: string, args: readonly unknown[], opts?: ProcRunOptions) => Promise<SandboxResult>;

export interface JudgeAsyncOptions extends JudgeOptions {
  runner?: ImplRunner;  // default: runImplProc
  procOpts?: ProcRunOptions;
}

export async function judgeAsync(
  contract: Contract,
  code: string,
  opts: JudgeAsyncOptions = {},
): Promise<JudgeResult> {
  if (opts.expectedHash !== undefined && !contract.verify(opts.expectedHash)) {
    throw new ContractHashMismatch(opts.expectedHash, contract.hash);
  }

  const battery = opts.battery ?? contract.examples;
  const granularity = opts.granularity ?? "full";
  const reveal = opts.revealInFeedback ?? opts.battery === undefined;
  const runner = opts.runner ?? runImplProc;

  const results: CaseResult[] = await Promise.all(
    battery.map(async (c) => {
      const run = await runner(code, contract.entry, c.input, opts.procOpts);
      if (c.throws) {
        const pass = !run.ok;
        return { ...labelOf(c), pass, ...(run.ok ? { actual: run.value } : {}) };
      }
      if (!run.ok) {
        return { ...labelOf(c), pass: false, error: run.error };
      }
      const pass = deepEqual(run.value, c.expected);
      return { ...labelOf(c), pass, actual: run.value };
    }),
  );

  const vector = results.map((r) => r.pass);
  const passed = vector.filter(Boolean).length;
  const allPass = passed === vector.length;

  return {
    pass: allPass,
    vector,
    results,
    score: vector.length === 0 ? 1 : passed / vector.length,
    feedback: allPass ? "" : buildFeedback(results, granularity, reveal),
  };
}

/** Structural deep-equality. Handles primitives (incl. NaN), arrays, plain objects. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") {
    return Number.isNaN(a) && Number.isNaN(b);
  }
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr !== bArr) return false;
  if (aArr && bArr) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => Object.prototype.hasOwnProperty.call(bo, k) && deepEqual(ao[k], bo[k]));
}
