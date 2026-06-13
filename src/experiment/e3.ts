/**
 * E3 — intent-divergence runner (pre-freeze surfacing of underdetermined semantics).
 *
 * Measures whether two NEW pre-freeze instruments catch the three known
 * intent-underdetermined duration-parse inputs (identified by E2):
 *   (1) the warboss's fiat/escalation flags (rev-4 decompose), and
 *   (2) intentProbe's prose-level behavioral divergence (readiness-gate rev 2).
 *
 * This is the kick-back leg's falsification experiment.
 *
 * Spec: specs/e3-intent-divergence.spec.md rev 1.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, type MessagesClient } from "../agent.ts";
import { Ledger } from "../cost.ts";
import { jsonlFileSink } from "../ledger-sink.ts";
import { TIERS } from "../models.ts";
import { decompose } from "../warboss.ts";
import { intentProbe } from "../gate.ts";
import { deepEqual } from "../runner.ts";
import { loadTask } from "./task.ts";
import type { LedgerEntry } from "../cost.ts";
import type { IntentProbeVerdict } from "../gate.ts";

const _thisDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TASKS_DIR = join(_thisDir, "..", "..", "tasks");

// ── Pre-registered constants (VERBATIM from spec — any edit is a spec violation) ─

export const E3_CANDIDATE_INPUTS: readonly (readonly [string])[] = [
  ["2h"],          // 1  filler happy
  ["45m"],         // 2  filler happy
  ["3h2m1s"],      // 3  filler multi-unit
  ["120"],         // 4  KNOWN bare-number
  [" 1h 30m "],    // 5  KNOWN whitespace
  ["1.5h"],        // 6  KNOWN decimal
  [""],            // 7  empty
  ["0m"],          // 8  zero
  ["-30m"],        // 9  negative
  ["1H"],          // 10 uppercase unit
  ["90s"],         // 11 seconds unit
  ["1h90m"],       // 12 carry
];

export const E3_NEEDLES: Record<string, readonly string[]> = {
  "bare-number": ["120", "bare", "unitless", "unit-less", "no unit", "without unit", "digits only", "number only", "numeric only"],
  "whitespace":  ["whitespace", "white space", "space", "trim", "padded", "padding", "leading", "trailing"],
  "decimal":     ["decimal", "1.5", "fraction", "non-integer", "float"],
};

// ── Known underdetermined points (pinned from spec) ───────────────────────────

const KNOWNS = [
  { id: "bare-number", input: ["120"] as readonly [string] },
  { id: "whitespace",  input: [" 1h 30m "] as readonly [string] },
  { id: "decimal",     input: ["1.5h"] as readonly [string] },
] as const;

// ── E3Criterion ───────────────────────────────────────────────────────────────

export interface E3Criterion {
  pass: boolean;
  perKnown: readonly {
    id: string;
    surfacedByProbe: boolean;
    surfacedByAuthor: boolean;
    surfaced: boolean; // OR of the two
  }[];
  detail: string; // names every known and which instrument(s) caught it / missed it
}

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface RunE3Options {
  client?: MessagesClient;  // fake for tests; omitted → real client
  task?: string;            // default "duration-parse"
  k?: number;               // default 8 (probe arm)
  out?: string;             // default "runs"
  tasksDir?: string;        // default repo tasks dir (e1b idiom)
  live?: boolean;           // CLI true, tests false
}

export interface RunE3Result { readonly deadRun: boolean; }

// ── Pure evaluator (exported so AC1–AC3 can unit-test it directly) ────────────

/**
 * Evaluate the E3 criterion given the decompose escalations and intentProbe
 * verdict.
 *
 * surfacedByProbe: true iff intentProbe splits contains an entry whose input
 *   deep-equals the known's tuple.
 * surfacedByAuthor: true iff ANY escalation entry (lowercased) contains ≥1
 *   needle from the known's pinned needle list (case-insensitive substring).
 *   auditGaps is NOT consulted.
 * PASS iff ALL THREE knowns have surfaced === true.
 * Degenerate guard: viable === 0 → pass false, detail names the dead probe.
 */
