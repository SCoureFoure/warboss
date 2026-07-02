/**
 * Gate instruments: readiness probes that gate work before it enters
 * the experiment loop.
 *
 *   gruntJudge       — cheap, one LOW-tier call; judges whether a prompt is
 *                      fully decided (zero interpretation latitude left).
 *                      Calibration only — falsified as a gate.
 *   convergenceProbe — expensive, K independent generations + convergence
 *                      check; measures whether a contract is satisfiable and
 *                      whether survivors agree on probe cases. The only
 *                      admission gate.
 *   intentProbe      — pre-freeze instrument; K generations from PROSE intent
 *                      (no contract); outcomes clustered per candidate input to
 *                      detect intent-underdetermined semantics. Report-only
 *                      until E3 calibrates thresholds.
 *   deriveCheck      — mechanical DECIDED/UNDECIDED enumeration instrument.
 *                      Calibration only — falsified as a gate.
 */

import { Agent, extractCode } from "./agent.ts";
import { Contract, type ContractCase } from "./contract.ts";
import { judge, ContractHashMismatch } from "./runner.ts";
import { runImpl } from "./sandbox.ts";

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
  /** Cluster survivors by boolean probe-vector (default, rev-2 pinned behavior) or by actual outcome values. */
  clustering?: "vector" | "outcome";
  /** When set, the ready rule uses Wilson lower bounds instead of raw point estimates. */
  wilson?: { z?: number; minSurvivorLB: number; minAgreementLB: number };
  /** Sampling temperature forwarded to every generation call (Agent.generate now accepts it). */
  temperature?: number;
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
  /** Outcome mode only: probes where the modal cluster disagrees with the probe's expected value. */
  modalWrong?: readonly { probeIndex: number; name?: string; modalKey: string; expectedKey: string }[];
  costUsd: number;
}

// Instrument 3 (rev 2) — pre-freeze intent-divergence probe
export interface IntentProbeOptions {
  agent: Agent;
  /** PROSE intent + entry/signature line — NO contract section. */
  prompt: string;
  /** Function name impls must define (execution target). */
  entry: string;
  /** Candidate inputs (arg tuples); MUST be non-empty. */
  inputs: readonly (readonly unknown[])[];
  k?: number;
  system?: string;
  maxTokens?: number;
  /** Ledger kind, default "gate.intent". */
  kind?: string;
  tags?: Record<string, string | number>;
  /** Sampling temperature forwarded to every generation call (Agent.generate now accepts it). */
  temperature?: number;
}

export interface IntentProbeVerdict {
  k: number;
  /** Impls that produced code (extractCode non-undefined). */
  generated: number;
  /** Generated impls that never defined the entry as a callable function. */
  noEntry: number;
  /** Generated impls with ≥1 non-throw outcome (counted in clusters). */
  viable: number;
  /** Generated impls that threw on EVERY input (entry callable but all-reject). */
  nonviable: number;
  /** Only inputs where viable impls disagree — the kick-back payload. */
  splits: readonly {
    inputIndex: number;
    input: readonly unknown[];
    outcomes: Record<string, number>;
  }[];
  /** (inputs.length - splits.length) / inputs.length; 0 when viable === 0. */
  decidedRate: number;
  costUsd: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const JUDGE_SYSTEM =
  "You are the implementer who will receive this task. Judge ONLY whether the task is fully decided — zero interpretation latitude left. First line of your reply: exactly READY or NOT READY. If NOT READY, list every undecided question as a \"- \" bullet, one per line, nothing else.";

const DERIVE_SYSTEM =
  "You are the implementer who will receive this task. Do NOT rate your confidence. Mechanically enumerate the concrete inputs whose exact required output you cannot derive from the task text alone. First line of your reply: exactly DECIDED if you can derive the output for every input, or exactly UNDECIDED otherwise. If UNDECIDED, list each underivable input as a \"- \" bullet — the concrete input value followed by the one behavior the task leaves open — one per line, nothing else.";

const PROBE_DEFAULT_SYSTEM =
  "Implement the requested function in JavaScript. Define it as a top-level named function with exactly the requested name. Output ONLY one fenced code block. No prose.";

const MAX_API_ATTEMPTS = 3;
const PROBE_CONCURRENCY = 4;
const MIN_NEEDLE_LEN = 4;

/**
 * Outcome key for a sandbox run: "throw" on failure, else "value:<json>" on
 * success — "value:undefined" when the value JSON-stringifies to undefined.
 * Shared by intentProbe and convergenceProbe's outcome-clustering mode.
 */
function outcomeKey(run: { ok: boolean; value?: unknown }): string {
  if (!run.ok) return "throw";
  const jsonVal = JSON.stringify(run.value);
  return "value:" + (jsonVal === undefined ? "undefined" : jsonVal);
}

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
  const clustering = opts.clustering ?? "vector";

