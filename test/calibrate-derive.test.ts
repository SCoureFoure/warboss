/** AC5–AC9 — see specs/gate-judge-derive.spec.md (rev 1). Offline, fake client. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import type { MessagesClient } from "../src/agent.ts";
import { loadTask } from "../src/experiment/task.ts";
import {
  runDeriveCalibration,
  ANCHORS,
  type DeriveCalibrationOptions,
} from "../src/experiment/calibrate-derive.ts";

const _thisDir = dirname(fileURLToPath(import.meta.url));
const DURATION_DIR = join(_thisDir, "..", "tasks", "duration-parse");

type Config = "A" | "B" | "C";

const task = loadTask(DURATION_DIR);

/**
 * The three config prompts differ deterministically: B carries the grader
 * contract hash, C the partial contract hash, A is bare prose. Route fake
 * responses on that, keeping an independent call counter per config so the
 * script is stable under the runner's concurrency.
 */
function configOf(prompt: string): Config {
  if (prompt.includes(task.grader.hash)) return "B";
  if (prompt.includes(task.partial.hash)) return "C";
  return "A";
}

function scriptedClient(
  script: (config: Config, callIndex: number) => string,
  opts?: {
    capture?: (body: Anthropic.MessageCreateParamsNonStreaming) => void;
    zeroTokens?: boolean;
  },
): MessagesClient {
  const counters: Record<Config, number> = { A: 0, B: 0, C: 0 };
  return {
    messages: {
      create: async (body) => {
        opts?.capture?.(body);
        const prompt =
          typeof body.messages[0]?.content === "string"
            ? body.messages[0].content
            : "";
        const config = configOf(prompt);
        const text = script(config, counters[config]++);
        return {
          content: [{ type: "text", text }],
          usage: opts?.zeroTokens
            ? { input_tokens: 0, output_tokens: 0 }
            : { input_tokens: 100, output_tokens: 50 },
        } as unknown as Anthropic.Message;
      },
    },
  };
}

interface ConfigResultShape {
  decidedCount: number;
  decidedRate: number;
  malformedCount: number;
  undecided: string[];
}

interface ArtifactShape {
  config: { n: number; configs: string[]; task: string };
  results: Record<string, ConfigResultShape>;
  anchors: Record<string, number>;
  ledger: Array<{ costUsd: number }>;
  totalCostUsd: number;
  deadRun: boolean;
}

// Helper: run the calibration into a temp out dir and read back the artifact.
// The out dir also holds the durable cost-ledger JSONL, so select explicitly.
async function runAndReadArtifact(
  opts: DeriveCalibrationOptions,
): Promise<{ artifact: ArtifactShape; outDir: string; files: string[] }> {
  const outDir = await mkdtemp(join(tmpdir(), "derive-cal-test-"));
  await runDeriveCalibration({ ...opts, out: outDir });
  const files = await readdir(outDir);
  const artifactName = files.find(
    (f) => f.startsWith("derive-calibration-") && f.endsWith(".json"),
  );
  assert.ok(artifactName, "results artifact written");
  const raw = await readFile(join(outDir, artifactName), "utf8");
  return { artifact: JSON.parse(raw) as ArtifactShape, outDir, files };
}

// ── AC5 ─────────────────────────────────────────────────────────────────────

test("AC5 partition & rates: A 12 DECIDED + 8 UNDECIDED, B all DECIDED, C all UNDECIDED", async () => {
  const client = scriptedClient((config, callIndex) => {
    if (config === "A") {
      return callIndex < 12 ? "DECIDED" : "UNDECIDED\n- qA";
    }
    if (config === "B") return "DECIDED";
    return 'UNDECIDED\n- "90" hole';
  });

  const { artifact } = await runAndReadArtifact({ n: 20, client });

  assert.equal(artifact.results["A"]!.decidedRate, 0.6);
  assert.equal(artifact.results["A"]!.decidedCount, 12);
  assert.equal(artifact.results["A"]!.undecided.length, 8);
  assert.ok(artifact.results["A"]!.undecided.every((u) => u === "qA"));

  assert.equal(artifact.results["B"]!.decidedRate, 1);
  assert.equal(artifact.results["B"]!.undecided.length, 0);

  assert.equal(artifact.results["C"]!.decidedRate, 0);
  assert.equal(artifact.results["C"]!.undecided.length, 20);
  assert.ok(artifact.results["C"]!.undecided.every((u) => u === '"90" hole'));
});

// ── AC6 ─────────────────────────────────────────────────────────────────────

test("AC6 malformed is not decided: gibberish config → malformedCount = n, decidedCount 0, decidedRate 0", async () => {
  const client = scriptedClient((config) => {
    if (config === "A") return "I think this task looks fine to me."; // no DECIDED/UNDECIDED first line
    return "DECIDED";
  });

  const { artifact } = await runAndReadArtifact({ n: 5, client });

  assert.equal(artifact.results["A"]!.malformedCount, 5);
  assert.equal(artifact.results["A"]!.decidedCount, 0);
  assert.equal(artifact.results["A"]!.decidedRate, 0);

  // The well-formed configs are unaffected.
  assert.equal(artifact.results["B"]!.malformedCount, 0);
  assert.equal(artifact.results["B"]!.decidedRate, 1);
});

