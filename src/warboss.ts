import { Contract, type ContractCase } from "./contract.ts";
import { Agent } from "./agent.ts";
import { gruntJudge, convergenceProbe } from "./gate.ts";

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

export interface RequirementDraft {
  id: string;
  requirement: string;
  entry: string;
  signature: string;
  examples: ContractCase[];
}

export interface DraftSet {
  requirements: readonly RequirementDraft[];
  contracts: readonly Contract[];
  auditGaps: readonly string[];
  costUsd: number;
}

export interface DecomposeOptions {
  agent: Agent;
  intent: string;
  context?: string;
  maxRequirements?: number;
  tags?: Record<string, string | number>;
}

export interface AdmitOptions {
  judgeAgent: Agent;
  probe?: {
    agent: Agent;
    probes: ReadonlyMap<string, readonly ContractCase[]>;
    k?: number;
  };
  tags?: Record<string, string | number>;
}

export interface AdmissionReport {
  admitted: readonly Contract[];
  kickedBack: readonly { contract: Contract; questions: readonly string[] }[];
  costUsd: number;
}

const DECOMPOSE_SYSTEM =
  "You are a warboss: you convert intent into requirements so decided that the cheapest implementer cannot misread them. Output ONLY one fenced json block matching the requested schema. Every requirement must include at least one error-behavior example (invalid input → throws). No prose outside the fence.";

const AUDIT_SYSTEM =
  'You wrote the following contracts. List every behavior a reasonable implementer could interpret in more than one way that the examples do not pin. Output ONLY one fenced json block: an array of {"id": "<requirement id>", "gap": "<one sentence>"}. Empty array if none.';

const SCHEMA_TEXT = `Output a JSON array of requirements. Schema for each item:
{
  "id": "kebab-case-unique-id",
  "requirement": "Self-contained prose requirement",
  "entry": "functionName",
  "signature": "(param: type) => returnType",
  "examples": [
    { "name": "example-name", "input": [...], "expected": <value> },
    { "name": "error-case-name", "input": [...], "expected": "<throws>", "throws": true }
  ]
}`;

function extractFencedJson(text: string): string | null {
  const fence = /```(?:json)?\s*\n([\s\S]*?)```/.exec(text);
  if (fence?.[1] !== undefined) return fence[1].trim();
  return null;
}

interface RawDraft {
  id: unknown;
  requirement: unknown;
  entry: unknown;
  signature: unknown;
  examples: unknown;
}