  // Guard: empty probes before any model call.
  if (opts.probes.length === 0) {
    throw new Error(
      "convergenceProbe: opts.probes must not be empty (received 0 probe cases)",
    );
  }

  // Contamination audit: a needle shorter than MIN_NEEDLE_LEN characters is
  // skipped — primitive literals like "1" substring-match almost any prompt,
  // so short needles are pure false positive. The full arg tuple is also
  // checked (brackets/commas make it distinctive even when args are short).
  for (let pi = 0; pi < opts.probes.length; pi++) {
    const probe = opts.probes[pi]!;
    const needles: string[] = [JSON.stringify(probe.input)];
    for (const inp of probe.input) {
      needles.push(JSON.stringify(inp));
    }
    for (const needle of needles) {
      if (needle.length >= MIN_NEEDLE_LEN && opts.prompt.includes(needle)) {
        throw new Error(
          `convergenceProbe: contamination — probe[${pi}]${probe.name !== undefined ? ` ("${probe.name}")` : ""} needle ${needle} appears in opts.prompt`,
        );
      }
    }
  }

  // Dispatch k independent generations with concurrency 4.
  const genTasks: Array<() => Promise<{ code: string | undefined; costUsd: number }>> =
    Array.from({ length: k }, () => () =>
      dispatchGeneration(opts.agent, opts.prompt, system, maxTokens, kind, opts.tags, opts.temperature),
    );

  const genResults = await runWithConcurrency(genTasks, PROBE_CONCURRENCY);

  // Accumulate total cost across all generations (including failed ones).
  let totalCostUsd = 0;
  for (const r of genResults) {
    totalCostUsd += r.costUsd;
  }

  // Judge each impl against the contract to find survivors — UNCHANGED across
  // clustering modes (outcome mode scores survivors differently but selects
  // the same set). ContractHashMismatch propagates (not caught).
  type SurvivorEntry = { code: string; probeVector: boolean[] };
  const survivors: SurvivorEntry[] = [];
  const outcomeSurvivorCodes: string[] = []; // populated only in outcome mode

