/**
 * E2 — contract authorship (human-authored vs warboss-authored contract).
 *
 * The thesis's load-bearing comparison: two contract sources (`human` =
 * `task.grader`, `warboss` = reconstructed from a `decompose` artifact) drive
 * the IDENTICAL product loop with the same LOW-tier grunt, same budget, same
 * feedback granularity. Each final impl is scored against the shared hidden
 * battery; the score is split into happy/error subsets; the pre-registered E2
 * criterion (warboss ≥ 0.90 × human hidden score) is evaluated. Authoring cost
 * (HIGH-tier, off-band) and grinding cost (LOW-tier loop) are reported as
 * distinct fields.
 *
 * E2 does NOT author the warboss contract — that is `decompose`/`decompose-run`
 * (H-9/H-14), run off-band as a God-funded spend; its artifact is an INPUT here.
 * E2 keeps no loop logic of its own: `runLoop` + `judge` are reused verbatim.
 *
 * Spec: specs/e2-contract-authorship.spec.md (rev 1).
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, GRUNT_DOGMA, type MessagesClient } from "../agent.ts";
import { Ledger } from "../cost.ts";
import { jsonlFileSink } from "../ledger-sink.ts";
import { judge } from "../runner.ts";
import { TIERS } from "../models.ts";
import { Contract, type ContractCase } from "../contract.ts";
import { runLoop, type LoopResult } from "../loop.ts";
import { loadTask, auditNoContamination, type HiddenCase } from "./task.ts";
import { formatContractSection } from "./arms.ts";
import {
  analyzeE1bArm,
  MAX_BUDGET,
  type FeedbackArm,
  type FeedbackArmAnalysis,
  type E1aArmDStats,
  type SessionRecord,
} from "./e1b.ts";
import type { DecomposeArtifact } from "./decompose-run.ts";

const _thisDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TASKS_DIR = join(_thisDir, "..", "..", "tasks");
const MAX_CONCURRENCY = 4;

export type ContractSource = "human" | "warboss";

export interface E2SessionRecord {
  readonly source: ContractSource;
  readonly sessionIndex: number;
  readonly model: string;
  readonly attempts: number;
  readonly stalled: boolean;
  readonly green: boolean;
  readonly finalCode: string | undefined;
  readonly finalVector: readonly boolean[];
  readonly finalScore: number;
  readonly totalCostUsd: number;
  readonly totalWallMs: number;
}

export interface E2Criterion {
  readonly pass: boolean;
  readonly detail: string;
}

export interface CoverageSplitSourceStats {
  readonly meanHappyScore: number | null;
  readonly meanErrorScore: number | null;
}

export interface CoverageSplit {
  readonly happyIdx: readonly number[];
  readonly errorIdx: readonly number[];
  readonly human: CoverageSplitSourceStats;
  readonly warboss: CoverageSplitSourceStats;
}

export interface RunE2Options {
  client?: MessagesClient; // fake for tests; omitted → real client (grunt)
  warbossArtifact?: string; // path to a decompose artifact (live route)
  warbossContract?: Contract; // injected (tests); takes precedence over the path
  task?: string; // default "duration-parse"
  n?: number; // default 30 per source
  granularity?: FeedbackArm; // default "full"
  out?: string; // default "runs"
  tasksDir?: string; // default the repo tasks dir (e1b idiom)
  e1aArmD?: E1aArmDStats; // optional secondary reference (reused type)
  live?: boolean; // CLI true, tests false
}

export interface RunE2Result {
  readonly deadRun: boolean;
}

/** Static contract coverage: does the contract carry any error-path example? */
export function hasErrorExample(contract: Contract): boolean {
  return contract.examples.some((e) => e.throws === true);
}

/**
 * Reconstruct the warboss contract from a decompose artifact. The artifact MUST
 * contain exactly one requirement; the re-frozen hash MUST equal the recorded
 * `contracts[0].hash`. Re-freezing is deterministic (warboss stage 6), so a
 * clean artifact always matches.
 */
export function reconstructWarbossContract(
  artifact: DecomposeArtifact,
): Contract {
  const count = artifact.requirements.length;
  if (count !== 1) {
    throw new Error(
      `E2 warboss source requires exactly one requirement, artifact has ${count}. ` +
        `The intent must be scoped to a single function (multi-requirement ` +
        `decomposition is out of scope for E2 rev 1).`,
    );
  }
  const r = artifact.requirements[0]!;
  const contract = Contract.freeze({
    requirement: r.requirement,
    entry: r.entry,
    version: "1",
    examples: r.examples,
  });
  const recordedHash = artifact.contracts[0]?.hash;
  if (contract.hash !== recordedHash) {
    throw new Error(
      `E2 warboss hash mismatch: re-frozen contract hash ${contract.hash} does ` +
        `not match the artifact's recorded contracts[0].hash ${recordedHash} ` +
        `(artifact tamper or version skew).`,
    );
  }
  return contract;
}

