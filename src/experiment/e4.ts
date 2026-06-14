/**
 * E4 — battery authoring (close the kick-back loop: God answers, warboss
 * re-authors, re-run on a neutral oracle).
 *
 * God answers the E3 escalations once; those answers become:
 *   (a) a neutral oracle battery (replacing the confounded human-coin-flip battery), and
 *   (b) locked decisions fed back into a warboss re-author.
 * Then E2 re-runs human-vs-re-authored-warboss against the God battery.
 *
 * Spec: specs/e4-battery-authoring.spec.md rev 2.
 */

import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, type MessagesClient } from "../agent.ts";
import { Ledger } from "../cost.ts";
import { jsonlFileSink } from "../ledger-sink.ts";
import { TIERS } from "../models.ts";
import { decompose } from "../warboss.ts";
import { loadTask, type HiddenCase } from "./task.ts";
import type { DecomposeArtifact } from "./decompose-run.ts";
import { runE2, reconstructWarbossContract, type RunE2Options } from "./e2.ts";
import type { FeedbackArmAnalysis, FeedbackArm } from "./e1b.ts";
import { renderDecisionBlock } from "../kickback.ts";

const _thisDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TASKS_DIR = join(_thisDir, "..", "..", "tasks");

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface GodRuling {
  readonly input: readonly unknown[];
  readonly expected: unknown;
  readonly throws?: true;
  /** Rev 2: required, literal-free prose statement of the required behavior. The ONLY field rendered into the prompt. */
  readonly decision: string;
  /** Rev 2: optional, never rendered into any prompt. May contain anything including input literals. */
  readonly rationale?: string;
}

export interface RunE4Options {
  client?: MessagesClient;   // fake for tests; omitted → real client
  task?: string;             // default "duration-parse"
  godAnswers?: string;       // path to god-answers.json; default tasks/<task>/god-answers.json
  n?: number;                // default 30 per source (E2 default)
  granularity?: FeedbackArm; // default "full"
  out?: string;              // default "runs"
  tasksDir?: string;         // default repo tasks dir
  live?: boolean;            // CLI true, tests false
}

export interface RunE4Result { readonly deadRun: boolean; }

export interface E4Criterion {
  readonly pass: boolean;
  readonly detail: string;
}

// ── Pure helpers (exported for unit tests AC1–AC5) ────────────────────────────

// The three E3-known contested inputs (pinned from spec)
const E3_KNOWN_INPUTS: readonly (readonly string[])[] = [
  ["120"],
  [" 1h 30m "],
  ["1.5h"],
];

/**
 * Load and validate the God-answers asset from `path`.
 *
 * Throws a descriptive error if:
 * - File cannot be read or is not valid JSON
 * - Any of the three E3-known inputs is missing from the rulings
 * - Duplicate input tuples are present within the asset
 *
 * Returns the rulings verbatim (throws ruling's expected is "<throws>").
 */