// ── AC7 ─────────────────────────────────────────────────────────────────────

test("AC7 calibration prompts are r2 prompts: B carries the frozen contract hash line, A is exactly task.prose", async () => {
  const captured: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client = scriptedClient(() => "DECIDED", {
    capture: (body) => captured.push(body),
  });

  await runAndReadArtifact({ n: 1, client });

  assert.equal(captured.length, 3); // one derive call per config
  const prompts = captured.map((b) =>
    typeof b.messages[0]?.content === "string" ? b.messages[0].content : "",
  );

  const promptB = prompts.find((p) => p.includes(task.grader.hash));
  assert.ok(promptB, "a prompt carrying the grader hash was dispatched");
  assert.ok(
    promptB.includes(`Frozen contract (hash ${task.grader.hash})`),
    "config B prompt contains the frozen contract hash line",
  );

  const promptA = prompts.find(
    (p) => !p.includes(task.grader.hash) && !p.includes(task.partial.hash),
  );
  assert.ok(promptA, "a prose-only prompt was dispatched");
  assert.equal(promptA, task.prose);
});

// ── AC8 ─────────────────────────────────────────────────────────────────────

test("AC8 artifact structure & cost: one artifact, exact keys, pinned anchors, ledger-sum cost, one jsonl", async () => {
  const client = scriptedClient(() => "DECIDED");
  const { artifact, files } = await runAndReadArtifact({ n: 2, client });

  // Exactly one results artifact under out/ (the .jsonl cost log is separate).
  const artifacts = files.filter(
    (f) => f.startsWith("derive-calibration-") && f.endsWith(".json"),
  );
  assert.equal(artifacts.length, 1);

  // Exactly one cost-ledger jsonl sidecar.
  const jsonls = files.filter(
    (f) => f.startsWith("cost-ledger-") && f.endsWith(".jsonl"),
  );
  assert.equal(jsonls.length, 1);

  assert.deepEqual(artifact.config, {
    n: 2,
    configs: ["A", "B", "C"],
    task: "duration-parse",
  });

  // Results keyed exactly A/B/C.
  assert.deepEqual(Object.keys(artifact.results), ["A", "B", "C"]);
  for (const config of ["A", "B", "C"]) {
    const r = artifact.results[config]!;
    assert.equal(typeof r.decidedCount, "number");
    assert.equal(typeof r.decidedRate, "number");
    assert.equal(typeof r.malformedCount, "number");
    assert.ok(Array.isArray(r.undecided));
  }

  // Anchors equal the pinned constants, verbatim.
  assert.deepEqual(artifact.anchors, { A: 0.6, B: 0.967, C: 0.967 });
  assert.deepEqual(artifact.anchors, ANCHORS);

  // totalCostUsd equals the ledger sum; 3 configs × n=2 = 6 metered calls.
  assert.ok(Array.isArray(artifact.ledger));
  assert.equal(artifact.ledger.length, 6);
  const ledgerSum = artifact.ledger.reduce((s, e) => s + e.costUsd, 0);
  assert.ok(Math.abs(artifact.totalCostUsd - ledgerSum) < 1e-12);
  assert.ok(artifact.totalCostUsd > 0);
});

// ── AC9 ─────────────────────────────────────────────────────────────────────

test("AC9 dead-run guard: live=true + zero-cost ledger → deadRun:true stamped, nonzero-exit path", async () => {
  const client = scriptedClient(() => "DECIDED", { zeroTokens: true });
  const outDir = await mkdtemp(join(tmpdir(), "derive-cal-dr-"));
  const result = await runDeriveCalibration({ n: 1, client, live: true, out: outDir });

  // The CLI exits nonzero exactly when runDeriveCalibration reports deadRun.
  assert.equal(result.deadRun, true);

  const files = await readdir(outDir);
  const artifactName = files.find(
    (f) => f.startsWith("derive-calibration-") && f.endsWith(".json"),
  );
  assert.ok(artifactName);
  const artifact = JSON.parse(
    await readFile(join(outDir, artifactName), "utf8"),
  ) as ArtifactShape;
  assert.equal(artifact.deadRun, true);
});

test("AC9 dead-run guard: live=false + same zero-cost fixture → no dead-run stamp", async () => {
  const client = scriptedClient(() => "DECIDED", { zeroTokens: true });
  const outDir = await mkdtemp(join(tmpdir(), "derive-cal-dr-"));
  const result = await runDeriveCalibration({ n: 1, client, live: false, out: outDir });

  assert.equal(result.deadRun, false);

  const files = await readdir(outDir);
  const artifactName = files.find(
    (f) => f.startsWith("derive-calibration-") && f.endsWith(".json"),
  );
  assert.ok(artifactName);
  const artifact = JSON.parse(
    await readFile(join(outDir, artifactName), "utf8"),
  ) as ArtifactShape;
  assert.equal(artifact.deadRun, false);
});
