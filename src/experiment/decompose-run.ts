/**
 * decompose-run — live decomposition runner: intent → artifact.
 *
 * The thin CLI shell around `decompose` + `admit` (src/warboss.ts): takes
 * Leader's intent, drives the warboss pipeline once, and persists everything a
 * human needs to judge the output. Orchestration only — ALL pipeline
 * semantics live in `specs/warboss-decomposition.spec.md`; this module never
 * re-validates or re-parses model output.
 *
 * Spec: specs/decompose-run.spec.md (rev 2) + specs/kickback-pipeline.spec.md (rev 1).
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, type MessagesClient } from "../agent.ts";
import { Ledger, type LedgerEntry } from "../cost.ts";
import { jsonlFileSink } from "../ledger-sink.ts";
import { TIERS } from "../models.ts";
import {
  decompose,
  admit,
  type RequirementDraft,
} from "../warboss.ts";
import type { Contract } from "../contract.ts";
import {
  buildAnswerQueue,
  loadOwnerAnswers,
  renderDecisionBlock,
  type AnswerQueue,
} from "../kickback.ts";

export interface DecomposeRunOptions {
  client?: MessagesClient; // fake for tests; omitted → real client
  intent: string;
  context?: string;
  maxRequirements?: number; // passthrough, default per warboss spec
  out?: string; // default "runs"
  live?: boolean; // CLI true, tests false
  // Phase-3 re-author mode (both-or-neither; mutually exclusive with intent from CLI)
  reauthorFrom?: string; // path to the SOURCE decompose artifact
  answers?: string;      // path to the hand-filled answers-needed-*.json
}

export interface DecomposeArtifact {
  readonly intent: string;
  readonly context: string | null;
  readonly requirements: readonly RequirementDraft[];
  readonly contracts: readonly { id: string; hash: string; version: string }[];
  readonly auditGaps: readonly string[];
  readonly escalations: readonly string[];
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
  // Phase-3 provenance (OMITTED on first-pass runs — only present on re-author artifacts)
  readonly reauthorOf?: string;
  readonly answersPath?: string;
}

export interface RunDecomposeResult {
  readonly deadRun: boolean;
  readonly artifactPath: string;
  readonly artifact: DecomposeArtifact;
  readonly answerQueuePath?: string; // present only when a queue was written (phase-1)
}

const RUN_TAGS = { run: "decompose-live" } as const;
const REAUTHOR_TAGS = { run: "reauthor-live" } as const;

export async function runDecompose(
  opts: DecomposeRunOptions,
): Promise<RunDecomposeResult> {
  const outDir = opts.out ?? "runs";

  // Compute ts once — shared by both the artifact filename and the sidecar filename (AC7).
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

  // mkdir before the sink first flushes (jsonlFileSink calls mkdirSync internally,
  // but the artifact mkdir is deferred; do it here so the sink directory exists).
  await mkdir(outDir, { recursive: true });

  const ledger = new Ledger(
    jsonlFileSink(join(outDir, `cost-ledger-${ts}.jsonl`)),
  );
  const clientOpt = opts.client !== undefined ? { client: opts.client } : {};

  // ── Determine intent + context ─────────────────────────────────────────────
  // In re-author mode, intent + context come from the source artifact.
  let effectiveIntent: string;
  let effectiveContext: string | undefined;
  let queue: AnswerQueue | undefined;
  let reauthorProvenance: { reauthorOf: string; answersPath: string } | undefined;

  if (opts.reauthorFrom !== undefined && opts.answers !== undefined) {
    // Phase-3: load source artifact + validated queue
    let sourceRaw: string;
    try {
      sourceRaw = await readFile(opts.reauthorFrom, "utf8");
    } catch (err) {
      throw new Error(
        `runDecompose (re-author): cannot read source artifact "${opts.reauthorFrom}": ${(err as Error).message}`,
      );
    }
    const sourceArtifact = JSON.parse(sourceRaw) as DecomposeArtifact;
    effectiveIntent = sourceArtifact.intent;

    // Load + validate the owner answers (throws before any model call if invalid)
    queue = await loadOwnerAnswers(opts.answers);

    // Provenance cross-check: queue.artifact basename must match reauthorFrom basename
    const queueArtifactBase = basename(queue.artifact);
    const reauthorFromBase = basename(opts.reauthorFrom);
    if (queueArtifactBase !== reauthorFromBase) {
      throw new Error(
        `runDecompose (re-author): provenance mismatch — queue answers "${opts.answers}" was built for artifact "${queue.artifact}" (basename "${queueArtifactBase}") but re-author is using "${opts.reauthorFrom}" (basename "${reauthorFromBase}"). Ensure you are using the queue that corresponds to this artifact.`,
      );
    }

    // Build re-author context: sourceContext + (if non-empty) "\n\n" + renderDecisionBlock(decisions)
    const sourceContext = sourceArtifact.context ?? "";
    const decisionBlock = renderDecisionBlock(queue.answers.map((a) => a.decision));
    if (sourceContext === "") {
      effectiveContext = decisionBlock;
    } else {
      effectiveContext = sourceContext + "\n\n" + decisionBlock;
    }

    reauthorProvenance = {
      reauthorOf: opts.reauthorFrom,
      answersPath: opts.answers,
    };
  } else {
    // Normal first-pass mode
    effectiveIntent = opts.intent;
    effectiveContext = opts.context;
  }

  const decomposeAgent = new Agent(TIERS.HIGH, ledger, clientOpt);
  // rev 4: probe agent for admission (LOW tier); every contract will kick back with
  // the no-battery question until probe-battery authoring exists (a follow-on leg).
  const probeAgent = new Agent(TIERS.LOW, ledger, clientOpt);

  const runTags = reauthorProvenance !== undefined ? { ...REAUTHOR_TAGS } : { ...RUN_TAGS };

  const draftSet = await decompose({
    agent: decomposeAgent,
    intent: effectiveIntent,
    ...(effectiveContext !== undefined ? { context: effectiveContext } : {}),
    ...(opts.maxRequirements !== undefined
      ? { maxRequirements: opts.maxRequirements }
      : {}),
    tags: runTags,
  });

  // rev 4: probe-only admission; empty probes map → every contract kicks back
  // with the no-battery question (deliberate — probe-battery authoring is a follow-on leg).
  const admission = await admit(draftSet, {
    probe: {
      agent: probeAgent,
      probes: new Map(),
    },
    tags: runTags,
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
    intent: effectiveIntent,
    context: effectiveContext ?? null,
    requirements: draftSet.requirements,
    contracts: draftSet.contracts.map((c, i) => ({
      id: draftSet.requirements[i]?.id ?? "",
      hash: c.hash,
      version: c.version,
    })),
    auditGaps: draftSet.auditGaps,
    escalations: draftSet.escalations,
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
    // Healthy runs omit the deadRun key; only dead runs stamp "deadRun": true.
    ...(deadRun ? { deadRun: true as const } : {}),
    // Re-author provenance (OMITTED on first-pass runs — only present on re-author artifacts).
    ...(reauthorProvenance !== undefined
      ? {
          reauthorOf: reauthorProvenance.reauthorOf,
          answersPath: reauthorProvenance.answersPath,
        }
      : {}),
  };

  const artifactPath = join(outDir, `decompose-${ts}.json`);

  await writeFile(artifactPath, JSON.stringify(artifact, null, 2));

  // ── Phase 1: emit answer queue when escalations are present ───────────────
  let answerQueuePath: string | undefined;
  if (draftSet.escalations.length > 0) {
    const answerQueue = buildAnswerQueue({
      intent: effectiveIntent,
      context: effectiveContext ?? null,
      artifactPath,
      escalations: draftSet.escalations,
    });
    answerQueuePath = join(outDir, `answers-needed-${ts}.json`);
    await writeFile(answerQueuePath, JSON.stringify(answerQueue, null, 2));
    console.log(
      `escalations: ${draftSet.escalations.length} → ${answerQueuePath} (fill 'decision' for each, then re-run with --reauthor-from ${artifactPath} --answers ${answerQueuePath})`,
    );
  }

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

  return {
    deadRun,
    artifactPath,
    artifact,
    ...(answerQueuePath !== undefined ? { answerQueuePath } : {}),
  };
}

/**
 * Parse CLI flags into run options. Exactly one of `--intent` /
 * `--intent-file` must be given; both or neither → descriptive error before
 * any model call. `--intent-file` is read verbatim (UTF-8, no trimming
 * beyond a final-newline strip).
 *
 * Phase-3 re-author flags: `--reauthor-from` and `--answers` must be given
 * together (both-or-neither). Re-author mode is mutually exclusive with
 * `--intent` / `--intent-file`.
 *
 * `--context`, `--max-requirements`, `--out` remain honored in both modes.
 */