export async function loadGodAnswers(path: string): Promise<readonly GodRuling[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    throw new Error(
      `loadGodAnswers: cannot read file at "${path}": ${(err as Error).message}`,
    );
  }

  let parsed: {
    task?: string;
    rulings?: Array<{
      input: unknown[];
      expected: unknown;
      throws?: boolean;
      decision?: unknown;
      rationale?: string;
    }>;
  };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch (err) {
    throw new Error(
      `loadGodAnswers: invalid JSON in "${path}": ${(err as Error).message}`,
    );
  }

  if (!Array.isArray(parsed.rulings)) {
    throw new Error(
      `loadGodAnswers: 'rulings' must be an array in "${path}"`,
    );
  }

  // Check for duplicate input tuples and validate `decision` presence + type
  const seen: string[] = [];
  for (const r of parsed.rulings) {
    const key = JSON.stringify(r.input);
    if (seen.includes(key)) {
      throw new Error(
        `loadGodAnswers: duplicate input tuple ${key} in "${path}"`,
      );
    }
    seen.push(key);

    // Rev 2: `decision` is REQUIRED and must be a string
    if (typeof r.decision !== "string") {
      throw new Error(
        `loadGodAnswers: ruling ${key} is missing a required 'decision' string in "${path}"`,
      );
    }

    // Rev 2: self-leak guard — decision must NOT contain JSON.stringify of any element of its own input
    for (const elem of r.input) {
      const needle = JSON.stringify(elem);
      if ((r.decision as string).includes(needle)) {
        throw new Error(
          `loadGodAnswers: self-leak in ruling ${key}: 'decision' contains the input literal ${needle}. ` +
          `Move input literals to 'rationale' (which is never rendered) and rephrase 'decision' without the literal.`,
        );
      }
    }
  }

  // Check that all three E3 known inputs are covered
  const missingKnowns: string[] = [];
  for (const known of E3_KNOWN_INPUTS) {
    const knownKey = JSON.stringify(known);
    if (!seen.includes(knownKey)) {
      missingKnowns.push(JSON.stringify(known));
    }
  }
  if (missingKnowns.length > 0) {
    throw new Error(
      `loadGodAnswers: asset must cover the three E3-known contested inputs; ` +
      `missing: ${missingKnowns.join(", ")} in "${path}"`,
    );
  }

  return parsed.rulings.map((r) => ({
    input: r.input,
    expected: r.throws === true ? "<throws>" : r.expected,
    ...(r.throws === true ? { throws: true as const } : {}),
    decision: r.decision as string,
    ...(r.rationale !== undefined ? { rationale: r.rationale } : {}),
  }));
}

/**
 * Build the God battery from the task's hidden cases and the God rulings.
 *
 * 1. Start from taskHidden (original order, mutable copy).
 * 2. For each ruling in asset order:
 *    - If ruling's input deep-equals an existing hidden case's input → REPLACE
 *      that case in place (same position, keep original name, God's expected/throws win,
 *      coveredBy = []).
 *    - Otherwise → APPEND after the originals (god-<i>-<json-input> name).
 * 3. Result name-uniqueness is asserted (throws if violated).
 *
 * Returns the resulting battery.
 */
export function buildGodBattery(
  taskHidden: readonly HiddenCase[],
  rulings: readonly GodRuling[],
): readonly HiddenCase[] {
  function inputsEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return false;
    }
    return true;
  }

  // Start from mutable copy
  const result: HiddenCase[] = taskHidden.map((c) => ({ ...c }));

  // Process rulings: override in place or append
  for (let godIndex = 0; godIndex < rulings.length; godIndex++) {
    const ruling = rulings[godIndex]!;
    let overrideIdx = -1;

    for (let i = 0; i < result.length; i++) {
      if (inputsEqual(result[i]!.input as readonly unknown[], ruling.input)) {
        overrideIdx = i;
        break;
      }
    }

    if (overrideIdx >= 0) {
      // Override in place: keep original name, God's expected/throws win, coveredBy = []
      const originalName = result[overrideIdx]!.name;
      result[overrideIdx] = {
        name: originalName,
        input: ruling.input,
        expected: ruling.throws === true ? "<throws>" : ruling.expected,
        ...(ruling.throws === true ? { throws: true as const } : {}),
        coveredBy: [],
      };
    } else {
      // Append: use god-<i>-<json-input> name
      const godName = `god-${godIndex}-${JSON.stringify(ruling.input)}`;
      result.push({
        name: godName,
        input: ruling.input,
        expected: ruling.throws === true ? "<throws>" : ruling.expected,
        ...(ruling.throws === true ? { throws: true as const } : {}),
        coveredBy: [],
      });
    }
  }

  // Assert name uniqueness
  const nameSet = new Set<string>();
  for (const c of result) {
    if (nameSet.has(c.name)) {
      throw new Error(
        `buildGodBattery: duplicate name "${c.name}" in result battery`,
      );
    }
    nameSet.add(c.name);
  }

  return result;
}

/**
 * Compute God battery statistics for the artifact.
 */