/** One session = one runLoop call + hidden-battery post-scoring (mirrors e1b). */
async function runE2Session(
  agent: Agent,
  initialPrompt: string,
  source: ContractSource,
  sessionIndex: number,
  sourceContract: Contract,
  granularity: FeedbackArm,
  hidden: readonly HiddenCase[],
): Promise<E2SessionRecord> {
  const loopResult: LoopResult = await runLoop({
    agent,
    contract: sourceContract,
    prompt: initialPrompt,
    granularity,
    budget: MAX_BUDGET,
    system: GRUNT_DOGMA,
    kind: "grunt.generate",
    tags: { source, sessionIndex },
  });

  const allFalse = new Array(hidden.length).fill(false) as boolean[];
  let finalVector: readonly boolean[] = allFalse;
  let finalScore = 0;

  if (loopResult.finalCode !== undefined) {
    const finalJudge = judge(sourceContract, loopResult.finalCode, {
      battery: hidden as unknown as ContractCase[],
      expectedHash: sourceContract.hash,
    });
    finalVector = finalJudge.vector;
    finalScore = finalJudge.score;
  }

  return {
    source,
    sessionIndex,
    model: TIERS.LOW.id,
    attempts: loopResult.attemptsUsed,
    stalled: loopResult.status === "stalled",
    green: loopResult.green,
    finalCode: loopResult.finalCode,
    finalVector,
    finalScore,
    totalCostUsd: loopResult.costUsd,
    totalWallMs: loopResult.wallMs,
  };
}

/**
 * Coverage split: partition the hidden battery by `throws` once, then compute
 * per-source mean happy/error scores over the source's sessions. An empty
 * subset's mean is `null` (a task with no error-path case has no datum).
 */
export function computeCoverageSplit(
  hidden: readonly HiddenCase[],
  sessionsBySource: Record<ContractSource, readonly E2SessionRecord[]>,
): CoverageSplit {
  const happyIdx: number[] = [];
  const errorIdx: number[] = [];
  hidden.forEach((c, i) => {
    if (c.throws === true) errorIdx.push(i);
    else happyIdx.push(i);
  });

  const meanOverSessions = (
    sessions: readonly E2SessionRecord[],
    idx: readonly number[],
  ): number | null => {
    if (idx.length === 0) return null;
    if (sessions.length === 0) return null;
    let total = 0;
    for (const s of sessions) {
      const passed = idx.filter((i) => s.finalVector[i] === true).length;
      total += passed / idx.length;
    }
    return total / sessions.length;
  };

  const statsFor = (source: ContractSource): CoverageSplitSourceStats => ({
    meanHappyScore: meanOverSessions(sessionsBySource[source], happyIdx),
    meanErrorScore: meanOverSessions(sessionsBySource[source], errorIdx),
  });

  return {
    happyIdx,
    errorIdx,
    human: statsFor("human"),
    warboss: statsFor("warboss"),
  };
}

/**
 * Pre-registered E2 criterion: PASS iff
 * `warboss.meanFinalHiddenScore >= 0.90 * human.meanFinalHiddenScore`.
 * Degenerate guard: human mean === 0 → undefined ratio → pass:false.
 */
export function evaluateE2Criterion(
  human: FeedbackArmAnalysis,
  warboss: FeedbackArmAnalysis,
): E2Criterion {
  const h = human.meanFinalHiddenScore;
  const w = warboss.meanFinalHiddenScore;
  if (h === 0) {
    return {
      pass: false,
      detail:
        `degenerate human baseline: human meanFinalHiddenScore=${h.toFixed(3)} ` +
        `(a human contract that scores 0 hidden cannot anchor the comparison); ` +
        `warboss=${w.toFixed(3)}`,
    };
  }
  const threshold = 0.9 * h;
  const pass = w >= threshold;
  return {
    pass,
    detail:
      `warboss=${w.toFixed(3)} ${pass ? "≥" : "<"} 0.900 × human=${h.toFixed(3)} ` +
      `(threshold=${threshold.toFixed(3)})`,
  };
}

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

