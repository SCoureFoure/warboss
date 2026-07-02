import { Contract, type ContractCase } from "./contract.ts";
import { Agent } from "./agent.ts";
import { convergenceProbe } from "./gate.ts";

export class DecompositionParseError extends Error {
  constructor(
    message: string,
    public readonly rawOutput1: string,
    public readonly rawOutput2: string,
  ) {
    super(message);
    this.name = "DecompositionParseError";
  }
}

export class RequirementCapExceeded extends Error {
  public costUsd = 0; // stamped by decompose() with the cost spent before the throw
  constructor(
    public readonly count: number,
    public readonly cap: number,
  ) {
    super(`Validation failed: ${count} requirements exceeds maxRequirements (${cap})`);
    this.name = "RequirementCapExceeded";
  }
}

// rev 4: fiat-flagging type
export interface Resolution {
  point: string;    // the behavior the intent leaves open, one sentence
  chosen: string;   // the behavior the examples now pin, one phrase
  basis: "intent" | "fiat"; // intent = forced by the intent text; fiat = warboss's coin flip
}

export interface RequirementDraft {
  id: string;
  requirement: string;
  entry: string;
  signature: string;
  examples: ContractCase[];
  resolutions: Resolution[]; // rev 4: MANDATORY field (may be empty); shape-checked
}

export interface DraftSet {
  requirements: readonly RequirementDraft[];
  contracts: readonly Contract[];
  auditGaps: readonly string[];
  escalations: readonly string[];  // rev 4: Leader-facing kick-back questions
  costUsd: number;
}

export interface DecomposeOptions {
  agent: Agent;
  intent: string;
  context?: string;
  maxRequirements?: number;
  tags?: Record<string, string | number>;
}

// rev 4: judgeAgent DELETED; probe REQUIRED
export interface AdmitOptions {
  probe: {
    agent: Agent;
    probes: ReadonlyMap<string, readonly ContractCase[]>; // requirement id → probe battery
    k?: number;
  };
  tags?: Record<string, string | number>;
}

export interface AdmissionReport {
  admitted: readonly Contract[];
  kickedBack: readonly { contract: Contract; questions: readonly string[] }[];
  costUsd: number;
}

// rev 4: exact string from spec
const DECOMPOSE_SYSTEM =
  "You are a warboss: you convert intent into requirements so decided that the cheapest implementer cannot misread them. State every behavior as a mechanical rule (input → output), never as intent. A rule no example can falsify is forbidden. If a sentence allows two readings, add the example that kills the wrong one. If behavior depends on order or state (sequences, retries, resets), include one example per distinct transition. Where the intent does not decide a behavior and you chose one, you MUST record that choice in the requirement's resolutions array with basis \"fiat\"; record choices the intent itself forces with basis \"intent\". A choice baked into examples without a resolutions entry is a defect. Output ONLY one fenced json block matching the requested schema. Every requirement must include at least one error-behavior example (invalid input → throws). No prose outside the fence.";

// rev 4: exact string from spec
const AUDIT_SYSTEM =
  'You wrote the following contracts. List every behavior a reasonable implementer could interpret in more than one way that the examples do not pin. For each, decide whether the original intent (quoted after the contracts) determines the correct behavior. Output ONLY one fenced json block: an array of {"id": "<requirement id>", "gap": "<one sentence>", "intentDecides": true or false}. Empty array if none.';

// Audit double parse-failure sentinel (spec rev 3, pinned — copied verbatim).
const AUDIT_UNAVAILABLE_SENTINEL =
  "<audit-unavailable>: audit output unparseable after one re-ask";

const SCHEMA_TEXT = `Output a JSON array of requirements. Schema for each item:
{
  "id": "kebab-case-unique-id",
  "requirement": "Self-contained prose requirement",
  "entry": "functionName",
  "signature": "(param: type) => returnType",
  "examples": [
    { "name": "example-name", "input": [...], "expected": <value> },
    { "name": "error-case-name", "input": [...], "expected": "<throws>", "throws": true }
  ],
  "resolutions": [
    { "point": "one sentence describing the open behavior", "chosen": "one phrase describing the pinned behavior", "basis": "intent" or "fiat" }
  ]
}`;

