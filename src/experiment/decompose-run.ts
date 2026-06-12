/**
 * decompose-run — live decomposition runner: intent → artifact.
 *
 * The thin CLI shell around `decompose` + `admit` (src/warboss.ts): takes
 * God's intent, drives the warboss pipeline once, and persists everything a
 * human needs to judge the output. Orchestration only — ALL pipeline
 * semantics live in `specs/warboss-decomposition.spec.md`; this module never
 * re-validates or re-parses model output.
 *
 * Spec: specs/decompose-run.spec.md (rev 1).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, type MessagesClient } from "../agent.ts";
import { Ledger, type LedgerEntry } from "../cost.ts";
import { TIERS } from "../models.ts";
import {
  decompose,
  admit,
  type RequirementDraft,
} from "../warboss.ts";
import type { Contract } from "../contract.ts";

export interface DecomposeRunOptions {
  client?: MessagesClient; // fake for tests; omitted → real client
  intent: string;
  context?: string;
  maxRequirements?: number; // passthrough, default per warboss spec
  out?: string; // default "runs"
  live?: boolean; // CLI true, tests false
}

export interface DecomposeArtifact {
  readonly intent: string;
  readonly context: string | null;
  readonly requirements: readonly RequirementDraft[];
  readonly contracts: readonly { id: string; hash: string; version: string }[];
  readonly auditGaps: readonly string[];
  readonly admission: {
    readonly admitted: readonly string[];
    readonly kickedBack: readonly {
      hash: string;
      id: string;
      questions: readonly string[];
    }[];
  };
  readonly ledger: readonly LedgerEntry[];
  readonly totalCostUsd: number;
  readonly deadRun?: true;
}

export interface RunDecomposeResult {
  readonly deadRun: boolean;
  readonly artifactPath: string;
  readonly artifact: DecomposeArtifact;
}

const RUN_TAGS = { run: "decompose-live" } as const;

export async function runDecompose(
  opts: DecomposeRunOptions,
): Promise<RunDecomposeResult> {
  const outDir = opts.out ?? "runs";
  const ledger = new Ledger();
  const clientOpt = opts.client !== undefined ? { client: opts.client } : {};

  const decomposeAgent = new Agent(TIERS.HIGH, ledger, clientOpt);
  const judgeAgent = new Agent(TIERS.LOW, ledger, clientOpt);

  const draftSet = await decompose({
    agent: decomposeAgent,
    intent: opts.intent,
    ...(opts.context !== undefined ? { context: opts.context } : {}),
    ...(opts.maxRequirements !== undefined
      ? { maxRequirements: opts.maxRequirements }
      : {}),
    tags: { ...RUN_TAGS },
  });

  const admission = await admit(draftSet, {
    judgeAgent,
    tags: { ...RUN_TAGS },
  });

  // contracts[i] is frozen from requirements[i] (warboss stage 6 order);
  // identity lookup recovers the source requirement id for a contract.
  const idOf = (contract: Contract): string => {
    const i = draftSet.contracts.indexOf(contract);
    return draftSet.requirements[i]?.id ?? "";
  };

  const totalCostUsd = draftSet.costUsd + admission.costUsd;

  const deadRun =
    opts.live === true &&
    (ledger.totals().costUsd === 0 || draftSet.requirements.length === 0);

  const artifact: DecomposeArtifact = {
    intent: opts.intent,
    context: opts.context ?? null,
    requirements: draftSet.requirements,
    contracts: draftSet.contracts.map((c, i) => ({
      id: draftSet.requirements[i]?.id ?? "",
      hash: c.hash,
      version: c.version,
    })),
    auditGaps: draftSet.auditGaps,
    admission: {
      admitted: admission.admitted.map((c) => c.hash),
      kickedBack: admission.kickedBack.map((kb) => ({
        hash: kb.contract.hash,
        id: idOf(kb.contract),
        questions: kb.questions,
      })),
    },
    ledger: ledger.toJSON(),
    totalCostUsd,
    // UNDECIDED: spec pins `"deadRun": true` stamped on dead runs only; the
    // artifact example carries no deadRun key, so healthy runs omit it.
    ...(deadRun ? { deadRun: true as const } : {}),
  };

  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const artifactPath = join(outDir, `decompose-${ts}.json`);

  await mkdir(outDir, { recursive: true });
  await writeFile(artifactPath, JSON.stringify(artifact, null, 2));

  // Human-facing summary — pinned shape, nothing else; the artifact is the record.
  const kickedBackByContract = new Map(
    admission.kickedBack.map((kb) => [kb.contract, kb] as const),
  );
  draftSet.requirements.forEach((req, i) => {
    const contract = draftSet.contracts[i];
    const kb = contract !== undefined ? kickedBackByContract.get(contract) : undefined;
    const status = kb !== undefined ? "kicked-back" : "admitted";
    const nQuestions = kb !== undefined ? kb.questions.length : 0;
    console.log(`${req.id}: ${status} (${nQuestions} questions)`);
  });
  console.log(`auditGaps: ${draftSet.auditGaps.length}`);
  console.log(`total: $${totalCostUsd.toFixed(4)}`);

  if (deadRun) {
    console.error(
      "!!! DEAD RUN — live run with zero ledger cost or zero requirements. Artifact written as evidence.",
    );
  }

  return { deadRun, artifactPath, artifact };
}

/**
 * Parse CLI flags into run options. Exactly one of `--intent` /
 * `--intent-file` must be given; both or neither → descriptive error before
 * any model call. `--intent-file` is read verbatim (UTF-8, no trimming
 * beyond a final-newline strip).
 */
export function parseCliArgs(argv: readonly string[]): DecomposeRunOptions {
  const getArg = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx !== -1 && argv[idx + 1] !== undefined ? argv[idx + 1] : undefined;
  };

  const intentInline = getArg("--intent");
  const intentFile = getArg("--intent-file");

  if (intentInline !== undefined && intentFile !== undefined) {
    throw new Error(
      "Exactly one of --intent / --intent-file must be given; both were provided.",
    );
  }
  if (intentInline === undefined && intentFile === undefined) {
    throw new Error(
      "Exactly one of --intent / --intent-file must be given; neither was provided.",
    );
  }

  const intent =
    intentInline !== undefined
      ? intentInline
      : // UNDECIDED: "a final-newline strip" — CRLF endings treated as one
        // final newline (\r\n stripped as a unit).
        readFileSync(intentFile!, "utf8").replace(/\r?\n$/, "");

  const context = getArg("--context");
  const maxRequirementsRaw = getArg("--max-requirements");
  const out = getArg("--out");

  return {
    intent,
    ...(context !== undefined ? { context } : {}),
    ...(maxRequirementsRaw !== undefined
      ? { maxRequirements: parseInt(maxRequirementsRaw, 10) }
      : {}),
    ...(out !== undefined ? { out } : {}),
  };
}

// CLI entry
if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  let cliOpts: DecomposeRunOptions;
  try {
    cliOpts = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  runDecompose({ ...cliOpts, live: true })
    .then(({ deadRun }) => {
      if (deadRun) process.exit(1);
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
