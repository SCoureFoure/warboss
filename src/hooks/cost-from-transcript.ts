/**
 * Pure core for the SubagentStop cost hook: turn a Claude Code transcript into
 * cost-ledger rows. The thesis ("meter every worker") applied to our own dev
 * loop — the cheap agents that BUILD the harness get metered the same way the
 * experiment grunts do.
 *
 * Kept IO-free so it is unit-testable: the stdin/file wrapper lives in
 * subagent-cost.ts. Cost math routes through `costBreakdown`, so there is one
 * source of truth for dollars across the whole repo.
 */

import { costBreakdown, type Usage, type CostBreakdown } from "../cost.ts";
import type { ModelSpec } from "../models.ts";

/**
 * Prices USD per 1M tokens for the Claude Code dev-worker models (catalog
 * 2026-06). These are the models that run the *harness build*, not the
 * experiment — distinct from `models.ts` TIERS, which price the warboss grunts.
 * Unknown models are recorded at $0 (tokens still captured) so a new model id
 * surfaces as a zero-cost row rather than vanishing.
 */
export const DEV_MODEL_PRICES: Record<
  string,
  { label: string; inputPerMTok: number; outputPerMTok: number }
> = {
  "claude-fable-5": { label: "fable-5", inputPerMTok: 10, outputPerMTok: 50 },
  "claude-opus-4-8": { label: "opus-4-8", inputPerMTok: 5, outputPerMTok: 25 },
  "claude-opus-4-7": { label: "opus-4-7", inputPerMTok: 5, outputPerMTok: 25 },
  "claude-sonnet-4-6": { label: "sonnet-4-6", inputPerMTok: 3, outputPerMTok: 15 },
  "claude-haiku-4-5": { label: "haiku-4-5", inputPerMTok: 1, outputPerMTok: 5 },
};

export function priceModel(modelId: string): ModelSpec {
  const p = DEV_MODEL_PRICES[modelId];
  return p
    ? { id: modelId, label: p.label, inputPerMTok: p.inputPerMTok, outputPerMTok: p.outputPerMTok }
    : { id: modelId, label: modelId, inputPerMTok: 0, outputPerMTok: 0 };
}

export interface CostRow {
  /** Transcript message uuid — the dedup key (each message recorded once). */
  readonly uuid: string;
  /** Anthropic request-id — join key to the account's console usage logs. */
  readonly requestId?: string;
  readonly sessionId?: string;
  readonly kind: string;
  readonly model: string;
  readonly modelLabel: string;
  readonly usage: Usage;
  readonly costUsd: number;
  readonly cost: CostBreakdown;
  readonly at: string;
}

/** One raw transcript record (only the fields we read; everything else ignored). */
interface TranscriptRecord {
  uuid?: string;
  requestId?: string;
  timestamp?: string;
  message?: {
    id?: string;
    role?: string;
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
}

function toUsage(u: NonNullable<NonNullable<TranscriptRecord["message"]>["usage"]>): Usage {
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    ...(u.cache_read_input_tokens != null ? { cacheReadInputTokens: u.cache_read_input_tokens } : {}),
    ...(u.cache_creation_input_tokens != null
      ? { cacheCreationInputTokens: u.cache_creation_input_tokens }
      : {}),
  };
}

/**
 * Parse a transcript (JSONL text) into cost rows for every assistant message
 * whose uuid is not already in `seenUuids`. Skips malformed lines and any
 * record without an assistant `message.usage`. Dedup by uuid makes this safe to
 * run on every SubagentStop regardless of whether the transcript is the
 * subagent's or the whole session — already-recorded messages are never
 * double-counted.
 */
export function extractCostRows(
  transcriptText: string,
  seenUuids: ReadonlySet<string>,
  ctx: { sessionId?: string; kind?: string } = {},
): CostRow[] {
  const rows: CostRow[] = [];
  const seen = new Set(seenUuids);
  // Within a single pass, deduplicate by requestId too: one API call can
  // produce N transcript records with different uuids but identical usage.
  const seenRequestIds = new Set<string>();

  // Strip a leading UTF-8 BOM so an editor-saved transcript still parses.
  const text = transcriptText.charCodeAt(0) === 0xfeff ? transcriptText.slice(1) : transcriptText;

  for (const line of text.split("\n")) {
    if (line.length === 0) continue;
    let rec: TranscriptRecord;
    try {
      rec = JSON.parse(line) as TranscriptRecord;
    } catch {
      continue;
    }
    const msg = rec.message;
    if (!msg || msg.role !== "assistant" || !msg.usage) continue;

    const uuid = rec.uuid ?? msg.id;
    if (uuid === undefined || seen.has(uuid)) continue;
    if (rec.requestId !== undefined && seenRequestIds.has(rec.requestId)) continue;

    const usage = toUsage(msg.usage);
    const spec = priceModel(msg.model ?? "unknown");
    const cost = costBreakdown(spec, usage);

    rows.push({
      uuid,
      ...(rec.requestId !== undefined ? { requestId: rec.requestId } : {}),
      ...(ctx.sessionId !== undefined ? { sessionId: ctx.sessionId } : {}),
      kind: ctx.kind ?? "claudecode.subagent",
      model: spec.id,
      modelLabel: spec.label,
      usage,
      costUsd: cost.totalCost,
      cost,
      at: rec.timestamp ?? new Date().toISOString(),
    });
    seen.add(uuid);
    if (rec.requestId !== undefined) seenRequestIds.add(rec.requestId);
  }

  return rows;
}