function extractFencedJson(text: string): string | null {
  const fence = /```(?:json)?\s*\n([\s\S]*?)```/.exec(text);
  if (fence?.[1] !== undefined) return fence[1].trim();
  return null;
}

// Intermediate type: after parse (stage 2) but before mechanical validation (stage 3).
// resolutions is unknown here — it is shape-checked in validateDrafts (stage 3),
// NOT in shapeCheckDrafts (stage 2). Per spec, resolutions validation is stage-3
// mechanical validation; a failure there throws directly (no re-ask).
interface ParsedDraft {
  id: string;
  requirement: string;
  entry: string;
  signature: string;
  examples: ContractCase[];
  resolutions: unknown; // validated in stage 3
}

function shapeCheckResolutions(resolutions: unknown, id: string): Resolution[] {
  // rev 4 stage-3: resolutions must be present and an array
  if (!Array.isArray(resolutions)) {
    throw new Error(
      `Validation failed: requirement '${id}' has missing or non-array 'resolutions' field`,
    );
  }
  return resolutions.map((r: unknown, ri: number) => {
    if (typeof r !== "object" || r === null) {
      throw new Error(
        `Validation failed: requirement '${id}', resolutions[${ri}]: not an object`,
      );
    }
    const res = r as Record<string, unknown>;
    if (typeof res["point"] !== "string") {
      throw new Error(
        `Validation failed: requirement '${id}', resolutions[${ri}]: 'point' must be a string`,
      );
    }
    if (typeof res["chosen"] !== "string") {
      throw new Error(
        `Validation failed: requirement '${id}', resolutions[${ri}]: 'chosen' must be a string`,
      );
    }
    if (res["basis"] !== "intent" && res["basis"] !== "fiat") {
      throw new Error(
        `Validation failed: requirement '${id}', resolutions[${ri}]: 'basis' must be exactly "intent" or "fiat", got ${JSON.stringify(res["basis"])}`,
      );
    }
    return {
      point: res["point"] as string,
      chosen: res["chosen"] as string,
      basis: res["basis"] as "intent" | "fiat",
    };
  });
}

function shapeCheckDrafts(parsed: unknown): ParsedDraft[] {
  if (!Array.isArray(parsed)) {
    throw new Error("Expected a JSON array of requirements");
  }
  return parsed.map((item: unknown, idx: number) => {
    if (typeof item !== "object" || item === null) {
      throw new Error(`Item at index ${idx} is not an object`);
    }
    const raw = item as Record<string, unknown>;
    if (typeof raw["id"] !== "string") throw new Error(`Item ${idx}: 'id' must be a string`);
    if (typeof raw["requirement"] !== "string") throw new Error(`Item ${idx}: 'requirement' must be a string`);
    if (typeof raw["entry"] !== "string") throw new Error(`Item ${idx}: 'entry' must be a string`);
    if (typeof raw["signature"] !== "string") throw new Error(`Item ${idx}: 'signature' must be a string`);
    if (!Array.isArray(raw["examples"])) throw new Error(`Item ${idx}: 'examples' must be an array`);

    const examples: ContractCase[] = (raw["examples"] as unknown[]).map((ex: unknown, ei: number) => {
      if (typeof ex !== "object" || ex === null) {
        throw new Error(`Item ${idx}, example ${ei}: not an object`);
      }
      const e = ex as Record<string, unknown>;
      if (!Array.isArray(e["input"])) throw new Error(`Item ${idx}, example ${ei}: 'input' must be an array`);
      return {
        ...(typeof e["name"] === "string" ? { name: e["name"] } : {}),
        input: e["input"] as unknown[],
        expected: e["expected"],
        ...(e["throws"] === true ? { throws: true as const } : {}),
      };
    });

    // resolutions: pass through as unknown — shape-checked in validateDrafts (stage 3)
    return {
      id: raw["id"] as string,
      requirement: raw["requirement"] as string,
      entry: raw["entry"] as string,
      signature: raw["signature"] as string,
      examples,
      resolutions: raw["resolutions"],
    };
  });
}