export async function runE2(opts: RunE2Options = {}): Promise<RunE2Result> {
  const n = opts.n ?? 30;
  const taskName = opts.task ?? "duration-parse";
  const granularity = opts.granularity ?? "full";
  const outDir = opts.out ?? "runs";
  const tasksDir = opts.tasksDir ?? DEFAULT_TASKS_DIR;

  const task = loadTask(join(tasksDir, taskName));

  // ── Warboss source selection (exactly one; injected contract wins) ──────────
  let warbossContract: Contract;
  let warbossArtifactPath: string | null = null;
  let authoringCostUsd = 0;

  if (opts.warbossContract !== undefined) {
    warbossContract = opts.warbossContract;
    // authoringCostUsd stays 0 for an injected contract (no path).
  } else if (opts.warbossArtifact !== undefined) {
    warbossArtifactPath = opts.warbossArtifact;
    const raw = await readFile(opts.warbossArtifact, "utf8");
    const artifact = JSON.parse(raw) as DecomposeArtifact;
    warbossContract = reconstructWarbossContract(artifact);
    authoringCostUsd = artifact.totalCostUsd;
  } else {
    throw new Error(
      "E2 requires a warboss source: pass `warbossContract` (injected) or " +
        "`warbossArtifact` (path to a decompose artifact). Neither was provided.",
    );
  }

  const humanContract = task.grader;

  // ── Prompts (e1a/e1b Arm-B format) ──────────────────────────────────────────
  const humanPrompt =
    task.prose +
    formatContractSection(
      humanContract.entry,
      humanContract.examples,
      humanContract.hash,
    );
  const warbossPrompt =
    task.prose +
    formatContractSection(
      warbossContract.entry,
      warbossContract.examples,
      warbossContract.hash,
    );

  // Contamination audit spans BOTH source prompts, before any dispatch.
  auditNoContamination([humanPrompt, warbossPrompt], task.hidden);

  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

  await mkdir(outDir, { recursive: true });
  const ledger = new Ledger(
    jsonlFileSink(join(outDir, `cost-ledger-${ts}.jsonl`)),
  );

  const agent = new Agent(TIERS.LOW, ledger, {
    ...(opts.client ? { client: opts.client } : {}),
  });

  // ── Sessions: N per source ──────────────────────────────────────────────────
  interface Job {
    source: ContractSource;
    sessionIndex: number;
    contract: Contract;
    prompt: string;
  }
  const jobs: Job[] = [];
  for (let i = 0; i < n; i++) {
    jobs.push({ source: "human", sessionIndex: i, contract: humanContract, prompt: humanPrompt });
  }
  for (let i = 0; i < n; i++) {
    jobs.push({ source: "warboss", sessionIndex: i, contract: warbossContract, prompt: warbossPrompt });
  }

  const jobFns = jobs.map(
    (job) => () =>
      runE2Session(
        agent,
        job.prompt,
        job.source,
        job.sessionIndex,
        job.contract,
        granularity,
        task.hidden,
      ),
  );

  const sessions = await runWithConcurrency(jobFns, MAX_CONCURRENCY);

  const humanSessions = sessions.filter((s) => s.source === "human");
  const warbossSessions = sessions.filter((s) => s.source === "warboss");

  // UNDECIDED: spec pins E2SessionRecord WITHOUT a `feedbackArm` field (source is
  // the partition key) AND mandates reuse of analyzeE1bArm, whose parameter type
  // is SessionRecord (which requires `feedbackArm`). analyzeE1bArm reads only
  // green/stalled/attempts/finalScore/totalCostUsd — all present on E2SessionRecord
  // — so a structural cast bridges the two without altering the pinned record shape
  // or editing e1b.ts. Reading taken: cast at the call site; do not add feedbackArm.
  const humanAnalysis = analyzeE1bArm("human", humanSessions as unknown as SessionRecord[]);
  const warbossAnalysis = analyzeE1bArm("warboss", warbossSessions as unknown as SessionRecord[]);

  const coverageSplit = computeCoverageSplit(task.hidden, {
    human: humanSessions,
    warboss: warbossSessions,
  });

  const e2Criterion = evaluateE2Criterion(humanAnalysis, warbossAnalysis);

  // Secondary reference (reported, NOT gating): Arm D HIGH one-shot.
  const armDReference =
    opts.e1aArmD !== undefined
      ? {
          meanHiddenScore: opts.e1aArmD.meanHiddenScore,
          humanReaches:
            humanAnalysis.meanFinalHiddenScore >= opts.e1aArmD.meanHiddenScore,
          warbossReaches:
            warbossAnalysis.meanFinalHiddenScore >= opts.e1aArmD.meanHiddenScore,
        }
      : null;

  const totals = ledger.totals();
  const grindingCostUsd = totals.costUsd;
  const totalCostUsd = grindingCostUsd; // run's own metered spend; authoring is separate.

  const deadRun =
    opts.live === true &&
    (grindingCostUsd === 0 || sessions.every((s) => s.finalScore === 0));

  const artifact = {
    config: { n, task: taskName, granularity, budget: MAX_BUDGET },
    taskName,
    warbossArtifactPath,
    contracts: {
      human: {
        hash: humanContract.hash,
        entry: humanContract.entry,
        hasErrorExample: hasErrorExample(humanContract),
      },
      warboss: {
        hash: warbossContract.hash,
        entry: warbossContract.entry,
        hasErrorExample: hasErrorExample(warbossContract),
      },
    },
    analysis: { human: humanAnalysis, warboss: warbossAnalysis },
    coverageSplit,
    e2Criterion,
    armDReference,
    grindingCostUsd,
    authoringCostUsd,
    sessions,
    ledger: ledger.toJSON(),
    totalCostUsd,
    deadRun,
  };

  const fileName = `e2-${ts}.json`;
  await writeFile(join(outDir, fileName), JSON.stringify(artifact, null, 2));

  console.log(`\n=== E2 Results — ${taskName} (N=${n} per source) ===\n`);
  for (const [name, a] of [
    ["human", humanAnalysis],
    ["warboss", warbossAnalysis],
  ] as const) {
    console.log(
      `Source ${name}: green=${a.greenRate.toFixed(2)} stall=${a.stallRate.toFixed(2)}` +
        ` meanAttempts=${a.meanAttempts.toFixed(2)}` +
        ` hiddenScore=${a.meanFinalHiddenScore.toFixed(3)}` +
        ` costPerGreen=$${a.meanCostPerGreenSession === Infinity ? "∞" : a.meanCostPerGreenSession.toFixed(4)}`,
    );
  }
  console.log(
    `\nCoverage split: happy=[${coverageSplit.happyIdx.join(",")}] error=[${coverageSplit.errorIdx.join(",")}]`,
  );
  console.log(
    `  human:   happy=${fmtNullable(coverageSplit.human.meanHappyScore)} error=${fmtNullable(coverageSplit.human.meanErrorScore)}`,
  );
  console.log(
    `  warboss: happy=${fmtNullable(coverageSplit.warboss.meanHappyScore)} error=${fmtNullable(coverageSplit.warboss.meanErrorScore)}`,
  );
  console.log(`\nE2 criterion: ${e2Criterion.pass ? "PASS" : "FAIL"} — ${e2Criterion.detail}`);
  console.log(`\nArtifact:        ${join(outDir, fileName)}`);
  console.log(`Cost log:        ${join(outDir, `cost-ledger-${ts}.jsonl`)}`);
  console.log(`Grinding cost:   $${grindingCostUsd.toFixed(6)}`);
  console.log(`Authoring cost:  $${authoringCostUsd.toFixed(6)}`);

  if (deadRun) {
    process.stderr.write(
      "\n!!! DEAD RUN — harness defect suspected: live run with zero grinding cost or all-zero scores. Artifact written as evidence.\n",
    );
  }

  return { deadRun };
}

