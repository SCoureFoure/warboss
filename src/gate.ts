/**
 * Gate instruments: two readiness probes that gate work before it enters
 * the experiment loop.
 *
 *   gruntJudge     — cheap, one LOW-tier call; judges whether a prompt is
 *                    fully decided (zero interpretation latitude left).
 *   convergenceProbe — expensive, K independent generations + convergence
 *                    check; measures whether a contract is satisfiable and
 *                    whether survivors agree on probe cases.
 */

import { Agent, extractCode } from "./agent.ts";
import { Contract, type ContractCase } from "./contract.ts";
import { judge, ContractHashMismatch } from "./runner.ts";

// ── Types ────────────────────────────────────────────────────────────────────

export interface GruntJudgeOptions {
  agent: Agent;
  prompt: string;
  kind?: string;
  tags?: Record<string, string | number>;
}

export interface GruntJudgeVerdict {
  ready: boolean;
  questions: readonly string[];
  malformed: boolean;
  raw: string;
  costUsd: number;
}

export interface DeriveCheckOptions {
  agent: Agent; // the tier that would DO the work (LOW by policy)
  prompt: string; // the EXACT dispatch environment, verbatim
  kind?: string; // ledger kind, default "gate.derive"
  tags?: Record<string, string | number>;
}

export interface DeriveCheckVerdict {
  ready: boolean; // true iff first line is exactly DECIDED
  undecided: readonly string[]; // enumerated underivable inputs, empty when ready
  malformed: boolean; // true → ready forced false (fail closed)
  raw: string;
  costUsd: number;
}

export interface ProbeOptions {
  agent: Agent;
  contract: Contract;
  prompt: string;
  probes: readonly ContractCase[];
  k?: number;
  system?: string;
  maxTokens?: number;
  kind?: string;
  tags?: Record<string, string | number>;
}