function parseWithReask(
  text: string,
): { drafts: ParsedDraft[]; error?: undefined } | { drafts?: undefined; error: string } {
  const jsonStr = extractFencedJson(text);
  if (jsonStr === null) {
    return { error: "No fenced JSON block found in response" };
  }
  try {
    const parsed = JSON.parse(jsonStr);
    const drafts = shapeCheckDrafts(parsed);
    return { drafts };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// Stage 3 mechanical validation: validates all fields including resolutions (rev 4),
// returns fully-typed RequirementDraft[] (resolutions shape-checked here, not in stage 2).
function validateDrafts(parsedDrafts: ParsedDraft[], maxRequirements: number): RequirementDraft[] {
  if (parsedDrafts.length === 0) {
    throw new Error("Validation failed: requirements array is empty");
  }
  if (parsedDrafts.length > maxRequirements) {
    throw new RequirementCapExceeded(parsedDrafts.length, maxRequirements);
  }

  const idSet = new Set<string>();
  const validated: RequirementDraft[] = [];

  for (const draft of parsedDrafts) {
    if (idSet.has(draft.id)) {
      throw new Error(`Validation failed: duplicate id '${draft.id}'`);
    }
    idSet.add(draft.id);

    if (!/^[a-z][a-z0-9-]*$/.test(draft.id)) {
      throw new Error(
        `Validation failed: id '${draft.id}' is not kebab-case (must match /^[a-z][a-z0-9-]*$/)`,
      );
    }

    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(draft.entry)) {
      throw new Error(
        `Validation failed: entry '${draft.entry}' in requirement '${draft.id}' is not a valid JS identifier`,
      );
    }

    if (draft.examples.length < 2) {
      throw new Error(
        `Validation failed: requirement '${draft.id}' has fewer than 2 examples (${draft.examples.length})`,
      );
    }

    const hasThrows = draft.examples.some((ex) => ex.throws === true);
    if (!hasThrows) {
      throw new Error(
        `Validation failed: requirement '${draft.id}' has no error-behavior example (throws: true is mandatory)`,
      );
    }

    const nameSet = new Set<string>();
    for (const ex of draft.examples) {
      if (ex.name !== undefined) {
        if (nameSet.has(ex.name)) {
          throw new Error(
            `Validation failed: duplicate example name '${ex.name}' in requirement '${draft.id}'`,
          );
        }
        nameSet.add(ex.name);
      }
    }

    // rev 4 stage-3: resolutions field is mandatory and shape-checked here (not in parse stage)
    const resolutions = shapeCheckResolutions(draft.resolutions, draft.id);

    validated.push({
      id: draft.id,
      requirement: draft.requirement,
      entry: draft.entry,
      signature: draft.signature,
      examples: draft.examples,
      resolutions,
    });
  }

  return validated;
}

async function callDecompose(
  agent: Agent,
  userPrompt: string,
  tags: Record<string, string | number> | undefined,
): Promise<{ text: string; costUsd: number }> {
  const result = await agent.generate({
    prompt: userPrompt,
    system: DECOMPOSE_SYSTEM,
    maxTokens: 8192,
    kind: "warboss.decompose",
    ...(tags !== undefined ? { tags } : {}),
  });
  return { text: result.text, costUsd: result.costUsd };
}

async function callAudit(
  agent: Agent,
  drafts: RequirementDraft[],
  intent: string,
  tags: Record<string, string | number> | undefined,
): Promise<{ text: string; costUsd: number }> {
  // rev 4: user prompt carries drafts JSON then the exact line `Original intent:` + intent text
  const userPrompt = `${JSON.stringify(drafts)}\n\nOriginal intent:\n${intent}`;
  const result = await agent.generate({
    prompt: userPrompt,
    system: AUDIT_SYSTEM,
    maxTokens: 8192,
    kind: "warboss.audit",
    ...(tags !== undefined ? { tags } : {}),
  });
  return { text: result.text, costUsd: result.costUsd };
}

async function callAmend(
  agent: Agent,
  drafts: RequirementDraft[],
  gaps: Array<{ id: string; gap: string }>,
  tags: Record<string, string | number> | undefined,
): Promise<{ text: string; costUsd: number }> {
  // AC14, capture-asserted: only amendable (intentDecides: true) gaps are passed here
  const userPrompt =
    `Here are the requirement drafts:\n${JSON.stringify(drafts)}\n\nHere are the audit gaps:\n${JSON.stringify(gaps)}\n\nAdd examples to the requirements that pin each gap. Every example you add MUST have a name new to that requirement. Output ONLY one fenced json block: {"requirements": <the full amended RequirementDraft[] array in the same schema>, "pinned": [{"id": "<requirement id>", "gap": "<the gap sentence verbatim>", "examples": ["<name of each new example that pins it>"]}]}`;
  const result = await agent.generate({
    prompt: userPrompt,
    system: DECOMPOSE_SYSTEM,
    maxTokens: 8192,
    kind: "warboss.amend",
    ...(tags !== undefined ? { tags } : {}),
  });
  return { text: result.text, costUsd: result.costUsd };
}

interface RawGapEntry {
  id: string;
  gap: string;
  intentDecides: boolean;
}

// rev 5: mechanical amend-verification mapping (replaces the example-count proxy)
interface PinnedEntry {
  id: string;
  gap: string;
  examples: string[];
}

// Drops malformed entries (not an object, or missing string id/gap or a
// non-empty string[] examples). Missing/non-array input → empty list.
function shapeCheckPinned(pinned: unknown): PinnedEntry[] {
  if (!Array.isArray(pinned)) return [];
  const out: PinnedEntry[] = [];
  for (const item of pinned) {
    if (typeof item !== "object" || item === null) continue;
    const p = item as Record<string, unknown>;
    if (typeof p["id"] !== "string") continue;
    if (typeof p["gap"] !== "string") continue;
    if (!Array.isArray(p["examples"]) || p["examples"].length === 0) continue;
    if (!(p["examples"] as unknown[]).every((e) => typeof e === "string")) continue;
    out.push({ id: p["id"], gap: p["gap"], examples: p["examples"] as string[] });
  }
  return out;
}

function parseAuditGaps(text: string): Array<RawGapEntry> | null {
  const jsonStr = extractFencedJson(text);
  if (jsonStr === null) return null;
  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return null;
    // Drop entries missing string id or gap (rev 3 filtering, unchanged)
    // intentDecides fail-closed: non-boolean → false (rev 4)
    return parsed
      .filter(
        (item: unknown): item is Record<string, unknown> =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as Record<string, unknown>)["id"] === "string" &&
          typeof (item as Record<string, unknown>)["gap"] === "string",
      )
      .map((item: Record<string, unknown>) => ({
        id: item["id"] as string,
        gap: item["gap"] as string,
        // fail-closed: non-boolean → false → escalate
        intentDecides: item["intentDecides"] === true,
      }));
  } catch {
    return null;
  }
}

