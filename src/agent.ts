/**
 * The core agent layer.
 *
 * A warboss agent is a thin, dogmatic wrapper around a SINGLE model call:
 * prose (+ contract) (+ feedback) → text. No tools, no autonomous loop — that
 * is deliberate. The PLAN's grunt "is a doer, not a planner": it receives a
 * decided environment and executes it. The agentic loop (generate → judge →
 * retry) lives ABOVE this layer in the experiment runner, not inside the agent.
 *
 * Every call is metered through the Ledger. There is no un-metered path to a
 * model in this codebase — correctness-per-dollar is the metric the thesis is
 * settled on, so cost is a first-class output of every generation.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ModelSpec } from "./models.ts";
import { Ledger, type Usage } from "./cost.ts";

/**
 * Grunt base behavior (fail-up dogma). Embedded so a grunt that hits an
 * undecided fork escalates the gap upward instead of guessing — this is what
 * keeps grunts simple creatures. Arms that want to study raw interpretation
 * variance can omit it.
 */
export const GRUNT_DOGMA = [
  "You are a grunt. You implement exactly what the contract decides — nothing more.",
  "Output ONLY the implementation as a single fenced code block. No prose, no explanation.",
  "When the contract does not decide something, do not guess: implement the most literal",
  "reading and add a line comment `// UNDECIDED: <what>` at the relevant spot.",
].join(" ");

let sharedClient: Anthropic | undefined;
function defaultClient(): Anthropic {
  // Lazy so importing this module doesn't require a key (e.g. typecheck/CI).
  sharedClient ??= new Anthropic();
  return sharedClient;
}

/**
 * Minimal surface the Agent needs from the SDK. Declaring it explicitly lets
 * tests inject a fake client (offline, deterministic) without a real key, and
 * keeps the agent layer honest about how little of the SDK it actually uses.
 */
export interface MessagesClient {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
    ): Promise<Anthropic.Message>;
  };
}

/** Adaptive thinking is Opus/Sonnet-tier; Haiku does not take it. */
export interface ThinkingConfig {
  type: "adaptive";
  display?: "summarized" | "omitted";
}

export interface GenerateOptions {
  /** The decided environment: prose requirement, frozen contract slice, feedback. */
  prompt: string;
  /** Defaults to GRUNT_DOGMA. Pass "" to study unconstrained base behavior. */
  system?: string;
  maxTokens?: number;
  /** Opt-in per call; only set for tiers that support it. */
  thinking?: ThinkingConfig;
  /** Label for the ledger entry, e.g. "grunt.generate". */
  kind?: string;
  /** Tags for ledger slicing (arm, task, attempt, …). */
  tags?: Record<string, string | number>;
}

export interface GenerateResult {
  /** Full text of the model's response (text blocks concatenated). */
  text: string;
  /** First fenced code block, if any — the impl the grunt produced. */
  code: string | undefined;
  usage: Usage;
  costUsd: number;
  wallMs: number;
}

export interface AgentDefaults {
  system?: string;
  maxTokens?: number;
  /** Injectable for tests; defaults to a lazily-constructed shared SDK client. */
  client?: MessagesClient;
}

export class Agent {
  constructor(
    readonly model: ModelSpec,
    private readonly ledger: Ledger,
    private readonly defaults: AgentDefaults = {},
  ) {}

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const system = opts.system ?? this.defaults.system ?? GRUNT_DOGMA;
    const maxTokens = opts.maxTokens ?? this.defaults.maxTokens ?? 4096;
    const client = this.defaults.client ?? defaultClient();

    const started = performance.now();
    const res = await client.messages.create({
      model: this.model.id,
      max_tokens: maxTokens,
      system,
      // Cast through unknown: adaptive thinking is valid at the API but the
      // installed SDK's ThinkingConfigParam union may lag behind the model.
      ...(opts.thinking
        ? { thinking: opts.thinking as unknown as Anthropic.ThinkingConfigParam }
        : {}),
      messages: [{ role: "user", content: opts.prompt }],
    });
    const wallMs = performance.now() - started;

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const usage: Usage = {
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      ...(res.usage.cache_read_input_tokens != null
        ? { cacheReadInputTokens: res.usage.cache_read_input_tokens }
        : {}),
      ...(res.usage.cache_creation_input_tokens != null
        ? { cacheCreationInputTokens: res.usage.cache_creation_input_tokens }
        : {}),
    };

    const entry = this.ledger.record({
      kind: opts.kind ?? "agent.generate",
      model: this.model,
      usage,
      wallMs,
      ...(opts.tags ? { tags: opts.tags } : {}),
    });

    return {
      text,
      code: extractCode(text),
      usage,
      costUsd: entry.costUsd,
      wallMs,
    };
  }
}

/**
 * Pull the first fenced code block out of a model response. Grunts are told to
 * emit exactly one; this tolerates an optional language tag and falls back to
 * the whole string when no fence is present (so a bare-code response still runs).
 */
export function extractCode(text: string): string | undefined {
  const fence = /```(?:[\w-]+)?\n([\s\S]*?)```/.exec(text);
  if (fence?.[1] !== undefined) return fence[1].trim();
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