function godBatteryStats(
  taskHidden: readonly HiddenCase[],
  rulings: readonly GodRuling[],
  battery: readonly HiddenCase[],
): { total: number; fromTask: number; fromGod: number; overridden: number } {
  function inputsEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return false;
    }
    return true;
  }

  let overridden = 0;
  let fromGodAppended = 0;

  for (const ruling of rulings) {
    const matchesTask = taskHidden.some((c) =>
      inputsEqual(c.input as readonly unknown[], ruling.input),
    );
    if (matchesTask) {
      overridden++;
    } else {
      fromGodAppended++;
    }
  }

  // fromTask = task cases that were NOT overridden
  const fromTask = taskHidden.length - overridden;
  return {
    total: battery.length,
    fromTask,
    fromGod: fromGodAppended,
    overridden,
  };
}

/**
 * Render the owner-decision block for the decompose context (rev 2: prose-only).
 *
 * Exact format from spec:
 *   The owner has DECIDED the following behaviors. Treat each as fixed intent —
 *   they are not open choices; author examples (choosing your own representative
 *   inputs) that pin exactly these:
 *   - <decision string VERBATIM>
 *   ...
 *
 * One bullet per ruling in asset order; each bullet = the ruling's `decision` string VERBATIM.
 * No input literal, no `entry(args)` form, no `===`.
 * No bullet is omitted (throwing and value rulings both render their `decision`).
 *
 * Runs the self-leak guard: throws if any decision contains JSON.stringify of any element
 * of its own input (a self-leak is a hard error, never a silent exclusion).
 */
export function renderOwnerDecisions(
  rulings: readonly GodRuling[],
): string {
  // Self-leak guard (belt-and-braces — loadGodAnswers also checks, but we guard here too
  // so that test-injected rulings without going through the loader are also protected).
  // This guard is battery-specific and has no analogue in the battery-free live path.
  for (const r of rulings) {
    for (const elem of r.input) {
      const needle = JSON.stringify(elem);
      if (r.decision.includes(needle)) {
        throw new Error(
          `renderOwnerDecisions: self-leak in ruling ${JSON.stringify(r.input)}: ` +
          `'decision' contains the input literal ${needle}. ` +
          `Rephrase 'decision' without the literal (it is the ONLY field rendered).`,
        );
      }
    }
  }

  // Delegate to the shared canonical renderer (byte-identical output).
  return renderDecisionBlock(rulings.map((r) => r.decision));
}

/**
 * Evaluate the E4 criterion.
 *
 * PASS iff warboss.meanFinalHiddenScore >= 0.90 × human.meanFinalHiddenScore (God battery residual).
 * Degenerate guard: human.meanFinalHiddenScore === 0 → pass: false, detail names the degenerate baseline.
 * detail always carries both means, 0.90 threshold, residualGodCaseCount, and exclusionCount.
 */
export function evaluateE4Criterion(
  human: FeedbackArmAnalysis,
  warboss: FeedbackArmAnalysis,
  residualGodCaseCount: number,
  exclusionCount: number,
): E4Criterion {
  const h = human.meanFinalHiddenScore;
  const w = warboss.meanFinalHiddenScore;
  const residualDetail = `residualGodCases=${residualGodCaseCount} exclusions=${exclusionCount}`;

  if (h === 0) {
    return {
      pass: false,
      detail:
        `degenerate human baseline: human meanFinalHiddenScore=${h.toFixed(3)} ` +
        `(a human contract that scores 0 hidden cannot anchor the comparison); ` +
        `warboss=${w.toFixed(3)}; threshold=0.90×0.000=0.000; ${residualDetail}`,
    };
  }

  const threshold = 0.9 * h;
  const pass = w >= threshold;
  return {
    pass,
    detail:
      `warboss=${w.toFixed(3)} ${pass ? "≥" : "<"} 0.900 × human=${h.toFixed(3)} ` +
      `(threshold=${threshold.toFixed(3)}); ${residualDetail}`,
  };
}

// ── Runner ────────────────────────────────────────────────────────────────────