export async function decompose(opts: DecomposeOptions): Promise<DraftSet> {
  const maxRequirements = opts.maxRequirements ?? 8;
  let totalCost = 0;

  try {
    // rev 4: requirement-count cap line injected into the user prompt (exact line from spec)
    const capLine = `At most ${maxRequirements} requirement(s). If the intent needs more, it must be decomposed further UP the chain — do not exceed the cap.`;

    let userPrompt = opts.intent;
    if (opts.context) {
      userPrompt += "\n\n" + opts.context;
    }
    userPrompt += "\n\n" + capLine;
    userPrompt += "\n\n" + SCHEMA_TEXT;

    // Stage 1 — Call 1: decompose
    const call1 = await callDecompose(opts.agent, userPrompt, opts.tags);
    totalCost += call1.costUsd;

    // Stage 2 — Parse with one re-ask
    const parse1 = parseWithReask(call1.text);
    let parsedDrafts: ParsedDraft[];

    if (parse1.error !== undefined) {
      const reaskPrompt =
        `${userPrompt}\n\nPrevious output (truncated):\n${call1.text.slice(0, 2000)}\n\nError: ${parse1.error}\n\nPlease output ONLY one fenced json block.`;
      const call2 = await callDecompose(opts.agent, reaskPrompt, opts.tags);
      totalCost += call2.costUsd;

      const parse2 = parseWithReask(call2.text);
      if (parse2.error !== undefined) {
        throw new DecompositionParseError(
          `Failed to parse decomposition after re-ask: ${parse2.error}`,
          call1.text,
          call2.text,
        );
      }
      parsedDrafts = parse2.drafts;
    } else {
      parsedDrafts = parse1.drafts;
    }

    // Stage 3 — Mechanical validation (includes resolutions shape check, rev 4)
    let drafts: RequirementDraft[] = validateDrafts(parsedDrafts, maxRequirements);

    let auditGaps: readonly string[] = [];
    let escalations: readonly string[] = [];

    // Stage 4 — Call 2: self-audit
    const auditCall1 = await callAudit(opts.agent, drafts, opts.intent, opts.tags);
    totalCost += auditCall1.costUsd;

    let gaps = parseAuditGaps(auditCall1.text);
    if (gaps === null) {
      const reaskAuditPrompt =
        `${JSON.stringify(drafts)}\n\nOriginal intent:\n${opts.intent}\n\nPrevious output (truncated):\n${auditCall1.text.slice(0, 2000)}\n\nPlease output ONLY one fenced json block of gaps.`;
      const auditCall2 = await opts.agent.generate({
        prompt: reaskAuditPrompt,
        system: AUDIT_SYSTEM,
        maxTokens: 8192,
        kind: "warboss.audit",
        ...(opts.tags !== undefined ? { tags: opts.tags } : {}),
      });
      totalCost += auditCall2.costUsd;
      gaps = parseAuditGaps(auditCall2.text);
      if (gaps === null) {
        // Audit double parse-failure (rev 3, pinned): do NOT throw, do NOT
        // treat as "no gaps" — surface the sentinel as the sole auditGaps
        // entry; gaps unknown → stage 5 (amend) is skipped; contracts are
        // still frozen from the validated drafts.
        gaps = [];
        auditGaps = [AUDIT_UNAVAILABLE_SENTINEL];
      }
    }

    // Stage 5 — Call 3: amend (only if amendable gaps != [])
    // rev 4: Gap routing — partition by intentDecides
    if (gaps.length > 0) {
      const amendableGaps = gaps.filter((g) => g.intentDecides === true);
      const undecidedGaps = gaps.filter((g) => g.intentDecides === false);

      // intent-undecided gaps → escalations (NEVER amended)
      const undecidedEscalations = undecidedGaps.map(
        (g) => `${g.id}: intent-undecided — ${g.gap}`,
      );

      let remainingAuditGaps: string[] = [];

      if (amendableGaps.length > 0) {
        // Record pre-amend example NAMES per id (named examples only) — a gap is only
        // addressed by a genuinely new name, never by an unrelated example count bump.
        const preAmendNames = new Map<string, Set<string>>(
          drafts.map((d) => [
            d.id,
            new Set(d.examples.map((ex) => ex.name).filter((n): n is string => n !== undefined)),
          ]),
        );

        // Amend-prompt purity (AC14, capture-asserted): only amendable gaps passed
        const amendCall = await callAmend(opts.agent, drafts, amendableGaps, opts.tags);
        totalCost += amendCall.costUsd;

        const jsonStr = extractFencedJson(amendCall.text);
        let amendedItems: ParsedDraft[] | undefined;
        let pinned: PinnedEntry[] = [];
        let amendFailed = jsonStr === null;

        if (!amendFailed) {
          try {
            const parsedAmend: unknown = JSON.parse(jsonStr as string);
            if (Array.isArray(parsedAmend)) {
              // Old shape (bare RequirementDraft[]) — no pinned mapping possible,
              // fail-closed back-compat: every amendable gap gets no credit.
              amendedItems = shapeCheckDrafts(parsedAmend);
              pinned = [];
            } else if (
              typeof parsedAmend === "object" &&
              parsedAmend !== null &&
              Array.isArray((parsedAmend as Record<string, unknown>)["requirements"])
            ) {
              const obj = parsedAmend as Record<string, unknown>;
              amendedItems = shapeCheckDrafts(obj["requirements"]);
              pinned = shapeCheckPinned(obj["pinned"]);
            } else {
              amendFailed = true;
            }
          } catch {
            amendFailed = true;
          }
        }

        if (amendFailed || amendedItems === undefined) {
          // Amend unparseable/malformed — carry all amendable gaps forward, keep original drafts
          remainingAuditGaps = amendableGaps.map((g) => `${g.id}: ${g.gap}`);
        } else {
          // Mechanical validation throw still propagates (pinned by the error-example-mandate test)
          drafts = validateDrafts(amendedItems, maxRequirements);

          const unaddressed = amendableGaps.filter((gap) => {
            const p = pinned.find((pe) => pe.id === gap.id && pe.gap === gap.gap);
            if (!p) return true;
            const req = drafts.find((d) => d.id === gap.id);
            if (!req) return true;
            const preNames = preAmendNames.get(gap.id) ?? new Set<string>();
            const addressed = p.examples.some(
              (name) => req.examples.some((ex) => ex.name === name) && !preNames.has(name),
            );
            return !addressed;
          });
          remainingAuditGaps = unaddressed.map((g) => `${g.id}: ${g.gap}`);
        }
      }

      auditGaps = remainingAuditGaps;
      // undecidedEscalations collected here; fiat escalations added below after freeze
      escalations = undecidedEscalations;
    }

    // Stage 6 — Freeze
    // resolutions is draft metadata — NOT part of Contract.freeze canonical form
    const contracts = drafts.map((draft) =>
      Contract.freeze({
        requirement: draft.requirement,
        entry: draft.entry,
        version: "1",
        examples: draft.examples,
      }),
    );

    // rev 4: Escalations — fiat resolutions → escalations (fiat first, requirement order, then array order)
    // Then intent-undecided entries (already in escalations from above)
    const fiatEscalations: string[] = [];
    for (const draft of drafts) {
      for (const res of draft.resolutions) {
        if (res.basis === "fiat") {
          fiatEscalations.push(`${draft.id}: fiat — ${res.point} → ${res.chosen}`);
        }
      }
    }

    // Ordering: fiat entries first (requirement order, then array order within requirement),
    // then intent-undecided entries in audit-output order
    escalations = [...fiatEscalations, ...escalations];

    return {
      requirements: drafts,
      contracts,
      auditGaps,
      escalations,
      costUsd: totalCost,
    };
  } catch (e) {
    if (e instanceof RequirementCapExceeded) e.costUsd = totalCost;
    throw e;
  }
}

