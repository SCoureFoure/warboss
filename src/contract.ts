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
  /** When true, the case passes iff the impl throws (any error). */
  readonly throws?: true;
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
    this.requirement = input.requirement;
    this.entry = input.entry;
    this.examples = input.examples;
    this.version = input.version;
    this.hash = Contract.computeHash(input);
    Object.freeze(this);
    Object.freeze(this.examples);
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
        input: c.input,
        expected: c.expected,
        ...(c.throws ? { throws: true as const } : {}),
      })),
    });
    return createHash("sha256").update(canonical).digest("hex");
  }

  /** True if this contract still hashes to `expectedHash` (tamper check). */
  verify(expectedHash: string): boolean {
    return this.hash === expectedHash;
  }
}