export function parseCliArgs(argv: readonly string[]): DecomposeRunOptions {
  const getArg = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx !== -1 && argv[idx + 1] !== undefined ? argv[idx + 1] : undefined;
  };

  const intentInline = getArg("--intent");
  const intentFile = getArg("--intent-file");
  const reauthorFrom = getArg("--reauthor-from");
  const answers = getArg("--answers");

  // Phase-3 both-or-neither guard
  if (reauthorFrom !== undefined && answers === undefined) {
    throw new Error(
      "--reauthor-from requires --answers to be given as well; both must be provided together.",
    );
  }
  if (answers !== undefined && reauthorFrom === undefined) {
    throw new Error(
      "--answers requires --reauthor-from to be given as well; both must be provided together.",
    );
  }

  // Re-author mode is mutually exclusive with --intent / --intent-file
  if (reauthorFrom !== undefined) {
    if (intentInline !== undefined || intentFile !== undefined) {
      throw new Error(
        "--reauthor-from is mutually exclusive with --intent / --intent-file. In re-author mode, intent comes from the source artifact.",
      );
    }

    const context = getArg("--context");
    const maxRequirementsRaw = getArg("--max-requirements");
    const out = getArg("--out");

    let maxRequirements: number | undefined;
    if (maxRequirementsRaw !== undefined) {
      const parsed = parseInt(maxRequirementsRaw, 10);
      if (Number.isNaN(parsed) || parsed < 1) {
        throw new Error(
          `--max-requirements must be a positive integer; got: ${JSON.stringify(maxRequirementsRaw)}`,
        );
      }
      maxRequirements = parsed;
    }

    // In re-author mode, intent is a placeholder (will be loaded from source artifact in runDecompose)
    // answers is always defined here (guarded above); cast to appease exactOptionalPropertyTypes.
    return {
      intent: "", // populated from source artifact in runDecompose
      ...(context !== undefined ? { context } : {}),
      ...(maxRequirements !== undefined ? { maxRequirements } : {}),
      ...(out !== undefined ? { out } : {}),
      reauthorFrom: reauthorFrom as string,
      answers: answers as string,
    };
  }

  // Normal first-pass mode: exactly one of --intent / --intent-file
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
      : // Strip a single trailing newline, treating \r\n as one unit (canonical).
        readFileSync(intentFile!, "utf8").replace(/\r?\n$/, "");

  const context = getArg("--context");
  const maxRequirementsRaw = getArg("--max-requirements");
  const out = getArg("--out");

  let maxRequirements: number | undefined;
  if (maxRequirementsRaw !== undefined) {
    const parsed = parseInt(maxRequirementsRaw, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      throw new Error(
        `--max-requirements must be a positive integer; got: ${JSON.stringify(maxRequirementsRaw)}`,
      );
    }
    maxRequirements = parsed;
  }

  return {
    intent,
    ...(context !== undefined ? { context } : {}),
    ...(maxRequirements !== undefined ? { maxRequirements } : {}),
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