// rev 6: exact strings from spec — partition prompt for recursive decomposition
const PARTITION_SYSTEM =
  "You are a warboss splitting an intent that is too large for one decomposition. Split it into self-contained sub-intents. Each sub-intent must be implementable without reading the others; every shared seam — function signatures, data shapes, formats the sub-intents must agree on — must be stated verbatim in the seam field of every sub-intent it touches. Output ONLY one fenced json block matching the requested schema. No prose outside the fence.";

const PARTITION_SCHEMA_TEXT = `Output a JSON array of sub-intents. Schema for each item:
{
  "id": "kebab-case-unique-id",
  "intent": "Self-contained prose intent",
  "seam": "Shared signatures/shapes this sub-intent must honor (empty string if none)"
}`;

export interface DecomposeRecursiveOptions extends DecomposeOptions {
  /** Recursion depth budget. 0 = plain decompose (cap error propagates). Default 2. */
  maxDepth?: number;
}

interface SubIntent {
  id: string;
  intent: string;
  seam: string;
}

function shapeCheckSubIntents(parsed: unknown): SubIntent[] {
  if (!Array.isArray(parsed)) {
    throw new Error("Expected a JSON array of sub-intents");
  }
  const idSet = new Set<string>();
  return parsed.map((item: unknown, idx: number) => {
    if (typeof item !== "object" || item === null) {
      throw new Error(`Item at index ${idx} is not an object`);
    }
    const raw = item as Record<string, unknown>;
    if (typeof raw["id"] !== "string" || !/^[a-z][a-z0-9-]*$/.test(raw["id"])) {
      throw new Error(
        `Item ${idx}: 'id' must be a kebab-case string (must match /^[a-z][a-z0-9-]*$/)`,
      );
    }
    const id = raw["id"] as string;
    if (idSet.has(id)) {
      throw new Error(`Item ${idx}: duplicate sub-intent id '${id}'`);
    }
    idSet.add(id);
    if (typeof raw["intent"] !== "string" || raw["intent"].length === 0) {
      throw new Error(`Item ${idx}: 'intent' must be a non-empty string`);
    }
    if (typeof raw["seam"] !== "string") {
      throw new Error(`Item ${idx}: 'seam' must be a string`);
    }
    return { id, intent: raw["intent"] as string, seam: raw["seam"] as string };
  });
}

