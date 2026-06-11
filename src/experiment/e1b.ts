import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, GRUNT_DOGMA, type MessagesClient } from "../agent.ts";
import { Ledger } from "../cost.ts";
import { jsonlFileSink } from "../ledger-sink.ts";
import { judge } from "../runner.ts";
import { TIERS } from "../models.ts";
import { loadTask, auditNoContamination, type HiddenCase } from "./task.ts";
import { buildPrompt } from "./arms.ts";
import { type CriterionVerdict } from "./analysis.ts";
import type { Contract } from "../contract.ts";
import { runLoop } from "../loop.ts";
import type { LoopResult } from "../loop.ts";

export type FeedbackArm = "passfail" | "input" | "full";
export const MAX_BUDGET = 5;

const _thisDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TASKS_DIR = join(_thisDir, "..", "..", "tasks");
const MAX_CONCURRENCY = 4;

export interface SessionRecord {
  readonly feedbackArm: FeedbackArm;
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

export interface FeedbackArmAnalysis {
  readonly feedbackArm: string;
  readonly greenRate: number;
  readonly meanAttempts: number;
  readonly stallRate: number;
  readonly meanFinalHiddenScore: number;
  readonly meanCostPerGreenSession: number;
  readonly totalCostUsd: number;
}

export interface E1aArmDStats {
  readonly meanHiddenScore: number;
  readonly meanCostUsd: number;
}

export interface RunE1bOptions {
  n?: number;
  feedbackArms?: FeedbackArm[];
  task?: string;
  out?: string;
  client?: MessagesClient;
  tasksDir?: string;
  e1aArmD?: E1aArmDStats;
  live?: boolean;
}

export interface RunE1bResult {
  readonly deadRun: boolean;
}

async function runSession(
  agent: Agent,
  initialPrompt: string,
  feedbackArm: FeedbackArm,
  sessionIndex: number,
  taskName: string,
  grader: Contract,
  hidden: readonly HiddenCase[],
): Promise<SessionRecord> {
  const loopResult: LoopResult = await runLoop({
    agent,
    contract: grader,
    prompt: initialPrompt,
    granularity: feedbackArm,
    budget: MAX_BUDGET,
    system: GRUNT_DOGMA,
    kind: "grunt.generate",
    tags: { feedbackArm, task: taskName, sessionIndex },
  });

  const allFalse = new Array(hidden.length).fill(false) as boolean[];
  let finalVector: readonly boolean[] = allFalse;
  let finalScore = 0;

  if (loopResult.finalCode !== undefined) {
    const finalJudge = judge(grader, loopResult.finalCode, {
      battery: hidden as unknown as import("../contract.ts").ContractCase[],
      expectedHash: grader.hash,
    });
    finalVector = finalJudge.vector as boolean[];
    finalScore = finalJudge.score;
  }

  return {
    feedbackArm,
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

export function analyzeE1bArm(
  feedbackArm: string,
  sessions: readonly SessionRecord[],
): FeedbackArmAnalysis {
  const n = sessions.length;
  if (n === 0) {
    return {
      feedbackArm,
      greenRate: 0,
      meanAttempts: 0,
      stallRate: 0,
      meanFinalHiddenScore: 0,
      meanCostPerGreenSession: Infinity,
      totalCostUsd: 0,
    };
  }
  const greenSessions = sessions.filter((s) => s.green);
  const greenCount = greenSessions.length;
  const stallCount = sessions.filter((s) => s.stalled).length;
  const totalAttempts = sessions.reduce((s, r) => s + r.attempts, 0);
  const totalHiddenScore = sessions.reduce((s, r) => s + r.finalScore, 0);
  const totalCostUsd = sessions.reduce((s, r) => s + r.totalCostUsd, 0);
  const greenCost = greenSessions.reduce((s, r) => s + r.totalCostUsd, 0);

  return {
    feedbackArm,
    greenRate: greenCount / n,
    meanAttempts: totalAttempts / n,
    stallRate: stallCount / n,
    meanFinalHiddenScore: totalHiddenScore / n,
    meanCostPerGreenSession: greenCount > 0 ? greenCost / greenCount : Infinity,
    totalCostUsd,
  };
}

function pickBestArm(
  analysis: ReadonlyMap<FeedbackArm, FeedbackArmAnalysis>,
): FeedbackArmAnalysis | undefined {
  let best: FeedbackArmAnalysis | undefined;
  for (const a of analysis.values()) {
    if (!best) { best = a; continue; }
    if (a.greenRate > best.greenRate) { best = a; continue; }
    if (a.greenRate === best.greenRate && a.meanFinalHiddenScore > best.meanFinalHiddenScore) { best = a; continue; }
    if (
      a.greenRate === best.greenRate &&
      a.meanFinalHiddenScore === best.meanFinalHiddenScore &&
      a.meanCostPerGreenSession < best.meanCostPerGreenSession
    ) {
      best = a;
    }
  }
  return best;
}

function evaluateCriterion4(
  analysis: ReadonlyMap<FeedbackArm, FeedbackArmAnalysis>,
  e1aArmD: E1aArmDStats | undefined,
): CriterionVerdict {
  if (!e1aArmD) {
    return { pass: false, detail: "deferred (E1a Arm D data not provided)" };
  }
  const best = pickBestArm(analysis);
  if (!best || best.greenRate === 0) {
    return { pass: false, detail: "no green sessions in best arm — cannot evaluate economics" };
  }
  const scorePasses = best.meanFinalHiddenScore >= e1aArmD.meanHiddenScore;
  const costPasses = best.meanCostPerGreenSession < e1aArmD.meanCostUsd;
  const pass = scorePasses && costPasses;
  return {
    pass,
    detail:
      `best arm=${best.feedbackArm}: ` +
      `score=${best.meanFinalHiddenScore.toFixed(3)} (need ≥ ${e1aArmD.meanHiddenScore.toFixed(3)}), ` +
      `costPerGreen=$${best.meanCostPerGreenSession.toFixed(6)} (need < $${e1aArmD.meanCostUsd.toFixed(6)})`,
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
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function runE1b(opts: RunE1bOptions = {}): Promise<RunE1bResult> {
  const n = opts.n ?? 30;
  const feedbackArms: FeedbackArm[] = opts.feedbackArms ?? ["passfail", "input", "full"];
  const taskName = opts.task ?? "duration-parse";
  const outDir = opts.out ?? "runs";
  const tasksDir = opts.tasksDir ?? DEFAULT_TASKS_DIR;

  const task = loadTask(join(tasksDir, taskName));
  const initialPrompt = buildPrompt("B", task);

  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

  await mkdir(outDir, { recursive: true });
  const ledger = new Ledger(jsonlFileSink(join(outDir, `cost-ledger-${ts}.jsonl`)));

  const agent = new Agent(TIERS.LOW, ledger, {
    ...(opts.client ? { client: opts.client } : {}),
  });

  auditNoContamination([initialPrompt], task.hidden);

  const jobs: Array<{ feedbackArm: FeedbackArm; sessionIndex: number }> = [];
  for (const arm of feedbackArms) {
    for (let i = 0; i < n; i++) {
      jobs.push({ feedbackArm: arm, sessionIndex: i });
    }
  }

  const jobFns = jobs.map(
    ({ feedbackArm, sessionIndex }) =>
      () =>
        runSession(
          agent,
          initialPrompt,
          feedbackArm,
          sessionIndex,
          taskName,
          task.grader,
          task.hidden,
        ),
  );

  const sessions = await runWithConcurrency(jobFns, MAX_CONCURRENCY);

  const analysisByArm = new Map<FeedbackArm, FeedbackArmAnalysis>(
    feedbackArms.map((arm) => [
      arm,
      analyzeE1bArm(arm, sessions.filter((s) => s.feedbackArm === arm)),
    ]),
  );

  const criterion4 = evaluateCriterion4(analysisByArm, opts.e1aArmD);

  const totals = ledger.totals();
  const fileName = `e1b-${ts}.json`;

  const deadRun =
    opts.live === true &&
    (totals.costUsd === 0 || sessions.every((s) => s.finalScore === 0));

  const artifact = {
    config: { n, feedbackArms, task: taskName, budget: MAX_BUDGET },
    taskName,
    graderHash: task.grader.hash,
    sessions,
    analysis: Object.fromEntries(analysisByArm),
    criterion4,
    ledger: ledger.toJSON(),
    totalCostUsd: totals.costUsd,
    deadRun,
  };

  await writeFile(join(outDir, fileName), JSON.stringify(artifact, null, 2));

  console.log(`\n=== E1b Results — ${taskName} (N=${n} per arm) ===\n`);
  for (const arm of feedbackArms) {
    const a = analysisByArm.get(arm)!;
    console.log(
      `Arm ${arm}: green=${a.greenRate.toFixed(2)} stall=${a.stallRate.toFixed(2)}` +
        ` meanAttempts=${a.meanAttempts.toFixed(2)}` +
        ` hiddenScore=${a.meanFinalHiddenScore.toFixed(3)}` +
        ` costPerGreen=$${a.meanCostPerGreenSession === Infinity ? "∞" : a.meanCostPerGreenSession.toFixed(4)}`,
    );
  }
  console.log(`\nCriterion 4: ${criterion4.pass ? "PASS" : "FAIL"} — ${criterion4.detail}`);
  console.log(`\nArtifact:   ${join(outDir, fileName)}`);
  console.log(`Cost log:   ${join(outDir, `cost-ledger-${ts}.jsonl`)}`);
  console.log(`Total cost: $${totals.costUsd.toFixed(6)}`);

  if (deadRun) {
    process.stderr.write(
      "\n!!! DEAD RUN — harness defect suspected: live run with zero cost or all-zero scores. Artifact written as evidence.\n",
    );
  }

  return { deadRun };
}

// CLI entry
if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  const getArg = (flag: string, def: string): string => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] !== undefined ? args[idx + 1]! : def;
  };

  const e1aArmDPath = getArg("--e1a-arm-d", "");

  let e1aArmD: E1aArmDStats | undefined;
  if (e1aArmDPath) {
    const raw = JSON.parse(await readFile(e1aArmDPath, "utf8")) as {
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

  const opts: RunE1bOptions = {
    n: parseInt(getArg("--n", "30"), 10),
    feedbackArms: getArg("--arms", "passfail,input,full")
      .split(",")
      .map((s) => s.trim() as FeedbackArm),
    task: getArg("--task", "duration-parse"),
    out: getArg("--out", "runs"),
    live: true,
    ...(e1aArmD ? { e1aArmD } : {}),
  };

  runE1b(opts)
    .then(({ deadRun }) => {
      if (deadRun) process.exit(1);
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