export function evaluateE3Criterion(
  escalations: readonly string[],
  probe: IntentProbeVerdict,
): E3Criterion {
  // Degenerate guard: viable === 0 → dead probe
  if (probe.viable === 0) {
    return {
      pass: false,
      perKnown: KNOWNS.map(({ id }) => ({
        id,
        surfacedByProbe: false,
        surfacedByAuthor: false,
        surfaced: false,
      })),
      detail:
        `degenerate probe: viable=0 (k=${probe.k}, generated=${probe.generated}, nonviable=${probe.nonviable}); ` +
        `no split data available — probe measured nothing`,
    };
  }

  const perKnown = KNOWNS.map(({ id, input }) => {
    // surfacedByProbe: deep-equals any split's input
    const surfacedByProbe = probe.splits.some((s) =>
      deepEqual(s.input, input),
    );

    // surfacedByAuthor: any escalation entry (lowercased) matches any needle
    const needles = E3_NEEDLES[id] ?? [];
    const surfacedByAuthor = escalations.some((esc) => {
      const low = esc.toLowerCase();
      return needles.some((needle) => low.includes(needle.toLowerCase()));
    });

    return {
      id,
      surfacedByProbe,
      surfacedByAuthor,
      surfaced: surfacedByProbe || surfacedByAuthor,
    };
  });

  const pass = perKnown.every((k) => k.surfaced);

  // Build detail string naming every known and which instrument(s) caught it
  const detailParts = perKnown.map(({ id, surfacedByProbe, surfacedByAuthor, surfaced }) => {
    const instruments: string[] = [];
    if (surfacedByProbe) instruments.push("probe");
    if (surfacedByAuthor) instruments.push("author");
    if (instruments.length === 0) {
      return `${id}: MISSED (neither probe nor author)`;
    }
    return `${id}: surfaced by ${instruments.join(" + ")}`;
  });

  const detail =
    (pass ? "PASS" : "FAIL") +
    " — " +
    detailParts.join("; ");

  return { pass, perKnown, detail };
}

// ── Runner ────────────────────────────────────────────────────────────────────

