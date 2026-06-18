/**
 * kickback — shared module for the production kick-back loop.
 *
 * Promotes the E4-proven decision-block prose format out of the experiment
 * harness into the product path, and adds the queue types/loaders that the
 * live decompose-run uses to emit and consume owner-answer queues.
 *
 * Pure (no model calls); fully offline-unit-testable.
 *
 * Spec: specs/kickback-pipeline.spec.md rev 1.
 */

import { readFile } from "node:fs/promises";

// ── Decision-block renderer ───────────────────────────────────────────────────

/**
 * Render the canonical owner-decision prose block.
 *
 * Emits VERBATIM:
 *   The owner has DECIDED the following behaviors. Treat each as fixed intent —
 *   they are not open choices; author examples (choosing your own representative
 *   inputs) that pin exactly these:
 *   - <decisions[0]>
 *   - <decisions[1]>
 *   …
 *
 * One bullet per decision, input order, each bullet the decision string VERBATIM.
 * `renderDecisionBlock([])` returns the three header lines with no bullets.
 * (Empty decision list is a caller error upstream, not here.)
 *
 * Rev 2: when ≥1 decision is present, a literal-free authoring-diversity HINT is
 * appended as a trailing line after the bullets. It steers the author toward a
 * distinctive representative input rather than the single most obvious one. In
 * E4 this is the fix for verdict candidate #3 (ordering happy-lift): the author
 * coincidentally echoed a ruling's obvious input as its own example, so the
 * residual filter excluded that exact Leader-battery case and the class went
 * unscored. Reducing the echo probability lets the case survive the residual.
 * The hint is benign in the live path (no scoring battery there) — a distinctive
 * example pins a real contract just as well. The hint is NOT a bullet (no `- `
 * prefix) and carries no input literal / `entry(args)` / `===`, so it never
 * trips the bullet-count or self-leak invariants. Empty-list output is unchanged.
 */
export const DECISION_DIVERSITY_HINT =
  "When you author an example to pin one of these behaviors, prefer a " +
  "distinctive, non-trivial representative input over the single smallest or " +
  "most obvious case — a varied example pins the behavior just as well.";

export function renderDecisionBlock(decisions: readonly string[]): string {
  const header =
    `The owner has DECIDED the following behaviors. Treat each as fixed intent —\n` +
    `they are not open choices; author examples (choosing your own representative\n` +
    `inputs) that pin exactly these:`;

  if (decisions.length === 0) {
    return header;
  }

  const bullets = decisions.map((d) => `- ${d}`);
  return header + "\n" + bullets.join("\n") + "\n\n" + DECISION_DIVERSITY_HINT;
}

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface OwnerAnswer {
  readonly escalation: string;    // the escalation string VERBATIM (the question)
  readonly requirementId: string; // parsed from the escalation's "<id>: …" prefix; "" if absent
  readonly decision: string;      // owner-authored prose; "" in emitted stub, MUST be filled before phase 3
}

export interface AnswerQueue {
  readonly intent: string;
  readonly context: string | null;
  readonly artifact: string;      // path to the SOURCE decompose artifact this queue answers
  readonly answers: readonly OwnerAnswer[];
}

// ── Queue builder ─────────────────────────────────────────────────────────────

// Warboss id grammar: /^[a-z][a-z0-9-]*$/
// Only matches when the prefix before the first ": " satisfies this grammar.
const ID_GRAMMAR = /^[a-z][a-z0-9-]*$/;

/**
 * Parse the requirementId from an escalation string.
 *
 * Extracts the substring before the FIRST ": " iff that prefix matches the
 * warboss id grammar `/^[a-z][a-z0-9-]*$/`; otherwise returns "".
 *
 * Kills the reading that any text before a colon is an id.
 */
function parseRequirementId(escalation: string): string {
  const sep = escalation.indexOf(": ");
  if (sep === -1) return "";
  const prefix = escalation.slice(0, sep);
  return ID_GRAMMAR.test(prefix) ? prefix : "";
}

/**
 * Build the phase-1 stub queue from a decompose run's escalations.
 *
 * Produces one OwnerAnswer per escalation, in escalation order, with
 * `decision: ""`. `requirementId` is parsed from the escalation prefix.
 */
export function buildAnswerQueue(args: {
  intent: string;
  context: string | null;
  artifactPath: string;
  escalations: readonly string[];
}): AnswerQueue {
  return {
    intent: args.intent,
    context: args.context,
    artifact: args.artifactPath,
    answers: args.escalations.map((esc) => ({
      escalation: esc,
      requirementId: parseRequirementId(esc),
      decision: "",
    })),
  };
}

// ── Queue loader ──────────────────────────────────────────────────────────────

/**
 * Load and validate a hand-filled owner-answer queue (phase 3 input).
 *
 * Throws a descriptive error, BEFORE any model call, if:
 * - The file is unreadable or not valid JSON
 * - `answers` is absent / not an array / empty
 * - Any answer's `decision` is empty or whitespace-only (message names the offending escalation)
 * - Two answers carry the same `escalation` string (duplicate escalation)
 *
 * On success returns the parsed AnswerQueue verbatim.
 */
export async function loadOwnerAnswers(path: string): Promise<AnswerQueue> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    throw new Error(
      `loadOwnerAnswers: cannot read file at "${path}": ${(err as Error).message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `loadOwnerAnswers: invalid JSON in "${path}": ${(err as Error).message}`,
    );
  }

  const obj = parsed as Record<string, unknown>;

  // Validate answers field
  if (!Object.prototype.hasOwnProperty.call(obj, "answers")) {
    throw new Error(
      `loadOwnerAnswers: "answers" field is absent in "${path}"`,
    );
  }
  if (!Array.isArray(obj["answers"])) {
    throw new Error(
      `loadOwnerAnswers: "answers" must be an array in "${path}"`,
    );
  }
  const answers = obj["answers"] as Array<Record<string, unknown>>;
  if (answers.length === 0) {
    throw new Error(
      `loadOwnerAnswers: "answers" array is empty in "${path}" — every escalation must be answered`,
    );
  }

  // Validate each answer
  const seenEscalations = new Set<string>();
  for (const answer of answers) {
    const escalation = answer["escalation"] as string;
    const decision = answer["decision"] as string;

    // Check for blank / whitespace-only decision
    if (typeof decision !== "string" || decision.trim() === "") {
      throw new Error(
        `loadOwnerAnswers: blank or whitespace-only decision for escalation "${escalation}" in "${path}" — fill all decisions before re-authoring`,
      );
    }

    // Check for duplicate escalation strings
    if (seenEscalations.has(escalation)) {
      throw new Error(
        `loadOwnerAnswers: duplicate escalation string "${escalation}" in "${path}"`,
      );
    }
    seenEscalations.add(escalation);
  }

  // Return the parsed AnswerQueue verbatim
  return {
    intent: obj["intent"] as string,
    context: (obj["context"] ?? null) as string | null,
    artifact: obj["artifact"] as string,
    answers: answers.map((a) => ({
      escalation: a["escalation"] as string,
      requirementId: a["requirementId"] as string ?? "",
      decision: a["decision"] as string,
    })),
  };
}
