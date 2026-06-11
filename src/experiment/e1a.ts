import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, type MessagesClient } from "../agent.ts";
import { Ledger } from "../cost.ts";
import { jsonlFileSink } from "../ledger-sink.ts";
import { judge } from "../runner.ts";
import { TIERS } from "../models.ts";
import { loadTask, auditNoContamination } from "./task.ts";
import { type ArmId, E1A_SYSTEM, armSpec, buildPrompt } from "./arms.ts";
import {
  type RunRecord,
  analyzeArm,
  applyViabilityGate,
  evaluateCriteria,
  splits,
} from "./analysis.ts";

const _thisDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TASKS_DIR = join(_thisDir, "..", "..", "tasks");
const MAX_CONCURRENCY = 4;
const MAX_ATTEMPTS = 3;

export interface RunE1aOptions {
  n?: number;
  arms?: ArmId[];
  task?: string;
  out?: string;
  client?: MessagesClient;
  tasksDir?: string;
  live?: boolean;
}

export interface RunE1aResult {
  readonly deadRun: boolean;
}

async function dispatchOne(
  agent: Agent,
  prompt: string,
  arm: ArmId,
  index: number,
  taskName: string,
): Promise<{ text: string; code: string | undefined; costUsd: number; wallMs: number } | null> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await agent.generate({
        prompt,
        system: E1A_SYSTEM,
        maxTokens: 2048,
        kind: "grunt.generate",
        tags: { arm, task: taskName, index },
      });
    } catch {
      if (attempt === MAX_ATTEMPTS - 1) return null;
    }
  }
  return null;
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

