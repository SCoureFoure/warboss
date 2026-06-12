/** AC1–AC5 — see specs/gate-calibration.spec.md (rev 1). Offline, fake client. */
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
  runGateCalibration,
  ANCHORS,
  type GateCalibrationOptions,
} from "../src/experiment/calibrate-gate.ts";

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
  readyCount: number;
  readyRate: number;
  malformedCount: number;
  questions: string[];
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
  opts: GateCalibrationOptions,
): Promise<{ artifact: ArtifactShape; outDir: string; files: string[] }> {
  const outDir = await mkdtemp(join(tmpdir(), "gate-cal-test-"));
  await runGateCalibration({ ...opts, out: outDir });
  const files = await readdir(outDir);
  const artifactName = files.find(
    (f) => f.startsWith("gate-calibration-") && f.endsWith(".json"),
  );
  assert.ok(artifactName, "results artifact written");
  const raw = await readFile(join(outDir, artifactName), "utf8");
  return { artifact: JSON.parse(raw) as ArtifactShape, outDir, files };
}

// ── AC1 ─────────────────────────────────────────────────────────────────────

test("AC1 partition & rates: A 12 READY + 8 NOT READY, B all READY, C all NOT READY", async () => {
  const client = scriptedClient((config, callIndex) => {
    if (config === "A") {
      return callIndex < 12 ? "READY" : "NOT READY\n- q1";
    }
    if (config === "B") return "READY";
    return "NOT READY\n- holeq";
  });

  const { artifact } = await runAndReadArtifact({ n: 20, client });

  assert.equal(artifact.results["A"]!.readyRate, 0.6);
  assert.equal(artifact.results["A"]!.readyCount, 12);
  assert.equal(artifact.results["A"]!.questions.length, 8);
  assert.ok(artifact.results["A"]!.questions.every((q) => q === "q1"));

  assert.equal(artifact.results["B"]!.readyRate, 1);
  assert.equal(artifact.results["B"]!.questions.length, 0);

  assert.equal(artifact.results["C"]!.readyRate, 0);
  assert.equal(artifact.results["C"]!.questions.length, 20);
  assert.ok(artifact.results["C"]!.questions.every((q) => q === "holeq"));
});

// ── AC2 ─────────────────────────────────────────────────────────────────────

test("AC2 malformed is not ready: gibberish config → malformedCount = n, readyCount 0, readyRate 0", async () => {
  const client = scriptedClient((config) => {
    if (config === "A") return "I think this task looks fine to me."; // no READY/NOT READY first line
    return "READY";
  });

  const { artifact } = await runAndReadArtifact({ n: 5, client });

  assert.equal(artifact.results["A"]!.malformedCount, 5);
  assert.equal(artifact.results["A"]!.readyCount, 0);
  assert.equal(artifact.results["A"]!.readyRate, 0);

  // The well-formed configs are unaffected.
  assert.equal(artifact.results["B"]!.malformedCount, 0);
  assert.equal(artifact.results["B"]!.readyRate, 1);
});

// ── AC3 ─────────────────────────────────────────────────────────────────────

test("AC3 artifact structure & cost: one artifact, exact keys, pinned anchors, ledger-sum cost", async () => {
  const client = scriptedClient(() => "READY");
  const { artifact, files } = await runAndReadArtifact({ n: 2, client });

  // Exactly one results artifact under out/ (the .jsonl cost log is separate).
  const artifacts = files.filter(
    (f) => f.startsWith("gate-calibration-") && f.endsWith(".json"),
  );
  assert.equal(artifacts.length, 1);

  assert.deepEqual(artifact.config, {
    n: 2,
    configs: ["A", "B", "C"],
    task: "duration-parse",
  });

  // Results keyed exactly A/B/C.
  assert.deepEqual(Object.keys(artifact.results), ["A", "B", "C"]);
  for (const config of ["A", "B", "C"]) {
    const r = artifact.results[config]!;
    assert.equal(typeof r.readyCount, "number");
    assert.equal(typeof r.readyRate, "number");
    assert.equal(typeof r.malformedCount, "number");
    assert.ok(Array.isArray(r.questions));
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

// ── AC4 ─────────────────────────────────────────────────────────────────────

test("AC4 prompts are r2 prompts: B carries the frozen contract hash line, A is exactly task.prose", async () => {
  const captured: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client = scriptedClient(() => "READY", {
    capture: (body) => captured.push(body),
  });

  await runAndReadArtifact({ n: 1, client });

  assert.equal(captured.length, 3); // one judge call per config
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

// ── AC5 ─────────────────────────────────────────────────────────────────────

test("AC5 dead-run guard: live=true + zero-cost ledger → deadRun:true stamped, nonzero-exit path", async () => {
  const client = scriptedClient(() => "READY", { zeroTokens: true });
  const outDir = await mkdtemp(join(tmpdir(), "gate-cal-dr-"));
  const result = await runGateCalibration({ n: 1, client, live: true, out: outDir });

  // The CLI exits nonzero exactly when runGateCalibration reports deadRun.
  assert.equal(result.deadRun, true);

  const files = await readdir(outDir);
  const artifactName = files.find(
    (f) => f.startsWith("gate-calibration-") && f.endsWith(".json"),
  );
  assert.ok(artifactName);
  const artifact = JSON.parse(
    await readFile(join(outDir, artifactName), "utf8"),
  ) as ArtifactShape;
  assert.equal(artifact.deadRun, true);
});

test("AC5 dead-run guard: live=false + same zero-cost fixture → no dead-run stamp", async () => {
  const client = scriptedClient(() => "READY", { zeroTokens: true });
  const outDir = await mkdtemp(join(tmpdir(), "gate-cal-dr-"));
  const result = await runGateCalibration({ n: 1, client, live: false, out: outDir });

  assert.equal(result.deadRun, false);

  const files = await readdir(outDir);
  const artifactName = files.find(
    (f) => f.startsWith("gate-calibration-") && f.endsWith(".json"),
  );
  assert.ok(artifactName);
  const artifact = JSON.parse(
    await readFile(join(outDir, artifactName), "utf8"),
  ) as ArtifactShape;
  assert.equal(artifact.deadRun, false);
});
