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

/**
 * Itemized cost of one call. Stored on every ledger entry so a dollar figure
 * can be reconstructed and reconciled against an Anthropic console line item
 * without re-deriving it from a price table — the rates that were applied are
 * carried alongside the components.
 */
export interface CostBreakdown {
  /** Fresh input tokens × input rate. */
  readonly inputCost: number;
  /** Output tokens × output rate. */
  readonly outputCost: number;
  /** Cache-read tokens × input rate × 0.1. */
  readonly cacheReadCost: number;
  /** Cache-write tokens × input rate × 1.25. */
  readonly cacheWriteCost: number;
  /** Sum of the four components. Equals `costOf`. */
  readonly totalCost: number;
  /** Input rate applied (USD per 1M tokens). */
  readonly inputPerMTok: number;
  /** Output rate applied (USD per 1M tokens). */
  readonly outputPerMTok: number;
}

export interface LedgerEntry {
  /** What this call was — e.g. "grunt.generate", "judge.run". */
  readonly kind: string;
  /** Exact API model id. */
  readonly model: string;
  /** Human label for the model (e.g. "haiku-4-5"). */
  readonly modelLabel: string;
  /**
   * Anthropic `request-id` — the join key to the account's console usage logs.
   * Present when the SDK response carried one; absent for offline/fake calls.
   */
  readonly requestId?: string;
  readonly usage: Usage;
  /** Wall-clock milliseconds for the call. */
  readonly wallMs: number;
  /** USD cost for this single call. Equals `cost.totalCost`. */
  readonly costUsd: number;
  /** Itemized cost components + the rates applied. */
  readonly cost: CostBreakdown;
  readonly at: string;
  /** Free-form tags for slicing (arm, task, attempt, …). */
  readonly tags?: Readonly<Record<string, string | number>>;
}

/** Itemized USD cost of one usage record against a model's price. */
export function costBreakdown(model: ModelSpec, usage: Usage): CostBreakdown {
  const inM = model.inputPerMTok / 1_000_000;
  const outM = model.outputPerMTok / 1_000_000;
  const inputCost = usage.inputTokens * inM;
  const cacheReadCost = (usage.cacheReadInputTokens ?? 0) * inM * 0.1;
  const cacheWriteCost = (usage.cacheCreationInputTokens ?? 0) * inM * 1.25;
  const outputCost = usage.outputTokens * outM;
  return {
    inputCost,
    outputCost,
    cacheReadCost,
    cacheWriteCost,
    totalCost: inputCost + outputCost + cacheReadCost + cacheWriteCost,
    inputPerMTok: model.inputPerMTok,
    outputPerMTok: model.outputPerMTok,
  };
}

/** USD cost of one usage record against a model's price. */
export function costOf(model: ModelSpec, usage: Usage): number {
  return costBreakdown(model, usage).totalCost;
}

/** Called once per recorded entry — the hook the durable JSONL log rides on. */
export type LedgerSink = (entry: LedgerEntry) => void;

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

  /** `sink` (if given) is called once per `record`, with the stored entry. */
  constructor(private readonly sink?: LedgerSink) {}

  record(args: {
    kind: string;
    model: ModelSpec;
    usage: Usage;
    wallMs: number;
    requestId?: string;
    tags?: Record<string, string | number>;
  }): LedgerEntry {
    const cost = costBreakdown(args.model, args.usage);
    const entry: LedgerEntry = {
      kind: args.kind,
      model: args.model.id,
      modelLabel: args.model.label,
      ...(args.requestId !== undefined ? { requestId: args.requestId } : {}),
      usage: args.usage,
      wallMs: args.wallMs,
      costUsd: cost.totalCost,
      cost,
      at: new Date().toISOString(),
      ...(args.tags ? { tags: args.tags } : {}),
    };
    this.entries.push(entry);
    this.sink?.(entry);
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