function shapeCheckDrafts(parsed: unknown): RequirementDraft[] {
  if (!Array.isArray(parsed)) {
    throw new Error("Expected a JSON array of requirements");
  }
  return parsed.map((item: unknown, idx: number) => {
    if (typeof item !== "object" || item === null) {
      throw new Error(`Item at index ${idx} is not an object`);
    }
    const raw = item as RawDraft;
    if (typeof raw.id !== "string") throw new Error(`Item ${idx}: 'id' must be a string`);
    if (typeof raw.requirement !== "string") throw new Error(`Item ${idx}: 'requirement' must be a string`);
    if (typeof raw.entry !== "string") throw new Error(`Item ${idx}: 'entry' must be a string`);
    if (typeof raw.signature !== "string") throw new Error(`Item ${idx}: 'signature' must be a string`);
    if (!Array.isArray(raw.examples)) throw new Error(`Item ${idx}: 'examples' must be an array`);

    const examples: ContractCase[] = raw.examples.map((ex: unknown, ei: number) => {
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

    return {
      id: raw.id,
      requirement: raw.requirement,
      entry: raw.entry,
      signature: raw.signature,
      examples,
    };
  });
}

function parseWithReask(
  text: string,
): { drafts: RequirementDraft[]; error?: undefined } | { drafts?: undefined; error: string } {
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

function validateDrafts(drafts: RequirementDraft[], maxRequirements: number): void {
  if (drafts.length === 0) {
    throw new Error("Validation failed: requirements array is empty");
  }
  if (drafts.length > maxRequirements) {
    throw new Error(
      `Validation failed: ${drafts.length} requirements exceeds maxRequirements (${maxRequirements})`,
    );
  }

  const idSet = new Set<string>();
  for (const draft of drafts) {
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
  }
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
  tags: Record<string, string | number> | undefined,
): Promise<{ text: string; costUsd: number }> {
  const result = await agent.generate({
    prompt: JSON.stringify(drafts),
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
  const userPrompt =
    `Here are the requirement drafts:\n${JSON.stringify(drafts)}\n\nHere are the audit gaps:\n${JSON.stringify(gaps)}\n\nAdd examples to the requirements that pin each gap. Output the full amended RequirementDraft[] array in the same JSON schema.`;
  const result = await agent.generate({
    prompt: userPrompt,
    system: DECOMPOSE_SYSTEM,
    maxTokens: 8192,
    kind: "warboss.amend",
    ...(tags !== undefined ? { tags } : {}),
  });
  return { text: result.text, costUsd: result.costUsd };
}

function parseAuditGaps(text: string): Array<{ id: string; gap: string }> | null {
  const jsonStr = extractFencedJson(text);
  if (jsonStr === null) return null;
  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (item: unknown): item is { id: string; gap: string } =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>)["id"] === "string" &&
        typeof (item as Record<string, unknown>)["gap"] === "string",
    );
  } catch {
    return null;
  }
}

export async function decompose(opts: DecomposeOptions): Promise<DraftSet> {
  const maxRequirements = opts.maxRequirements ?? 8;
  let totalCost = 0;

  let userPrompt = opts.intent;
  if (opts.context) {
    userPrompt += "\n\n" + opts.context;
  }
  userPrompt += "\n\n" + SCHEMA_TEXT;

  // Stage 1 — Call 1: decompose
  const call1 = await callDecompose(opts.agent, userPrompt, opts.tags);
  totalCost += call1.costUsd;

  // Stage 2 — Parse with one re-ask
  const parse1 = parseWithReask(call1.text);
  let drafts: RequirementDraft[];

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
    drafts = parse2.drafts;
  } else {
    drafts = parse1.drafts;
  }

  // Stage 3 — Mechanical validation
  validateDrafts(drafts, maxRequirements);

  // Stage 4 — Call 2: self-audit
  const auditCall1 = await callAudit(opts.agent, drafts, opts.tags);
  totalCost += auditCall1.costUsd;

  let gaps = parseAuditGaps(auditCall1.text);
  if (gaps === null) {
    const reaskAuditPrompt =
      `${JSON.stringify(drafts)}\n\nPrevious output (truncated):\n${auditCall1.text.slice(0, 2000)}\n\nPlease output ONLY one fenced json block of gaps.`;
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
      gaps = [];
    }
  }

  let auditGaps: readonly string[] = [];

  // Stage 5 — Call 3: amend (only if gaps != [])
  if (gaps.length > 0) {
    // Record pre-amend example counts per id to detect whether amend addressed each gap
    const preAmendCounts = new Map<string, number>(
      drafts.map((d) => [d.id, d.examples.length]),
    );

    const amendCall = await callAmend(opts.agent, drafts, gaps, opts.tags);
    totalCost += amendCall.costUsd;

    const amendedParse = parseWithReask(amendCall.text);
    if (amendedParse.error === undefined) {
      validateDrafts(amendedParse.drafts, maxRequirements);
      drafts = amendedParse.drafts;
      // A gap is considered unaddressed if the requirement's example count did not increase
      const remainingGaps = gaps.filter((gap) => {
        const req = drafts.find((d) => d.id === gap.id);
        if (!req) return true;
        return req.examples.length <= (preAmendCounts.get(gap.id) ?? 0);
      });
      auditGaps = remainingGaps.map((g) => `${g.id}: ${g.gap}`);
    } else {
      // Amend parse failed — carry all gaps forward, keep original drafts
      auditGaps = gaps.map((g) => `${g.id}: ${g.gap}`);
    }
  }

  // Stage 6 — Freeze
  const contracts = drafts.map((draft) =>
    Contract.freeze({
      requirement: draft.requirement,
      entry: draft.entry,
      version: "1",
      examples: draft.examples,
    }),
  );

  return {
    requirements: drafts,
    contracts,
    auditGaps,
    costUsd: totalCost,
  };
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
    const verdict = await gruntJudge({
      agent: opts.judgeAgent,
      prompt,
      kind: "gate.judge",
      ...(opts.tags !== undefined ? { tags: opts.tags } : {}),
    });
    totalCost += verdict.costUsd;

    if (!verdict.ready) {
      kickedBack.push({ contract, questions: verdict.questions });
      continue;
    }

    if (opts.probe) {
      const req = draft.requirements.find((r) => {
        const frozen = Contract.freeze({
          requirement: r.requirement,
          entry: r.entry,
          version: "1",
          examples: r.examples,
        });
        return frozen.hash === contract.hash;
      });

      const probeArr = req ? opts.probe.probes.get(req.id) : undefined;

      if (probeArr !== undefined) {
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
      }
    }

    admitted.push(contract);
  }

  return { admitted, kickedBack, costUsd: totalCost };
}
