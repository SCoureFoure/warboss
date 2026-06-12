/**
 * Derive-calibration runner — DECIDED-rate + enumerated underivable inputs vs
 * E1a-r2 modal-share anchors.
 *
 * For each of the three r2 prompt configs (A prose-only, B full contract,
 * C partial), build the dispatch prompt exactly as E1a did, run `deriveCheck`
 * N independent times per config, and persist a timestamped artifact that
 * juxtaposes per-config DECIDED rate / malformed count / enumerated underivable
 * inputs with the pinned r2 modal-share anchors. The runner computes NO
 * pass/fail verdict — interpretation is human (see
 * specs/gate-judge-derive.spec.md, "useful signal").
 *
 * Near-clone of calibrate-gate.ts; the only diffs are: it calls `deriveCheck`
 * (not `gruntJudge`), and per config it reports a DECIDED rate + the enumerated
 * underivable inputs (not a READY rate + questions).
 *
 * Spec: specs/gate-judge-derive.spec.md rev 1.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, type MessagesClient } from "../agent.ts";
import { Ledger } from "../cost.ts";
import { jsonlFileSink } from "../ledger-sink.ts";
import { TIERS } from "../models.ts";
import { deriveCheck } from "../gate.ts";
import { loadTask } from "./task.ts";
import { buildPrompt } from "./arms.ts";

/** The three r2 prompt configs, in artifact key order. */
export const CALIBRATION_CONFIGS = ["A", "B", "C"] as const;
export type CalibrationConfig = (typeof CALIBRATION_CONFIGS)[number];

/**
 * Pinned r2 modal-share anchors (from runs/e1a-20260610T224357Z.json rescore).
 * Embedded verbatim in the artifact so the comparison is self-contained.
 */
export const ANCHORS: Record<CalibrationConfig, number> = {
  A: 0.6,
  B: 0.967,
  C: 0.967,
};

const TASK_PATH = "tasks/duration-parse";
const TASK_NAME = "duration-parse";
const MAX_CONCURRENCY = 4;

export interface DeriveCalibrationOptions {
  client?: MessagesClient; // fake for tests; omitted → real client
  n?: number; // default 20
  out?: string; // default "runs"
  live?: boolean; // CLI passes true, tests false
}

export interface ConfigDeriveCalibration {
  readonly decidedCount: number; // first line exactly DECIDED
  readonly decidedRate: number; // decidedCount / n (malformed in denominator)
  readonly malformedCount: number;
  /** Every verdict's undecided entries, concatenated in call order, dups kept. */
  readonly undecided: readonly string[];
}

// UNDECIDED: the spec pins runDeriveCalibration's options but not its return
// type; copied the calibrate-gate.ts idiom ({ deadRun }) since AC9's nonzero-
// exit CLI path needs exactly that bit.
export interface DeriveCalibrationResult {
  readonly deadRun: boolean;
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

export async function runDeriveCalibration(
  opts: DeriveCalibrationOptions = {},
): Promise<DeriveCalibrationResult> {
  const n = opts.n ?? 20;
  const outDir = opts.out ?? "runs";

  const task = loadTask(TASK_PATH);

  // Timestamp pairs the durable cost log with the results artifact (e1a idiom).
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

  await mkdir(outDir, { recursive: true });
  const ledger = new Ledger(
    jsonlFileSink(join(outDir, `cost-ledger-${ts}.jsonl`)),
  );

  // The would-be implementer: same tier the gate will guard in production.
  const agent = new Agent(TIERS.LOW, ledger, {
    ...(opts.client ? { client: opts.client } : {}),
  });

  // What r2 dispatched is what is judged — no rewrapping.
  const promptByConfig = new Map<CalibrationConfig, string>(
    CALIBRATION_CONFIGS.map((config) => [config, buildPrompt(config, task)]),
  );

  const jobs: Array<{ config: CalibrationConfig; run: number }> = [];
  for (const config of CALIBRATION_CONFIGS) {
    for (let run = 0; run < n; run++) {
      jobs.push({ config, run });
    }
  }

  const jobFns = jobs.map(
    ({ config, run }) =>
      () =>
        deriveCheck({
          agent,
          prompt: promptByConfig.get(config)!,
          tags: { config, run },
        }),
  );

  const verdicts = await runWithConcurrency(jobFns, MAX_CONCURRENCY);

  const results = Object.fromEntries(
    CALIBRATION_CONFIGS.map((config) => {
      let decidedCount = 0;
      let malformedCount = 0;
      const undecided: string[] = [];
      // verdicts is in job order, so per-config slices preserve call order.
      for (let i = 0; i < jobs.length; i++) {
        if (jobs[i]!.config !== config) continue;
        const v = verdicts[i]!;
        if (v.malformed) {
          // Malformed counts as not-decided (gate dogma fail-closed).
          malformedCount++;
        } else if (v.ready) {
          decidedCount++;
        }
        undecided.push(...v.undecided);
      }
      const result: ConfigDeriveCalibration = {
        decidedCount,
        decidedRate: decidedCount / n,
        malformedCount,
        undecided,
      };
      return [config, result];
    }),
  ) as Record<CalibrationConfig, ConfigDeriveCalibration>;

  const totals = ledger.totals();
  const deadRun = opts.live === true && totals.costUsd === 0;

  const artifact = {
    config: { n, configs: CALIBRATION_CONFIGS, task: TASK_NAME },
    results,
    anchors: ANCHORS,
    ledger: ledger.toJSON(),
    totalCostUsd: totals.costUsd,
    deadRun,
  };

  const fileName = `derive-calibration-${ts}.json`;
  await writeFile(join(outDir, fileName), JSON.stringify(artifact, null, 2));

  console.log(`\n=== Derive calibration — ${TASK_NAME} (N=${n} per config) ===\n`);
  for (const config of CALIBRATION_CONFIGS) {
    const r = results[config];
    console.log(
      `Config ${config}: decidedRate=${r.decidedRate.toFixed(3)} (anchor modal-share ${ANCHORS[config].toFixed(3)})` +
        ` malformed=${r.malformedCount} undecided=${r.undecided.length}`,
    );
  }
  console.log(`\nArtifact:   ${join(outDir, fileName)}`);
  console.log(`Cost log:   ${join(outDir, `cost-ledger-${ts}.jsonl`)}`);
  console.log(`Total cost: $${totals.costUsd.toFixed(6)}`);

  if (deadRun) {
    console.error(
      "\n!!! DEAD RUN — harness defect suspected: live run with zero ledger cost. Artifact written as evidence.",
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

  const opts: DeriveCalibrationOptions = {
    n: parseInt(getArg("--n", "20"), 10),
    out: getArg("--out", "runs"),
    live: true,
  };

  runDeriveCalibration(opts)
    .then(({ deadRun }) => {
      if (deadRun) process.exit(1);
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