function fmtNullable(v: number | null): string {
  return v === null ? "null" : v.toFixed(3);
}

// CLI entry
if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  const getArg = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] !== undefined ? args[idx + 1]! : undefined;
  };

  const warbossArtifact = getArg("--warboss-artifact");
  if (warbossArtifact === undefined) {
    console.error("--warboss-artifact <path> is required for a live E2 run.");
    process.exit(1);
  }

  const e1aArmDPath = getArg("--e1a-arm-d");
  let e1aArmD: E1aArmDStats | undefined;
  if (e1aArmDPath !== undefined) {
    const raw = JSON.parse(readFileSync(e1aArmDPath, "utf8")) as {
      analysis: { D?: { meanPassRate: number; totalCostUsd: number } };
      config: { n: number };
    };
    const d = raw.analysis["D"];
    if (d) {
      e1aArmD = {
        meanHiddenScore: d.meanPassRate,
        meanCostUsd: d.totalCostUsd / raw.config.n,
      };
    }
  }

  const nRaw = getArg("--n");
  const opts: RunE2Options = {
    warbossArtifact,
    live: true,
    ...(nRaw !== undefined ? { n: parseInt(nRaw, 10) } : {}),
    ...(getArg("--task") !== undefined ? { task: getArg("--task")! } : {}),
    ...(getArg("--granularity") !== undefined
      ? { granularity: getArg("--granularity")! as FeedbackArm }
      : {}),
    ...(getArg("--out") !== undefined ? { out: getArg("--out")! } : {}),
    ...(e1aArmD ? { e1aArmD } : {}),
  };

  runE2(opts)
    .then(({ deadRun }) => {
      if (deadRun) process.exit(1);
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