export async function runE1a(opts: RunE1aOptions = {}): Promise<RunE1aResult> {
  const n = opts.n ?? 30;
  const armIds: ArmId[] = opts.arms ?? ["A", "B", "C", "D"];
  const taskName = opts.task ?? "duration-parse";
  const outDir = opts.out ?? "runs";
  const tasksDir = opts.tasksDir ?? DEFAULT_TASKS_DIR;

  const task = loadTask(join(tasksDir, taskName));

  // Timestamp pairs the durable cost log with the results artifact written below.
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

  // Durable cost log: one JSON line per model call, appended as it completes, so
  // a long run that dies mid-way still leaves an account-reconcilable record.
  await mkdir(outDir, { recursive: true });
  const ledger = new Ledger(jsonlFileSink(join(outDir, `cost-ledger-${ts}.jsonl`)));

  const agentMap = new Map<ArmId, Agent>(
    armIds.map((arm) => {
      const spec = armSpec(arm);
      const agent = new Agent(TIERS[spec.tier], ledger, {
        ...(opts.client ? { client: opts.client } : {}),
      });
      return [arm, agent];
    }),
  );

  const promptMap = new Map<ArmId, string>(
    armIds.map((arm) => [arm, buildPrompt(arm, task)]),
  );

  auditNoContamination([...promptMap.values()], task.hidden);

  const allIndices = task.hidden.map((_, i) => i);
  const split = splits(task.hidden, task.armCSubset);

  const jobs: Array<{ arm: ArmId; index: number }> = [];
  for (const arm of armIds) {
    for (let i = 0; i < n; i++) {
      jobs.push({ arm, index: i });
    }
  }

  const jobFns = jobs.map(
    ({ arm, index }) =>
      async (): Promise<RunRecord> => {
        const agent = agentMap.get(arm)!;
        const prompt = promptMap.get(arm)!;
        const spec = armSpec(arm);

        const gen = await dispatchOne(agent, prompt, arm, index, taskName);

        if (!gen || gen.code === undefined) {
          return {
            arm,
            index,
            model: TIERS[spec.tier].id,
            code: gen?.code,
            generationFailed: true,
            viable: false,
            vector: new Array(task.hidden.length).fill(false) as boolean[],
            score: 0,
            coveredScore: 0,
            uncoveredScore: 0,
            costUsd: gen?.costUsd ?? 0,
            wallMs: gen?.wallMs ?? 0,
          };
        }

        const judged = judge(task.grader, gen.code, {
          battery: task.hidden,
          expectedHash: task.grader.hash,
        });

        const { viable, vector: gatedVector } = applyViabilityGate(
          judged.vector,
          task.hidden,
        );

        const score =
          gatedVector.length > 0
            ? gatedVector.filter(Boolean).length / gatedVector.length
            : 0;

        const covPassing = split.coveredIndices.filter(
          (i) => gatedVector[i],
        ).length;
        const coveredScore =
          split.coveredIndices.length > 0
            ? covPassing / split.coveredIndices.length
            : 1;

        const uncovPassing = split.uncoveredIndices.filter(
          (i) => gatedVector[i],
        ).length;
        const uncoveredScore =
          split.uncoveredIndices.length > 0
            ? uncovPassing / split.uncoveredIndices.length
            : 1;

        return {
          arm,
          index,
          model: TIERS[spec.tier].id,
          code: gen.code,
          generationFailed: false,
          viable,
          vector: gatedVector,
          score,
          coveredScore,
          uncoveredScore,
          costUsd: gen.costUsd,
          wallMs: gen.wallMs,
        };
      },
  );

  const runs = await runWithConcurrency(jobFns, MAX_CONCURRENCY);

  const byArm = new Map<ArmId, RunRecord[]>(armIds.map((arm) => [arm, []]));
  for (const r of runs) {
    byArm.get(r.arm as ArmId)!.push(r);
  }

  const defaultAnalysis = (arm: string) => ({
    arm,
    clusterResult: { count: 0, sizes: [] as number[] },
    modalShare: 0,
    meanPassRate: 0,
    coveredPassRate: 0,
    uncoveredPassRate: 0,
    notCoveredByCPassRate: 0,
    totalCostUsd: 0,
  });

  const analysisMap = Object.fromEntries(
    armIds.map((arm) => [
      arm,
      analyzeArm(arm, byArm.get(arm) ?? [], split, allIndices),
    ]),
  ) as Record<ArmId, ReturnType<typeof analyzeArm>>;

  const criteria = evaluateCriteria(
    analysisMap["A"] ?? defaultAnalysis("A"),
    analysisMap["B"] ?? defaultAnalysis("B"),
    analysisMap["C"] ?? defaultAnalysis("C"),
  );

  const totals = ledger.totals();
  const fileName = `e1a-${ts}.json`;

  const deadRun =
    opts.live === true &&
    (totals.costUsd === 0 || runs.every((r) => r.score === 0));

  const artifact = {
    config: { n, arms: armIds, task: taskName },
    taskName,
    graderHash: task.grader.hash,
    runs,
    analysis: analysisMap,
    criteria,
    ledger: ledger.toJSON(),
    totalCostUsd: totals.costUsd,
    deadRun,
  };

  await writeFile(join(outDir, fileName), JSON.stringify(artifact, null, 2));

  console.log(`\n=== E1a Results — ${taskName} (N=${n} per arm) ===\n`);
  for (const arm of armIds) {
    const a = analysisMap[arm];
    if (!a) continue;
    console.log(
      `Arm ${arm}: clusters=${a.clusterResult.count} sizes=[${a.clusterResult.sizes.join(",")}]` +
        ` covered=${a.coveredPassRate.toFixed(3)} uncovered=${a.uncoveredPassRate.toFixed(3)}` +
        ` cost=$${a.totalCostUsd.toFixed(4)}`,
    );
  }
  console.log(`\nPre-registered criteria:`);
  console.log(
    `  1 (variance):    ${criteria.criterion1.pass ? "PASS" : "FAIL"} — ${criteria.criterion1.detail}`,
  );
  console.log(
    `  2 (correctness): ${criteria.criterion2.pass ? "PASS" : "FAIL"} — ${criteria.criterion2.detail}`,
  );
  console.log(
    `  3 (corollary D): ${criteria.criterion3.pass ? "PASS" : "FAIL"} — ${criteria.criterion3.detail}`,
  );
  console.log(`  4 (economics):   deferred (E1b)`);
  console.log(`\nArtifact:   ${join(outDir, fileName)}`);
  console.log(`Cost log:   ${join(outDir, `cost-ledger-${ts}.jsonl`)}`);
  console.log(`Total cost: $${totals.costUsd.toFixed(6)}`);

  if (deadRun) {
    console.error(
      "\n!!! DEAD RUN — harness defect suspected: live run with zero cost or all-zero scores. Artifact written as evidence.",
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

  const opts: RunE1aOptions = {
    n: parseInt(getArg("--n", "30"), 10),
    arms: getArg("--arms", "A,B,C,D")
      .split(",")
      .map((s) => s.trim() as ArmId),
    task: getArg("--task", "duration-parse"),
    out: getArg("--out", "runs"),
    live: true,
  };

  runE1a(opts)
    .then(({ deadRun }) => {
      if (deadRun) process.exit(1);
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