export interface ProbeVerdict {
  ready: boolean;
  k: number;
  survivors: number;
  survivorRate: number;
  /** Largest probe-vector cluster / survivors; 0 when no survivors. */
  modalShare: number;
  disagreements: readonly {
    probeIndex: number;
    name?: string;
    split: Record<string, number>;
  }[];
  costUsd: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const JUDGE_SYSTEM =
  "You are the implementer who will receive this task. Judge ONLY whether the task is fully decided — zero interpretation latitude left. First line of your reply: exactly READY or NOT READY. If NOT READY, list every undecided question as a \"- \" bullet, one per line, nothing else.";

const DERIVE_SYSTEM =
  "You are the implementer who will receive this task. Do NOT rate your confidence. Mechanically enumerate the concrete inputs whose exact required output you cannot derive from the task text alone. First line of your reply: exactly DECIDED if you can derive the output for every input, or exactly UNDECIDED otherwise. If UNDECIDED, list each underivable input as a \"- \" bullet — the concrete input value followed by the one behavior the task leaves open — one per line, nothing else.";

const PROBE_DEFAULT_SYSTEM =
  "Implement the requested function in JavaScript. Output ONLY one fenced code block. No prose.";

const MAX_API_ATTEMPTS = 3;
const PROBE_CONCURRENCY = 4;

// ── gruntJudge ───────────────────────────────────────────────────────────────

/**
 * One LOW-tier call that judges whether a prompt is fully decided.
 * Fail-closed: malformed is never a green light.
 */
export async function gruntJudge(
  opts: GruntJudgeOptions,
): Promise<GruntJudgeVerdict> {
  const kind = opts.kind ?? "gate.judge";

  // Attempt up to MAX_API_ATTEMPTS (3 total).
  let raw = "";
  let costUsd = 0;

  for (let attempt = 0; attempt < MAX_API_ATTEMPTS; attempt++) {
    try {
      const result = await opts.agent.generate({
        system: JUDGE_SYSTEM,
        prompt: opts.prompt,
        maxTokens: 1024,
        kind,
        ...(opts.tags ? { tags: opts.tags } : {}),
      });
      raw = result.text;
      costUsd = result.costUsd;
      break; // success
    } catch {
      if (attempt === MAX_API_ATTEMPTS - 1) {
        // All attempts exhausted — treat as malformed, costUsd: 0
        return { ready: false, questions: [], malformed: true, raw: "", costUsd: 0 };
      }
      // else: retry
    }
  }

  return parseJudgeResponse(raw, costUsd);
}

function parseJudgeResponse(raw: string, costUsd: number): GruntJudgeVerdict {
  // Find first non-empty trimmed line.
  const lines = raw.split("\n");
  const firstLine = lines.find((l) => l.trim().length > 0)?.trim() ?? "";

  if (firstLine === "READY") {
    return { ready: true, questions: [], malformed: false, raw, costUsd };
  }

  if (firstLine === "NOT READY") {
    // Subsequent lines matching /^- / (after .trim()) become questions.
    const questions: string[] = [];
    for (let i = 1; i < lines.length; i++) {
      const trimmed = lines[i]!.trim();
      if (trimmed.startsWith("- ")) {
        questions.push(trimmed.slice(2));
      }
    }
    return { ready: false, questions, malformed: false, raw, costUsd };
  }

  // Anything else → malformed; never a green light.
  return { ready: false, questions: [], malformed: true, raw, costUsd };
}

// ── deriveCheck ──────────────────────────────────────────────────────────────

/**
 * One LOW-tier call that asks the implementer to mechanically enumerate the
 * concrete inputs whose required output it cannot derive from the prompt — a
 * recall task, not a confidence call (the gate-calibration rework hypothesis).
 * Fail-closed: malformed is never a green light. Sibling of gruntJudge; shares
 * its API-attempt loop and parse skeleton.
 */
export async function deriveCheck(
  opts: DeriveCheckOptions,
): Promise<DeriveCheckVerdict> {
  const kind = opts.kind ?? "gate.derive";

  // Attempt up to MAX_API_ATTEMPTS (3 total).
  let raw = "";
  let costUsd = 0;

  for (let attempt = 0; attempt < MAX_API_ATTEMPTS; attempt++) {
    try {
      const result = await opts.agent.generate({
        system: DERIVE_SYSTEM,
        prompt: opts.prompt,
        maxTokens: 1024,
        kind,
        ...(opts.tags ? { tags: opts.tags } : {}),
      });
      raw = result.text;
      costUsd = result.costUsd;
      break; // success
    } catch {
      if (attempt === MAX_API_ATTEMPTS - 1) {
        // All attempts exhausted — treat as malformed, costUsd: 0, raw: "".
        return { ready: false, undecided: [], malformed: true, raw: "", costUsd: 0 };
      }
      // else: retry
    }
  }

  return parseDeriveResponse(raw, costUsd);
}

function parseDeriveResponse(raw: string, costUsd: number): DeriveCheckVerdict {
  // Find first non-empty trimmed line.
  const lines = raw.split("\n");
  const firstLine = lines.find((l) => l.trim().length > 0)?.trim() ?? "";

  if (firstLine === "DECIDED") {
    return { ready: true, undecided: [], malformed: false, raw, costUsd };
  }

  if (firstLine === "UNDECIDED") {
    // Subsequent lines matching /^- / (after .trim()) become undecided entries.
    const undecided: string[] = [];
    for (let i = 1; i < lines.length; i++) {
      const trimmed = lines[i]!.trim();
      if (trimmed.startsWith("- ")) {
        undecided.push(trimmed.slice(2));
      }
    }
    return { ready: false, undecided, malformed: false, raw, costUsd };
  }

  // Anything else → malformed; never a green light. Fail closed.
  return { ready: false, undecided: [], malformed: true, raw, costUsd };
}

// ── convergenceProbe ─────────────────────────────────────────────────────────

/**
 * K independent generations + convergence check.
 * ContractHashMismatch propagates out; it is not caught here.
 */
export async function convergenceProbe(
  opts: ProbeOptions,
): Promise<ProbeVerdict> {
  const k = opts.k ?? 8;
  const system = opts.system ?? PROBE_DEFAULT_SYSTEM;
  const maxTokens = opts.maxTokens ?? 2048;
  const kind = opts.kind ?? "gate.probe";

  // Guard: empty probes before any model call.
  if (opts.probes.length === 0) {
    throw new Error(
      "convergenceProbe: opts.probes must not be empty (received 0 probe cases)",
    );
  }

  // Contamination audit: for each probe's inputs, ensure no JSON.stringify(input)
  // appears as substring of opts.prompt. Same pattern as auditNoContamination.
  for (let pi = 0; pi < opts.probes.length; pi++) {
    const probe = opts.probes[pi]!;
    for (const inp of probe.input) {
      const needle = JSON.stringify(inp);
      if (opts.prompt.includes(needle)) {
        throw new Error(
          `convergenceProbe: contamination — probe[${pi}]${probe.name !== undefined ? ` ("${probe.name}")` : ""} input ${needle} appears in opts.prompt`,
        );
      }
    }
  }

  // Dispatch k independent generations with concurrency 4.
  const genTasks: Array<() => Promise<{ code: string | undefined; costUsd: number }>> =
    Array.from({ length: k }, () => () =>
      dispatchGeneration(opts.agent, opts.prompt, system, maxTokens, kind, opts.tags),
    );

  const genResults = await runWithConcurrency(genTasks, PROBE_CONCURRENCY);

  // Accumulate total cost across all generations (including failed ones).
  let totalCostUsd = 0;
  for (const r of genResults) {
    totalCostUsd += r.costUsd;
  }

  // Judge each impl against the contract to find survivors.
  // ContractHashMismatch propagates (not caught).
  type SurvivorEntry = { code: string; probeVector: boolean[] };
  const survivors: SurvivorEntry[] = [];

  for (const gen of genResults) {
    if (gen.code === undefined) continue; // no code → non-survivor

    // Judge against contract first.
    const contractResult = judge(opts.contract, gen.code, {
      expectedHash: opts.contract.hash,
    });
    if (!contractResult.pass) continue; // failed contract → non-survivor

    // Survivor: judge against probes to get probe vector.
    const probeResult = judge(opts.contract, gen.code, {
      battery: opts.probes as ContractCase[],
      expectedHash: opts.contract.hash,
    });

    survivors.push({
      code: gen.code,
      probeVector: probeResult.vector as boolean[],
    });
  }

  const survivorCount = survivors.length;
  const survivorRate = survivorCount / k;

  // Cluster probe vectors by their string key ("1"/"0" joined).
  const clusterMap = new Map<string, number>();
  for (const s of survivors) {
    const key = s.probeVector.map((b) => (b ? "1" : "0")).join("");
    clusterMap.set(key, (clusterMap.get(key) ?? 0) + 1);
  }

  let largestCluster = 0;
  for (const count of clusterMap.values()) {
    if (count > largestCluster) largestCluster = count;
  }

  const modalShare = survivorCount === 0 ? 0 : largestCluster / survivorCount;

  // Build disagreements: probe indices where survivors differ in pass/fail.
  const disagreements: Array<{
    probeIndex: number;
    name?: string;
    split: Record<string, number>;
  }> = [];

  for (let pi = 0; pi < opts.probes.length; pi++) {
    const probe = opts.probes[pi]!;
    if (survivorCount === 0) break;

    // Count pass vs fail for this probe index.
    let passCount = 0;
    let failCount = 0;
    for (const s of survivors) {
      if (s.probeVector[pi]) passCount++;
      else failCount++;
    }

    if (passCount > 0 && failCount > 0) {
      const split: Record<string, number> = { pass: passCount, fail: failCount };
      const entry: {
        probeIndex: number;
        name?: string;
        split: Record<string, number>;
      } = { probeIndex: pi, split };
      if (probe.name !== undefined) entry.name = probe.name;
      disagreements.push(entry);
    }
  }

  const ready = survivorRate >= 0.5 && modalShare >= 0.9;

  return {
    ready,
    k,
    survivors: survivorCount,
    survivorRate,
    modalShare,
    disagreements,
    costUsd: totalCostUsd,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function dispatchGeneration(
  agent: Agent,
  prompt: string,
  system: string,
  maxTokens: number,
  kind: string,
  tags: Record<string, string | number> | undefined,
): Promise<{ code: string | undefined; costUsd: number }> {
  for (let attempt = 0; attempt < MAX_API_ATTEMPTS; attempt++) {
    try {
      const result = await agent.generate({
        prompt,
        system,
        maxTokens,
        kind,
        ...(tags ? { tags } : {}),
      });
      return { code: result.code, costUsd: result.costUsd };
    } catch {
      if (attempt === MAX_API_ATTEMPTS - 1) {
        // All attempts exhausted — non-survivor, cost 0.
        return { code: undefined, costUsd: 0 };
      }
    }
  }
  // Unreachable but satisfies TypeScript.
  return { code: undefined, costUsd: 0 };
}

/**
 * Duplicated from src/experiment/e1b.ts — kept local to avoid touching e1a tests.
 * Runs `tasks` with at most `concurrency` concurrent workers.
 */
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length) as T[];
  let nextIdx = 0;
  async function worker(): Promise<void> {
    while (nextIdx < tasks.length) {
      const idx = nextIdx++;
      results[idx] = await tasks[idx]!();
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