  for (const gen of genResults) {
    if (gen.code === undefined) continue; // no code → non-survivor

    // Judge against contract first.
    const contractResult = judge(opts.contract, gen.code, {
      expectedHash: opts.contract.hash,
    });
    if (!contractResult.pass) continue; // failed contract → non-survivor

    if (clustering === "outcome") {
      outcomeSurvivorCodes.push(gen.code);
      continue;
    }

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

  if (clustering === "outcome") {
    return buildOutcomeVerdict(opts, outcomeSurvivorCodes, k, totalCostUsd);
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

  const ready = opts.wilson
    ? wilsonLower(survivorCount, k, opts.wilson.z ?? 1.645) >= opts.wilson.minSurvivorLB &&
      wilsonLower(largestCluster, survivorCount, opts.wilson.z ?? 1.645) >= opts.wilson.minAgreementLB
    : survivorRate >= 0.5 && modalShare >= 0.9;

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

// ── intentProbe ──────────────────────────────────────────────────────────────

/**
 * Pre-freeze intent-divergence probe (rev 2).
 * K independent generations from PROSE intent (no contract); outcomes clustered
 * per candidate input to detect intent-underdetermined semantics.
 * Report-only until E3 calibrates thresholds — no `ready` boolean, no threshold.
 */
export async function intentProbe(
  opts: IntentProbeOptions,
): Promise<IntentProbeVerdict> {
  const k = opts.k ?? 8;
  const system = opts.system ?? PROBE_DEFAULT_SYSTEM;
  const maxTokens = opts.maxTokens ?? 2048;
  const kind = opts.kind ?? "gate.intent";

  // Guard: empty inputs before any model call (mirrors convergenceProbe's empty-probes rule).
  if (opts.inputs.length === 0) {
    throw new Error(
      "intentProbe: opts.inputs must not be empty (received 0 candidate inputs)",
    );
  }

  // Dispatch k independent generations using the SHARED helpers (no duplication).
  const genTasks: Array<() => Promise<{ code: string | undefined; costUsd: number }>> =
    Array.from({ length: k }, () => () =>
      dispatchGeneration(opts.agent, opts.prompt, system, maxTokens, kind, opts.tags, opts.temperature),
    );

  const genResults = await runWithConcurrency(genTasks, PROBE_CONCURRENCY);

  // Accumulate total cost across all generations (including failed ones).
  let totalCostUsd = 0;
  for (const r of genResults) {
    totalCostUsd += r.costUsd;
  }

  // For each generated impl, execute over every candidate input and collect outcomes.
  // Outcome key: "value:<JSON.stringify(run.value)>" on success, "throw" on failure.
  // Special case: JSON.stringify(undefined) returns undefined (the JS value undefined),
  // so we emit "value:undefined" (the string) — the key is literally "value:undefined".
  //
  // Three-way classification (rev 3):
  //   noEntry   — run input[0]; if !ok AND error === "entry function '<entry>' is not defined"
  //               → classify noEntry, STOP. Excluded from clustering + viable count.
  //   viable    — entry callable AND ≥1 non-throw over all inputs.
  //   nonviable — entry callable but threw on EVERY input (genuine all-reject).
  // Invariant: generated === noEntry + viable + nonviable.

  interface ImplOutcomes {
    outcomes: string[]; // one per input, indexed same as opts.inputs
  }

  let generatedCount = 0;
  let noEntryCount = 0;
  let viableCount = 0;
  let nonviableCount = 0;
  const viableImplOutcomes: ImplOutcomes[] = [];

  const noEntrySentinel = `entry function '${opts.entry}' is not defined`;

  for (const gen of genResults) {
    if (gen.code === undefined) continue; // no extractable code → not generated
    generatedCount++;

    // Check input[0] for the missing-entry sentinel.
    const firstInput = opts.inputs[0]!;
    const firstRun = runImpl(gen.code, opts.entry, firstInput);
    if (!firstRun.ok && firstRun.error === noEntrySentinel) {
      // noEntry: structural — entry never defined; remaining inputs would all yield same sentinel.
      noEntryCount++;
      continue;
    }

    // Entry is callable (input[0] was ok, OR !ok with a different error).
    // Run ALL inputs to determine viable vs nonviable.
    const outcomes: string[] = [];
    let hasNonThrow = false;

    // Record outcome for input[0] first (already run).
    outcomes.push(outcomeKey(firstRun));
    if (firstRun.ok) hasNonThrow = true;

    // Run remaining inputs (index 1 onward).
    for (let ii = 1; ii < opts.inputs.length; ii++) {
      const input = opts.inputs[ii]!;
      const run = runImpl(gen.code, opts.entry, input);
      outcomes.push(outcomeKey(run));
      if (run.ok) {
        hasNonThrow = true;
      }
    }

    if (hasNonThrow) {
      viableCount++;
      viableImplOutcomes.push({ outcomes });
    } else {
      nonviableCount++;
      // All-throw impl excluded from clustering.
    }
  }

  // Build splits: for each input index, cluster viable impls by outcome key.
  // Only inputs with ≥2 distinct keys among viable impls are reported.
  const splits: Array<{
    inputIndex: number;
    input: readonly unknown[];
    outcomes: Record<string, number>;
  }> = [];

  for (let ii = 0; ii < opts.inputs.length; ii++) {
    // Collect outcome keys for this input across all viable impls.
    const dist: Record<string, number> = {};
    for (const impl of viableImplOutcomes) {
      const key = impl.outcomes[ii]!;
      dist[key] = (dist[key] ?? 0) + 1;
    }

    // A split entry is added only when there are ≥2 distinct keys.
    if (Object.keys(dist).length >= 2) {
      splits.push({
        inputIndex: ii,
        input: opts.inputs[ii]!,
        outcomes: dist,
      });
    }
  }

  // decidedRate: fail closed when viable === 0 (no throw, returns 0).
  const decidedRate =
    viableCount === 0
      ? 0
      : (opts.inputs.length - splits.length) / opts.inputs.length;

  return {
    k,
    generated: generatedCount,
    noEntry: noEntryCount,
    viable: viableCount,
    nonviable: nonviableCount,
    splits,
    decidedRate,
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
  temperature: number | undefined,
): Promise<{ code: string | undefined; costUsd: number }> {
  for (let attempt = 0; attempt < MAX_API_ATTEMPTS; attempt++) {
    try {
      const result = await agent.generate({
        prompt,
        system,
        maxTokens,
        kind,
        ...(tags ? { tags } : {}),
        ...(temperature !== undefined ? { temperature } : {}),
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

/** One-sided Wilson score lower bound on a binomial proportion. Returns 0 when n === 0. */
export function wilsonLower(successes: number, n: number, z = 1.645): number {
  if (n === 0) return 0;
  const p = successes / n;
  const z2 = z * z;
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
}

/**
 * convergenceProbe's outcome-clustering scorer (opts.clustering === "outcome").
 * Survivor selection already happened (unchanged); this scores the survivor
 * set by running each probe input directly and clustering on outcome keys
 * instead of pass/fail probe vectors — and flags the modal cluster when it
 * disagrees with the probe's expected value (the convergent-wrong fix).
 */
function buildOutcomeVerdict(
  opts: ProbeOptions,
  survivorCodes: readonly string[],
  k: number,
  totalCostUsd: number,
): ProbeVerdict {
  const survivorCount = survivorCodes.length;
  const survivorRate = survivorCount / k;

  // One outcome-key array per survivor, one key per probe (in probe order).
  const survivorOutcomeArrays: string[][] = survivorCodes.map((code) => {
    const keys: string[] = [];
    for (const probe of opts.probes) {
      const run = runImpl(code, opts.contract.entry, probe.input);
      keys.push(outcomeKey(run));
    }
    return keys;
  });

  // Cluster survivors by JSON.stringify(outcomeKeyArray).
  const clusterMap = new Map<string, { count: number; array: string[] }>();
  for (const arr of survivorOutcomeArrays) {
    const key = JSON.stringify(arr);
    const existing = clusterMap.get(key);
    if (existing) existing.count++;
    else clusterMap.set(key, { count: 1, array: arr });
  }

  // Largest cluster; ties broken by lexicographically smallest cluster key.
  let largestCluster = 0;
  let modalArray: string[] | undefined;
  for (const key of Array.from(clusterMap.keys()).sort()) {
    const entry = clusterMap.get(key)!;
    if (entry.count > largestCluster) {
      largestCluster = entry.count;
      modalArray = entry.array;
    }
  }

  const modalShare = survivorCount === 0 ? 0 : largestCluster / survivorCount;

  // Disagreements: probe indices where survivors produced ≥2 distinct outcome keys.
  const disagreements: Array<{
    probeIndex: number;
    name?: string;
    split: Record<string, number>;
  }> = [];

  for (let pi = 0; pi < opts.probes.length; pi++) {
    const probe = opts.probes[pi]!;
    if (survivorCount === 0) break;

    const dist: Record<string, number> = {};
    for (const arr of survivorOutcomeArrays) {
      const key = arr[pi]!;
      dist[key] = (dist[key] ?? 0) + 1;
    }

    if (Object.keys(dist).length >= 2) {
      const entry: {
        probeIndex: number;
        name?: string;
        split: Record<string, number>;
      } = { probeIndex: pi, split: dist };
      if (probe.name !== undefined) entry.name = probe.name;
      disagreements.push(entry);
    }
  }

  // Modal-vs-expected check: for each probe, compare the modal cluster's key
  // against the probe's expected outcome.
  const modalWrong: Array<{
    probeIndex: number;
    name?: string;
    modalKey: string;
    expectedKey: string;
  }> = [];

  if (modalArray !== undefined) {
    for (let pi = 0; pi < opts.probes.length; pi++) {
      const probe = opts.probes[pi]!;
      const expectedJson = JSON.stringify(probe.expected);
      const expectedKey =
        probe.throws === true
          ? "throw"
          : "value:" + (expectedJson === undefined ? "undefined" : expectedJson);
      const modalKey = modalArray[pi]!;
      if (modalKey !== expectedKey) {
        const entry: {
          probeIndex: number;
          name?: string;
          modalKey: string;
          expectedKey: string;
        } = { probeIndex: pi, modalKey, expectedKey };
        if (probe.name !== undefined) entry.name = probe.name;
        modalWrong.push(entry);
      }
    }
  }

  const wilson = opts.wilson;
  const thresholdsOk = wilson
    ? wilsonLower(survivorCount, k, wilson.z ?? 1.645) >= wilson.minSurvivorLB &&
      wilsonLower(largestCluster, survivorCount, wilson.z ?? 1.645) >= wilson.minAgreementLB
    : survivorRate >= 0.5 && modalShare >= 0.9;

  const ready = thresholdsOk && modalWrong.length === 0;

  return {
    ready,
    k,
    survivors: survivorCount,
    survivorRate,
    modalShare,
    disagreements,
    modalWrong,
    costUsd: totalCostUsd,
  };
}
