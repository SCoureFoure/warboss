/**
 * Model tiers for the warboss hierarchy.
 *
 * The thesis is settled on correctness-per-dollar, so every model the harness
 * can call is pinned here with its price. Pricing is USD per 1M tokens, taken
 * from the Anthropic model catalog (cached 2026-06). Update both the id and the
 * price together — cost.ts reads these and a wrong price silently corrupts the
 * one metric the whole project is judged on.
 */

export interface ModelSpec {
  /** Exact API model id. */
  readonly id: string;
  /** Human label for logs/ledgers. */
  readonly label: string;
  /** USD per 1M input tokens. */
  readonly inputPerMTok: number;
  /** USD per 1M output tokens. */
  readonly outputPerMTok: number;
}

/**
 * Capability ladder, ascending. This is the model-power axis — NOT the comms
 * hierarchy and NOT a per-rank identity.
 *
 * Tier is chosen by a task's RESIDUAL ENTROPY (how much interpretation latitude
 * is left), not by which rank holds it. Each rank's job is to break the
 * complexity it receives into smaller, lower-entropy chunks and delegate them
 * down — so as work descends the chain its residual entropy falls and a cheaper
 * tier becomes viable. The whole bet is to push entropy down to where the LOW
 * tier can satisfy the contract.
 *
 * Consequences worth stating plainly:
 *  - A Sergeant on a low-entropy slice may run LOW; a Sergeant on a gnarly slice
 *    may run MID or even HIGH. Rank ≠ tier.
 *  - Higher ranks handle higher-entropy tasks (Warboss > Sergeant > Grunt in the
 *    entropy they can absorb), but they absorb it by DECOMPOSING, not by being
 *    the ones who finally satisfy a dense contract.
 */
export const TIERS = {
  /** Lowest viable model. The thesis bets this tier satisfies a dense contract. */
  LOW: {
    id: "claude-haiku-4-5",
    label: "haiku-4-5",
    inputPerMTok: 1.0,
    outputPerMTok: 5.0,
  },
  /** Mid model. Handles higher residual entropy than LOW. */
  MID: {
    id: "claude-sonnet-4-6",
    label: "sonnet-4-6",
    inputPerMTok: 3.0,
    outputPerMTok: 15.0,
  },
  /** High model. Highest entropy absorption; the E1a Arm D one-shot baseline. */
  HIGH: {
    id: "claude-opus-4-8",
    label: "opus-4-8",
    inputPerMTok: 5.0,
    outputPerMTok: 25.0,
  },
} as const satisfies Record<string, ModelSpec>;

export type Tier = keyof typeof TIERS;

/** Tiers cheapest → most capable. The order in which to escalate on stall. */
export const TIER_LADDER: readonly Tier[] = ["LOW", "MID", "HIGH"];

/**
 * Starting-tier hints by comms rank — a DEFAULT, not a binding. Real selection
 * is entropy-driven (Phase 4+): a rank picks the cheapest tier that can absorb
 * its current task's residual entropy, escalating up TIER_LADDER only if it
 * stalls. These hints exist so early experiments have a sane default per role.
 */
export const RANK_TIER_HINT = {
  GRUNT: "LOW",
  SERGEANT: "MID",
  WARCHIEF: "MID",
  WARBOSS: "HIGH",
} as const satisfies Record<string, Tier>;
