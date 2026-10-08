/**
 * The membrane primitive: a hash-frozen, executable contract.
 *
 * PLAN: "Freeze is mechanical, not policy. Contract object carries a content
 * hash + version; the runner refuses to execute against a contract whose hash
 * does not match its frozen registration." A frozen contract is the lowest-
 * entropy encoding of intent — a solved variable removed from the entropy
 * budget. This object is what makes membrane immutability an enforced property
 * rather than a documented intention.
 *
 * Note what is NOT here: the hidden held-out battery. Hidden cases never live on
 * the contract, because the contract is injected into grunt buffers and the
 * battery must never leak. The battery lives beside the task (tasks/<x>/) and is
 * only ever seen by the runner when scoring, never by an agent.
 */

import { createHash } from "node:crypto";

/** One acceptance example: a call and its required result. */
export interface ContractCase {
  /** Optional label for feedback/clustering. */
  readonly name?: string;
  /** Positional args passed to the entry function. */
  readonly input: readonly unknown[];
  /** Required return value (deep-equality compared). Ignored when throws is set. */
  readonly expected: unknown;
  /** When true, the case passes iff the entry function itself throws. Timeout, crash, or a missing entry fail. */
  readonly throws?: true;
  /** Optional regex source tested against the error message. Only valid with throws. */
  readonly throwsMatch?: string;
}

export interface ContractInput {
  /** Prose requirement shown to the grunt. */
  readonly requirement: string;
  /** Name of the function the implementation must define. */
  readonly entry: string;
  /** Canonical acceptance examples — the frozen anchors. */
  readonly examples: readonly ContractCase[];
  /** Bumped whenever any frozen field changes; part of the hash input. */
  readonly version: string;
}

function isPlainObject(v: object): boolean {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Throws if `v` holds a value the canonical form cannot represent losslessly. */
function assertSupported(v: unknown, path: string, label: string | number): void {
  const bad = (): never => {
    throw new Error(
      `Contract.freeze: example ${label} contains unsupported value at ${path}`,
    );
  };
  if (typeof v === "function" || typeof v === "symbol") bad();
  if (typeof v !== "object" || v === null) return;
  if (Array.isArray(v)) {
    v.forEach((item, i) => assertSupported(item, `${path}[${i}]`, label));
    return;
  }
  if (!isPlainObject(v)) bad();
  if (Object.prototype.hasOwnProperty.call(v, "$nonjson")) bad();
  for (const [k, item] of Object.entries(v)) {
    assertSupported(item, `${path}.${k}`, label);
  }
}

function deepFreeze(v: unknown): void {
  if (typeof v !== "object" || v === null || Object.isFrozen(v)) return;
  Object.freeze(v);
  for (const item of Object.values(v)) deepFreeze(item);
}

/** Replaces values JSON.stringify would lose with tagged `$nonjson` objects. */
function encodeLossless(v: unknown): unknown {
  if (v === undefined) return { $nonjson: "undefined" };
  if (typeof v === "bigint") return { $nonjson: `bigint:${v.toString()}` };
  if (typeof v === "number") {
    if (Number.isNaN(v)) return { $nonjson: "NaN" };
    if (v === Infinity) return { $nonjson: "Infinity" };
    if (v === -Infinity) return { $nonjson: "-Infinity" };
    if (Object.is(v, -0)) return { $nonjson: "-0" };
    return v;
  }
  if (typeof v !== "object" || v === null) return v;
  if (Array.isArray(v)) return Array.from(v, (item) => encodeLossless(item));
  const out: Record<string, unknown> = {};
  for (const [k, item] of Object.entries(v)) out[k] = encodeLossless(item);
  return out;
}

/**
 * A frozen contract. Construct via `freeze()`. The `hash` pins exactly the bytes
 * of intent that were frozen; the runner checks it before every execution.
 */
export class Contract {
  readonly requirement: string;
  readonly entry: string;
  readonly examples: readonly ContractCase[];
  readonly version: string;
  readonly hash: string;

  private constructor(input: ContractInput) {
    input.examples.forEach((c, i) => {
      if (c.throwsMatch === undefined) return;
      const label = c.name ?? i;
      if (c.throws !== true) {
        throw new Error(
          `Contract.freeze: example ${label} has throwsMatch without throws: true`,
        );
      }
      try {
        new RegExp(c.throwsMatch);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Contract.freeze: example ${label} has invalid throwsMatch regex: ${message}`,
        );
      }
    });
    input.examples.forEach((c, i) => {
      const label = c.name ?? i;
      assertSupported(c.input, "input", label);
      assertSupported(c.expected, "expected", label);
    });
    const examples = structuredClone(input.examples) as ContractCase[];
    deepFreeze(examples);
    this.requirement = input.requirement;
    this.entry = input.entry;
    this.examples = examples;
    this.version = input.version;
    this.hash = Contract.computeHash({ ...input, examples });
    Object.freeze(this);
  }

  static freeze(input: ContractInput): Contract {
    return new Contract(input);
  }

  /**
   * Content hash over the canonical form of the frozen fields. Deterministic:
   * key order fixed, no timestamps. Any byte of intent that changes changes the
   * hash, which is the whole point.
   */
  static computeHash(input: ContractInput): string {
    const canonical = JSON.stringify({
      requirement: input.requirement,
      entry: input.entry,
      version: input.version,
      examples: input.examples.map((c) => ({
        input: encodeLossless(c.input),
        ...(c.expected !== undefined ? { expected: encodeLossless(c.expected) } : {}),
        ...(c.throws ? { throws: true as const } : {}),
        ...(c.throwsMatch !== undefined ? { throwsMatch: c.throwsMatch } : {}),
      })),
    });
    return createHash("sha256").update(canonical).digest("hex");
  }

  /** True if this contract still hashes to `expectedHash` (tamper check). */
  verify(expectedHash: string): boolean {
    return this.hash === expectedHash;
  }
}