function parsePartitionWithReask(
  text: string,
): { subIntents: SubIntent[]; error?: undefined } | { subIntents?: undefined; error: string } {
  const jsonStr = extractFencedJson(text);
  if (jsonStr === null) {
    return { error: "No fenced JSON block found in response" };
  }
  try {
    const parsed = JSON.parse(jsonStr);
    const subIntents = shapeCheckSubIntents(parsed);
    return { subIntents };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// Both non-empty → joined with a blank line; only one non-empty → that one;
// both empty/absent → undefined (conditional spread omits `context` entirely).
function joinContext(context: string | undefined, seam: string): string | undefined {
  if (context && seam) return context + "\n\n" + seam;
  if (context) return context;
  if (seam) return seam;
  return undefined;
}

/**
 * Wraps decompose() with recursive partitioning: when the intent overflows
 * maxRequirements, split it into self-contained sub-intents and decompose
 * each one (recursively), merging the results. Cap errors below zero
 * remaining depth propagate unchanged.
 */
export async function decomposeRecursive(opts: DecomposeRecursiveOptions): Promise<DraftSet> {
  const { maxDepth, ...decomposeOpts } = opts;

  try {
    return await decompose(decomposeOpts);
  } catch (e) {
    if (!(e instanceof RequirementCapExceeded)) throw e;

    const depth = maxDepth ?? 2;
    if (depth <= 0) throw e;

    let totalCost = e.costUsd;
    const maxRequirements = opts.maxRequirements ?? 8;

    let userPrompt = opts.intent;
    if (opts.context) {
      userPrompt += "\n\n" + opts.context;
    }
    userPrompt += "\n\n" + `Split into at most ${maxRequirements} sub-intent(s).`;
    userPrompt += "\n\n" + PARTITION_SCHEMA_TEXT;

    const call1 = await opts.agent.generate({
      prompt: userPrompt,
      system: PARTITION_SYSTEM,
      maxTokens: 8192,
      kind: "warboss.partition",
      ...(opts.tags !== undefined ? { tags: opts.tags } : {}),
    });
    totalCost += call1.costUsd;

    const parse1 = parsePartitionWithReask(call1.text);
    let subIntents: SubIntent[];

    if (parse1.error !== undefined) {
      const reaskPrompt =
        `${userPrompt}\n\nPrevious output (truncated):\n${call1.text.slice(0, 2000)}\n\nError: ${parse1.error}\n\nPlease output ONLY one fenced json block.`;
      const call2 = await opts.agent.generate({
        prompt: reaskPrompt,
        system: PARTITION_SYSTEM,
        maxTokens: 8192,
        kind: "warboss.partition",
        ...(opts.tags !== undefined ? { tags: opts.tags } : {}),
      });
      totalCost += call2.costUsd;

      const parse2 = parsePartitionWithReask(call2.text);
      if (parse2.error !== undefined) {
        throw new DecompositionParseError(
          `Failed to parse partition after re-ask: ${parse2.error}`,
          call1.text,
          call2.text,
        );
      }
      subIntents = parse2.subIntents;
    } else {
      subIntents = parse1.subIntents;
    }

    if (subIntents.length < 2 || subIntents.length > maxRequirements) {
      throw new Error(
        `Partition failed: expected 2..${maxRequirements} sub-intents, got ${subIntents.length}`,
      );
    }

    let requirements: RequirementDraft[] = [];
    let contracts: Contract[] = [];
    let auditGaps: string[] = [];
    let escalations: string[] = [];
    const seenIds = new Set<string>();

    for (const sub of subIntents) {
      const childContext = joinContext(opts.context, sub.seam);

      const child = await decomposeRecursive({
        ...opts,
        intent: sub.intent,
        ...(childContext !== undefined ? { context: childContext } : {}),
        maxDepth: depth - 1,
      });

      for (const req of child.requirements) {
        if (seenIds.has(req.id)) {
          throw new Error(
            `Validation failed: duplicate requirement id '${req.id}' across sub-intents`,
          );
        }
        seenIds.add(req.id);
      }

      requirements = requirements.concat(child.requirements);
      contracts = contracts.concat(child.contracts);
      auditGaps = auditGaps.concat(child.auditGaps);
      escalations = escalations.concat(child.escalations);
      totalCost += child.costUsd;
    }

    return {
      requirements,
      contracts,
      auditGaps,
      escalations,
      costUsd: totalCost,
    };
  }
}

function buildAdmitPrompt(contract: Contract): string {
  const lines = contract.examples.map((ex) => {
    const args = (ex.input as unknown[]).map((a) => JSON.stringify(a)).join(", ");
    const rhs = ex.throws ? '"<throws>"' : JSON.stringify(ex.expected);
    return `${contract.entry}(${args}) === ${rhs}`;
  });
  return `${contract.requirement}\n\nFrozen contract (hash ${contract.hash}):\n${lines.join("\n")}`;
}

export async function admit(draft: DraftSet, opts: AdmitOptions): Promise<AdmissionReport> {
  const admitted: Contract[] = [];
  const kickedBack: { contract: Contract; questions: readonly string[] }[] = [];
  let totalCost = 0;

  for (const contract of draft.contracts) {
    const prompt = buildAdmitPrompt(contract);

    // rev 4: probe-only admission; gruntJudge is gone from this path
    // Find the requirement id for this contract by re-freezing to match hash
    const req = draft.requirements.find((r) => {
      const frozen = Contract.freeze({
        requirement: r.requirement,
        entry: r.entry,
        version: "1",
        examples: r.examples,
      });
      return frozen.hash === contract.hash;
    });

    const reqId = req?.id;
    const probeArr = reqId !== undefined ? opts.probe.probes.get(reqId) : undefined;

    if (probeArr === undefined) {
      // no probe battery for this id → kicked back, fail-closed (rev 4, exact string from spec)
      kickedBack.push({
        contract,
        questions: [
          `no probe battery supplied for '${reqId ?? contract.hash}' — admission is probe-only and fails closed`,
        ],
      });
      continue;
    }

    // Probe battery present → run convergenceProbe
    const probeVerdict = await convergenceProbe({
      agent: opts.probe.agent,
      contract,
      prompt,
      probes: probeArr as ContractCase[],
      ...(opts.probe.k !== undefined ? { k: opts.probe.k } : {}),
      ...(opts.tags !== undefined ? { tags: opts.tags } : {}),
    });
    totalCost += probeVerdict.costUsd;

    if (!probeVerdict.ready) {
      const probeQuestions = probeVerdict.disagreements.map((d) => {
        const splitJson = JSON.stringify(d.split);
        return `probe disagreement on ${d.name ?? `probe ${d.probeIndex}`}: survivors split ${splitJson}`;
      });
      kickedBack.push({ contract, questions: probeQuestions });
      continue;
    }

    admitted.push(contract);
  }

  return { admitted, kickedBack, costUsd: totalCost };
}