export async function runE4(opts: RunE4Options = {}): Promise<RunE4Result> {
  const taskName = opts.task ?? "duration-parse";
  const n = opts.n ?? 30;
  const granularity = opts.granularity ?? "full";
  const outDir = opts.out ?? "runs";
  const tasksDir = opts.tasksDir ?? DEFAULT_TASKS_DIR;

  const task = loadTask(join(tasksDir, taskName));

  const godAnswersPath =
    opts.godAnswers ?? join(tasksDir, taskName, "god-answers.json");

  // ── Load God answers ──────────────────────────────────────────────────────
  const rulings = await loadGodAnswers(godAnswersPath);

  // ── Build God battery ─────────────────────────────────────────────────────
  const godBattery = buildGodBattery(task.hidden, rulings);
  const godStats = godBatteryStats(task.hidden, rulings, godBattery);

  // ── Render owner-decision block (rev 2: prose-only, no entry param) ─────────
  const ownerDecisionBlock = renderOwnerDecisions(rulings);

  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

  await mkdir(outDir, { recursive: true });

  // Rev 2: E4 owns ONE shared Ledger with ONE jsonl sink.
  // This ledger is passed to runE2 via opts.ledger so E2 meters into it
  // and opens no second cost-ledger-*.jsonl of its own.
  const ledger = new Ledger(
    jsonlFileSink(join(outDir, `cost-ledger-${ts}.jsonl`)),
  );

  const clientOpt = opts.client !== undefined ? { client: opts.client } : {};

  // ── Author arm: HIGH tier — decompose with locked decisions in context ────
  const authorAgent = new Agent(TIERS.HIGH, ledger, clientOpt);

  const draftSet = await decompose({
    agent: authorAgent,
    intent: task.prose,
    context: ownerDecisionBlock,
    maxRequirements: 1,
    tags: { experiment: "e4", arm: "author" },
  });

  const authoringCostUsd = draftSet.costUsd;

  // Write the re-author decompose artifact under out/ (same shape as DecomposeArtifact)
  const reauthorArtifact: DecomposeArtifact = {
    intent: task.prose,
    context: ownerDecisionBlock,
    requirements: draftSet.requirements,
    contracts: draftSet.contracts.map((c, i) => ({
      id: draftSet.requirements[i]?.id ?? "",
      hash: c.hash,
      version: c.version,
    })),
    auditGaps: draftSet.auditGaps,
    escalations: draftSet.escalations,
    admission: {
      admitted: [],
      kickedBack: [],
    },
    ledger: ledger.toJSON(),
    totalCostUsd: authoringCostUsd,
  };

  // Use a slightly different timestamp to avoid colliding with the e4 artifact file
  const reauthorTs = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const reauthorArtifactPath = join(outDir, `decompose-${reauthorTs}.json`);
  await writeFile(reauthorArtifactPath, JSON.stringify(reauthorArtifact, null, 2));

  // Reconstruct the warboss contract from the draftSet via the artifact shape
  const warbossContract = reconstructWarbossContract(reauthorArtifact);

  // ── E2 re-run with God battery as hiddenOverride ──────────────────────────
  // Rev 2: pass the shared ledger so E2 does NOT open its own cost-ledger-*.jsonl sink.
  const e2Opts: RunE2Options = {
    ...(opts.client !== undefined ? { client: opts.client } : {}),
    warbossContract,
    task: taskName,
    n,
    granularity,
    out: outDir,
    tasksDir,
    hiddenOverride: godBattery,
    ledger,
    ...(opts.live !== undefined ? { live: opts.live } : {}),
  };

  await runE2(e2Opts);

  // Find the E2 artifact written by this run (most recent e2-*.json)
  const files = await readdir(outDir);
  const e2Files = files
    .filter((f) => f.startsWith("e2-") && f.endsWith(".json"))
    .sort();
  const e2FileName = e2Files[e2Files.length - 1];
  if (e2FileName === undefined) {
    throw new Error("E4: expected an e2 artifact file in outDir but none found");
  }

  const e2Raw = await readFile(join(outDir, e2FileName), "utf8");
  const e2Artifact = JSON.parse(e2Raw) as Record<string, unknown>;

  // Extract costs from E2 artifact
  const grindingCostUsd = (e2Artifact["grindingCostUsd"] as number) ?? 0;
  const totalCostUsd = authoringCostUsd + grindingCostUsd;

  // Extract analysis for E4 criterion
  const e2Analysis = e2Artifact["analysis"] as {
    human: FeedbackArmAnalysis;
    warboss: FeedbackArmAnalysis;
  };
  const e2HiddenBattery = e2Artifact["hiddenBattery"] as {
    residualCount: number;
    excluded: Array<{ name: string; leakedBy: string[] }>;
  };

  const residualGodCaseCount = e2HiddenBattery.residualCount;
  const exclusionCount = e2HiddenBattery.excluded.length;

  const e4Criterion = evaluateE4Criterion(
    e2Analysis.human,
    e2Analysis.warboss,
    residualGodCaseCount,
    exclusionCount,
  );

  // Rev 2: the shared ledger now contains ALL entries (author + E2 grinding phases).
  // The artifact's ledger field is the full shared ledger.
  const combinedLedger = ledger.toJSON();

  // Dead-run guard: live=true AND (totalCostUsd === 0 OR embedded E2 deadRun === true)
  const deadRun =
    opts.live === true &&
    (totalCostUsd === 0 || (e2Artifact["deadRun"] as boolean) === true);

  // Build E4 artifact
  const artifact = {
    config: { task: taskName, n, granularity },
    godAnswersPath,
    rulings: rulings.map((r) => ({
      input: r.input,
      expected: r.expected,
      ...(r.throws === true ? { throws: true } : {}),
      decision: r.decision,
      ...(r.rationale !== undefined ? { rationale: r.rationale } : {}),
    })),
    reauthorArtifactPath,
    godBattery: godStats,
    e2: e2Artifact,
    e4Criterion,
    authoringCostUsd,
    grindingCostUsd,
    totalCostUsd,
    ledger: combinedLedger,
    deadRun,
  };

  const artifactFileName = `e4-${ts}.json`;
  await writeFile(
    join(outDir, artifactFileName),
    JSON.stringify(artifact, null, 2),
  );

  // Console summary
  console.log(`\n=== E4 Results — ${taskName} (N=${n} per source) ===\n`);
  console.log(
    `God battery: total=${godStats.total} fromTask=${godStats.fromTask} ` +
    `fromGod=${godStats.fromGod} overridden=${godStats.overridden}`,
  );
  console.log(`Re-author artifact: ${reauthorArtifactPath}`);
  console.log(
    `E4 criterion: ${e4Criterion.pass ? "PASS" : "FAIL"} — ${e4Criterion.detail}`,
  );
  console.log(`\nArtifact:        ${join(outDir, artifactFileName)}`);
  console.log(`Cost log:        ${join(outDir, `cost-ledger-${ts}.jsonl`)}`);
  console.log(`Authoring cost:  $${authoringCostUsd.toFixed(6)}`);
  console.log(`Grinding cost:   $${grindingCostUsd.toFixed(6)}`);
  console.log(`Total cost:      $${totalCostUsd.toFixed(6)}`);

  if (deadRun) {
    process.stderr.write(
      "\n!!! DEAD RUN — live run with zero total cost or embedded E2 sub-run is deadRun. Artifact written as evidence.\n",
    );
  }

  return { deadRun };
}

// ── CLI entry ─────────────────────────────────────────────────────────────────

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  const getArg = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] !== undefined ? args[idx + 1]! : undefined;
  };

  const nRaw = getArg("--n");
  const opts: RunE4Options = {
    live: true,
    ...(getArg("--task") !== undefined ? { task: getArg("--task")! } : {}),
    ...(nRaw !== undefined ? { n: parseInt(nRaw, 10) } : {}),
    ...(getArg("--granularity") !== undefined
      ? { granularity: getArg("--granularity")! as FeedbackArm }
      : {}),
    ...(getArg("--out") !== undefined ? { out: getArg("--out")! } : {}),
    ...(getArg("--god-answers") !== undefined
      ? { godAnswers: getArg("--god-answers")! }
      : {}),
  };

  runE4(opts)
    .then(({ deadRun }) => {
      if (deadRun) process.exit(1);
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