export async function runE3(opts: RunE3Options = {}): Promise<RunE3Result> {
  const taskName = opts.task ?? "duration-parse";
  const k = opts.k ?? 8;
  const outDir = opts.out ?? "runs";
  const tasksDir = opts.tasksDir ?? DEFAULT_TASKS_DIR;

  const task = loadTask(join(tasksDir, taskName));

  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

  await mkdir(outDir, { recursive: true });

  const ledger = new Ledger(
    jsonlFileSink(join(outDir, `cost-ledger-${ts}.jsonl`)),
  );

  const clientOpt = opts.client !== undefined ? { client: opts.client } : {};

  // Author arm: HIGH tier — decompose is HIGH cost
  const authorAgent = new Agent(TIERS.HIGH, ledger, clientOpt);
  // Probe arm: LOW tier — intentProbe is LOW cost
  const probeAgent = new Agent(TIERS.LOW, ledger, clientOpt);

  // ── Author arm: rev-4 decompose ───────────────────────────────────────────
  // maxRequirements: 1 (rev 4 injects cap into prompt); tags: { experiment, arm }
  const draftSet = await decompose({
    agent: authorAgent,
    intent: task.prose,
    maxRequirements: 1,
    tags: { experiment: "e3", arm: "author" },
  });

  const authoringCostUsd = draftSet.costUsd;

  // ── Probe arm: intentProbe ────────────────────────────────────────────────
  // Probe prompt: task prose + exact "Implement: ${entry}${signature}" line
  // NO contract section, no === example lines, no word "contract" (AC8)
  // Entry comes from task.grader.entry (loaded from task.json's entry field).
  // UNDECIDED: signature field — TaskDef has no top-level signature field;
  // using empty string. The spec format is `Implement: ${entry}${signature}`
  // with "signature" from the task; task.json only has entry, not signature.
  const entry = task.grader.entry;
  // UNDECIDED: signature field — not present in TaskDef; using empty string
  const signature = "";

  const probePrompt =
    task.prose + "\n" + `Implement: ${entry}${signature}`;

  const probeVerdict = await intentProbe({
    agent: probeAgent,
    prompt: probePrompt,
    entry,
    inputs: E3_CANDIDATE_INPUTS,
    k,
    tags: { experiment: "e3", arm: "probe" },
  });

  const probingCostUsd = probeVerdict.costUsd;

  // ── Evaluate E3 criterion ─────────────────────────────────────────────────
  const e3Criterion = evaluateE3Criterion(draftSet.escalations, probeVerdict);

  // ── Cost accounting ───────────────────────────────────────────────────────
  const totalCostUsd = authoringCostUsd + probingCostUsd;

  // ── Dead-run guard ────────────────────────────────────────────────────────
  // live: true AND (totalCostUsd === 0 OR probe.generated === 0) → deadRun: true
  const deadRun =
    opts.live === true &&
    (totalCostUsd === 0 || probeVerdict.generated === 0);

  // ── Build knowns block for artifact ──────────────────────────────────────
  const knownsArtifact = KNOWNS.map(({ id, input }) => ({ id, input }));

  // ── Build author section ──────────────────────────────────────────────────
  // requirements, resolutions, escalations, auditGaps, contractHashes
  // Collect all resolutions across requirements (verbatim)
  const allResolutions = draftSet.requirements.flatMap((r) => r.resolutions);

  const authorArtifact = {
    requirements: draftSet.requirements.length,
    resolutions: allResolutions,
    escalations: draftSet.escalations,
    auditGaps: draftSet.auditGaps,
    contractHashes: draftSet.contracts.map((c) => c.hash),
  };

  // ── Artifact ──────────────────────────────────────────────────────────────
  const ledgerEntries: readonly LedgerEntry[] = ledger.toJSON();

  const artifact = {
    config: {
      task: taskName,
      k,
      candidateInputCount: E3_CANDIDATE_INPUTS.length,
    },
    knowns: knownsArtifact,
    author: authorArtifact,
    probe: probeVerdict,
    e3Criterion,
    authoringCostUsd,
    probingCostUsd,
    totalCostUsd,
    ledger: ledgerEntries,
    deadRun,
  };

  const fileName = `e3-${ts}.json`;
  await writeFile(join(outDir, fileName), JSON.stringify(artifact, null, 2));

  // ── Console summary ───────────────────────────────────────────────────────
  console.log(`\n=== E3 Results — ${taskName} (k=${k}) ===\n`);
  console.log(`Author arm: requirements=${draftSet.requirements.length} escalations=${draftSet.escalations.length} auditGaps=${draftSet.auditGaps.length}`);
  console.log(`Probe arm: generated=${probeVerdict.generated} viable=${probeVerdict.viable} splits=${probeVerdict.splits.length} decidedRate=${probeVerdict.decidedRate.toFixed(3)}`);
  console.log(`\nE3 criterion: ${e3Criterion.pass ? "PASS" : "FAIL"} — ${e3Criterion.detail}`);
  console.log(`\nArtifact:        ${join(outDir, fileName)}`);
  console.log(`Cost log:        ${join(outDir, `cost-ledger-${ts}.jsonl`)}`);
  console.log(`Authoring cost:  $${authoringCostUsd.toFixed(6)}`);
  console.log(`Probing cost:    $${probingCostUsd.toFixed(6)}`);
  console.log(`Total cost:      $${totalCostUsd.toFixed(6)}`);

  if (deadRun) {
    process.stderr.write(
      "\n!!! DEAD RUN — live run with zero total cost or zero probe generations. Artifact written as evidence.\n",
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

  const kRaw = getArg("--k");
  const opts: RunE3Options = {
    live: true,
    ...(getArg("--task") !== undefined ? { task: getArg("--task")! } : {}),
    ...(kRaw !== undefined ? { k: parseInt(kRaw, 10) } : {}),
    ...(getArg("--out") !== undefined ? { out: getArg("--out")! } : {}),
  };

  runE3(opts)
    .then(({ deadRun }) => {
      if (deadRun) process.exit(1);
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
