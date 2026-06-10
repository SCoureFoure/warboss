/**
 * Per-run token/dollar ledger.
 *
 * PLAN: "Cost logging: every generation and every judge run logs model, tokens
 * in/out, wall time, and dollar cost. Non-negotiable, day one." This module is
 * that promise made concrete — nothing that calls a model should compute cost
 * ad hoc; route it through here so the ledger is the single source of truth.
 */

import type { ModelSpec } from "./models.ts";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  /** Cache reads, if any. Billed at ~0.1x input; folded into cost below. */
  cacheReadInputTokens?: number;
  /** Cache writes, if any. Billed at ~1.25x input; folded into cost below. */
  cacheCreationInputTokens?: number;
}

export interface LedgerEntry {
  /** What this call was — e.g. "grunt.generate", "judge.run". */
  readonly kind: string;
  readonly model: string;
  readonly usage: Usage;
  /** Wall-clock milliseconds for the call. */
  readonly wallMs: number;
  /** USD cost for this single call. */
  readonly costUsd: number;
  readonly at: string;
  /** Free-form tags for slicing (arm, task, attempt, …). */
  readonly tags?: Readonly<Record<string, string | number>>;
}

/** USD cost of one usage record against a model's price. */
export function costOf(model: ModelSpec, usage: Usage): number {
  const inM = model.inputPerMTok / 1_000_000;
  const outM = model.outputPerMTok / 1_000_000;
  const fresh = usage.inputTokens * inM;
  const cacheRead = (usage.cacheReadInputTokens ?? 0) * inM * 0.1;
  const cacheWrite = (usage.cacheCreationInputTokens ?? 0) * inM * 1.25;
  const out = usage.outputTokens * outM;
  return fresh + cacheRead + cacheWrite + out;
}

export interface LedgerTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  wallMs: number;
  costUsd: number;
}

/** Append-only cost ledger. One instance per experiment run. */
export class Ledger {
  private readonly entries: LedgerEntry[] = [];

  record(args: {
    kind: string;
    model: ModelSpec;
    usage: Usage;
    wallMs: number;
    tags?: Record<string, string | number>;
  }): LedgerEntry {
    const entry: LedgerEntry = {
      kind: args.kind,
      model: args.model.id,
      usage: args.usage,
      wallMs: args.wallMs,
      costUsd: costOf(args.model, args.usage),
      at: new Date().toISOString(),
      ...(args.tags ? { tags: args.tags } : {}),
    };
    this.entries.push(entry);
    return entry;
  }

  all(): readonly LedgerEntry[] {
    return this.entries;
  }

  /** Totals, optionally filtered to entries whose tags match every pair given. */
  totals(filter?: Record<string, string | number>): LedgerTotals {
    const acc: LedgerTotals = {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      wallMs: 0,
      costUsd: 0,
    };
    for (const e of this.entries) {
      if (filter && !matches(e, filter)) continue;
      acc.calls += 1;
      acc.inputTokens += e.usage.inputTokens;
      acc.outputTokens += e.usage.outputTokens;
      acc.wallMs += e.wallMs;
      acc.costUsd += e.costUsd;
    }
    return acc;
  }

  toJSON(): readonly LedgerEntry[] {
    return this.entries;
  }
}

function matches(
  entry: LedgerEntry,
  filter: Record<string, string | number>,
): boolean {
  if (!entry.tags) return false;
  for (const [k, v] of Object.entries(filter)) {
    if (entry.tags[k] !== v) return false;
  }
  return true;
}
