/** AC1–AC13 — see specs/e1a-harness.spec.md */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import type { MessagesClient } from "../src/agent.ts";
import { loadTask, auditNoContamination } from "../src/experiment/task.ts";
import { E1A_SYSTEM, buildPrompt, armSpec } from "../src/experiment/arms.ts";
import {
  cluster,
  splits,
  analyzeArm,
  evaluateCriteria,
  type RunRecord,
  type ArmAnalysis,
} from "../src/experiment/analysis.ts";
import { runE1a } from "../src/experiment/e1a.ts";
import { Contract } from "../src/contract.ts";
import { judge, ContractHashMismatch } from "../src/runner.ts";
import { TIERS } from "../src/models.ts";

const _thisDir = dirname(fileURLToPath(import.meta.url));
const TASKS_DIR = join(_thisDir, "..", "tasks");
const DURATION_DIR = join(TASKS_DIR, "duration-parse");

// Reference parseDuration impl — passes all 12 hidden battery cases.
const CORRECT_IMPL = `
function parseDuration(s) {
  s = s.trim();
  if (/^-/.test(s)) throw new Error('invalid');
  if (/^\\d+(\\.\\d+)?$/.test(s)) return parseFloat(s);
  let total = 0;
  const re = /(\\d+(?:\\.\\d+)?)\\s*([hms])/gi;
  let match;
  let found = false;
  while ((match = re.exec(s)) !== null) {
    found = true;
    const val = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 'h') total += val * 3600;
    else if (unit === 'm') total += val * 60;
    else if (unit === 's') total += val;
  }
  if (!found) throw new Error('invalid duration: ' + s);
  return total;
}
`.trim();

function fakeClient(
  text: string,
  capture?: (body: Anthropic.MessageCreateParamsNonStreaming) => void,
): MessagesClient {
  return {
    messages: {
      create: async (body) => {
        capture?.(body);
        return {
          content: [{ type: "text", text }],
          usage: { input_tokens: 100, output_tokens: 50 },
        } as unknown as Anthropic.Message;
      },
    },
  };
}

function fakeClientThrowsThenSucceeds(
  text: string,
): { client: MessagesClient; calls: number[] } {
  const calls: number[] = [];
  let attempt = 0;
  return {
    calls,
    client: {
      messages: {
        create: async (body) => {
          void body;
          const n = attempt++;
          calls.push(n);
          if (n === 0) throw new Error("transient error");
          return {
            content: [{ type: "text", text }],
            usage: { input_tokens: 100, output_tokens: 50 },
          } as unknown as Anthropic.Message;
        },
      },
    },
  };
}

function alwaysThrowsClient(): MessagesClient {
  return {
    messages: {
      create: async () => {
        throw new Error("always fails");
      },
    },
  };
}

// Helper: run e1a and read the results artifact from the out dir. The out dir
// also holds the durable cost-ledger JSONL, so select the artifact explicitly.
async function runAndReadArtifact(
  opts: Parameters<typeof runE1a>[0],
): Promise<{ artifact: Record<string, unknown>; outDir: string; files: string[] }> {
  const outDir = await mkdtemp(join(tmpdir(), "e1a-test-"));
  await runE1a({ ...opts, out: outDir, tasksDir: TASKS_DIR });
  const files = await readdir(outDir);
  const artifactName = files.find((f) => f.startsWith("e1a-") && f.endsWith(".json"));
  assert.ok(artifactName, "results artifact written");
  const raw = await readFile(join(outDir, artifactName), "utf8");
  return { artifact: JSON.parse(raw) as Record<string, unknown>, outDir, files };
}

// ── AC1 ─────────────────────────────────────────────────────────────────────

test("AC1 loadTask returns frozen grader (5 examples), partial (2 examples, different hash), 12 hidden", () => {
  const task = loadTask(DURATION_DIR);

  assert.equal(task.grader.examples.length, 5);
  assert.ok(Object.isFrozen(task.grader));
  assert.equal(task.grader.hash, Contract.computeHash(task.grader));

  assert.equal(task.partial.examples.length, 2);
  assert.notEqual(task.grader.hash, task.partial.hash);

  // Partial examples are exactly the armCSubset
  const partialNames = task.partial.examples.map((e) => e.name);
  assert.deepEqual(partialNames, task.armCSubset);

  assert.equal(task.hidden.length, 12);

  // Hash is deterministic across two loads
  const task2 = loadTask(DURATION_DIR);
  assert.equal(task.grader.hash, task2.grader.hash);
});

// ── AC2 ─────────────────────────────────────────────────────────────────────

test("AC2 validation: dangling armCSubset name throws", async () => {
  const dir = await mkdtemp(join(tmpdir(), "e1a-val-"));
  await writeFile(join(dir, "requirement.md"), "req");
  await writeFile(
    join(dir, "task.json"),
    JSON.stringify({
      name: "t",
      entry: "f",
      version: "1",
      examples: [{ name: "ok", input: [1], expected: 1 }],
      armCSubset: ["no-such-example"],
    }),
  );
  await writeFile(join(dir, "hidden-battery.json"), "[]");
  assert.throws(
    () => loadTask(dir),
    (e: unknown) =>
      e instanceof Error && e.message.includes("no-such-example"),
  );
});

test("AC2 validation: dangling coveredBy ref throws", async () => {
  const dir = await mkdtemp(join(tmpdir(), "e1a-val-"));
  await writeFile(join(dir, "requirement.md"), "req");
  await writeFile(
    join(dir, "task.json"),
    JSON.stringify({
      name: "t",
      entry: "f",
      version: "1",
      examples: [{ name: "ok", input: [1], expected: 1 }],
      armCSubset: [],
    }),
  );
  await writeFile(
    join(dir, "hidden-battery.json"),
    JSON.stringify([
      { name: "h1", input: [2], expected: 2, coveredBy: ["no-such-example"] },
    ]),
  );
  assert.throws(
    () => loadTask(dir),
    (e: unknown) =>
      e instanceof Error && e.message.includes("no-such-example"),
  );
});

test("AC2 validation: duplicate example names throws", async () => {
  const dir = await mkdtemp(join(tmpdir(), "e1a-val-"));
  await writeFile(join(dir, "requirement.md"), "req");
  await writeFile(
    join(dir, "task.json"),
    JSON.stringify({
      name: "t",
      entry: "f",
      version: "1",
      examples: [
        { name: "dup", input: [1], expected: 1 },
        { name: "dup", input: [2], expected: 2 },
      ],
      armCSubset: [],
    }),
  );
  await writeFile(join(dir, "hidden-battery.json"), "[]");
  assert.throws(
    () => loadTask(dir),
    (e: unknown) => e instanceof Error && e.message.includes("duplicate"),
  );
});

test("AC2 validation: empty examples array throws", async () => {
  const dir = await mkdtemp(join(tmpdir(), "e1a-val-"));
  await writeFile(join(dir, "requirement.md"), "req");
  await writeFile(
    join(dir, "task.json"),
    JSON.stringify({
      name: "t",
      entry: "f",
      version: "1",
      examples: [],
      armCSubset: [],
    }),
  );
  await writeFile(join(dir, "hidden-battery.json"), "[]");
  assert.throws(
    () => loadTask(dir),
    (e: unknown) => e instanceof Error && e.message.includes("empty"),
  );
});

// ── AC3 ─────────────────────────────────────────────────────────────────────

test("AC3 prompt building: arms A and D yield identical prose-only prompts", () => {
  const task = loadTask(DURATION_DIR);
  const pA = buildPrompt("A", task);
  const pD = buildPrompt("D", task);
  assert.equal(pA, task.prose);
  assert.equal(pA, pD);
  assert.ok(!pA.includes("Frozen contract"));
  assert.ok(!pA.includes("==="));
});

test("AC3 prompt building: arm B contains all examples and grader hash", () => {
  const task = loadTask(DURATION_DIR);
  const pB = buildPrompt("B", task);
  assert.ok(pB.includes(`Frozen contract (hash ${task.grader.hash})`));
  // All 5 canonical examples appear as function calls
  assert.ok(pB.includes('parseDuration("1h30m") === 5400'));
  assert.ok(pB.includes('parseDuration("90m") === 5400'));
  assert.ok(pB.includes('parseDuration("45s") === 45'));
  assert.ok(pB.includes('parseDuration("90") === 90'));
  assert.ok(pB.includes('parseDuration("2h15m30s") === 8130'));
});

test("AC3 prompt building: arm C contains only subset examples and partial hash", () => {
  const task = loadTask(DURATION_DIR);
  const pC = buildPrompt("C", task);
  assert.ok(pC.includes(`Frozen contract (hash ${task.partial.hash})`));
  assert.ok(!pC.includes(task.grader.hash));
  // Subset examples present
  assert.ok(pC.includes('parseDuration("1h30m") === 5400'));
  assert.ok(pC.includes('parseDuration("45s") === 45'));
  // Non-subset examples absent
  assert.ok(!pC.includes('parseDuration("90m")'));
  assert.ok(!pC.includes('parseDuration("90")'));
  assert.ok(!pC.includes('parseDuration("2h15m30s")'));
});

// ── AC4 ─────────────────────────────────────────────────────────────────────

test("AC4 contamination audit throws when hidden input appears in a prompt", () => {
  const task = loadTask(DURATION_DIR);
  const contaminated = `${task.prose}\nparseDuration("1h90m") === 9000`;
  assert.throws(
    () => auditNoContamination([contaminated], task.hidden),
    (e: unknown) =>
      e instanceof Error &&
      e.message.includes("carry-minutes") &&
      e.message.includes('"1h90m"'),
  );
});

test("AC4 contamination audit passes for real duration-parse prompts", () => {
  const task = loadTask(DURATION_DIR);
  const prompts = (["A", "B", "C", "D"] as const).map((arm) =>
    buildPrompt(arm, task),
  );
  assert.doesNotThrow(() => auditNoContamination(prompts, task.hidden));
});

// ── AC5 ─────────────────────────────────────────────────────────────────────

test("AC5 single-run record: fenced correct impl → 12-length vector, score 1, cost metered", async () => {
  const fencedImpl = "```js\n" + CORRECT_IMPL + "\n```";
  const { artifact } = await runAndReadArtifact({
    n: 1,
    arms: ["A"],
    client: fakeClient(fencedImpl),
  });

  const runs = artifact["runs"] as RunRecord[];
  assert.equal(runs.length, 1);
  const r = runs[0]!;
  assert.equal(r.arm, "A");
  assert.equal(r.index, 0);
  assert.equal(r.generationFailed, false);
  assert.equal(r.vector.length, 12);
  assert.ok((r.vector as boolean[]).every((v) => v === true));
  assert.equal(r.score, 1);
  assert.ok(r.costUsd > 0);
  assert.ok(r.wallMs >= 0);

  const ledger = artifact["ledger"] as Array<{ tags?: { arm?: string; task?: string; index?: number } }>;
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0]?.tags?.arm, "A");
  assert.equal(ledger[0]?.tags?.task, "duration-parse");
  assert.equal(ledger[0]?.tags?.index, 0);
});

// ── AC6 ─────────────────────────────────────────────────────────────────────

test("AC6 generation failure: empty response → generationFailed, all-false 12-length vector", async () => {
  const { artifact } = await runAndReadArtifact({
    n: 1,
    arms: ["A"],
    client: fakeClient(""),
  });

  const runs = artifact["runs"] as RunRecord[];
  assert.equal(runs.length, 1);
  const r = runs[0]!;
  assert.equal(r.generationFailed, true);
  assert.equal(r.vector.length, 12);
  assert.ok((r.vector as boolean[]).every((v) => v === false));
  assert.equal(r.score, 0);
});

// ── AC7 ─────────────────────────────────────────────────────────────────────

test("AC7 cluster: 3 distinct vectors sized 3/2/1", () => {
  const makeRecord = (vec: boolean[]): RunRecord => ({
    arm: "A",
    index: 0,
    model: TIERS.LOW.id,
    code: undefined,
    generationFailed: false,
    vector: vec,
    score: 0,
    coveredScore: 0,
    uncoveredScore: 0,
    costUsd: 0,
    wallMs: 0,
  });

  const vecA = [true, false, true];
  const vecB = [false, true, false];
  const vecC = [true, true, true];

  const records: RunRecord[] = [
    makeRecord(vecA), makeRecord(vecA), makeRecord(vecA),
    makeRecord(vecB), makeRecord(vecB),
    makeRecord(vecC),
  ];

  const result = cluster(records);
  assert.equal(result.count, 3);
  assert.deepEqual(result.sizes, [3, 2, 1]);
});

// ── AC8 ─────────────────────────────────────────────────────────────────────

test("AC8 splits: full-contract covered/uncovered indices and coveredByC indices", () => {
  const task = loadTask(DURATION_DIR);
  const s = splits(task.hidden, task.armCSubset);

  // 5 cases have non-empty coveredBy
  assert.equal(s.coveredIndices.length, 5);
  // 7 cases have empty coveredBy
  assert.equal(s.uncoveredIndices.length, 7);
  // coveredByC: cases covered by ["basic-hm", "seconds-only"]
  // plain-hours (basic-hm), plain-minutes (basic-hm|bare-minutes), zero-seconds (seconds-only)
  assert.equal(s.coveredByCIndices.length, 3);
  const coveredByCNames = s.coveredByCIndices.map((i) => task.hidden[i]!.name);
  assert.ok(coveredByCNames.includes("plain-hours"));
  assert.ok(coveredByCNames.includes("plain-minutes"));
  assert.ok(coveredByCNames.includes("zero-seconds"));
});

test("AC8 splits: pass rates compute correctly over synthetic vectors", () => {
  const task = loadTask(DURATION_DIR);
  const s = splits(task.hidden, task.armCSubset);
  const allIndices = task.hidden.map((_, i) => i);

  // All-pass record
  const allPass: RunRecord = {
    arm: "A", index: 0, model: TIERS.LOW.id, code: undefined,
    generationFailed: false,
    vector: new Array(12).fill(true) as boolean[],
    score: 1, coveredScore: 1, uncoveredScore: 1, costUsd: 0, wallMs: 0,
  };
  const a1 = analyzeArm("A", [allPass], s, allIndices);
  assert.equal(a1.coveredPassRate, 1);
  assert.equal(a1.uncoveredPassRate, 1);

  // All-fail record
  const allFail: RunRecord = {
    ...allPass,
    vector: new Array(12).fill(false) as boolean[],
    score: 0, coveredScore: 0, uncoveredScore: 0,
  };
  const a2 = analyzeArm("A", [allFail], s, allIndices);
  assert.equal(a2.coveredPassRate, 0);
  assert.equal(a2.uncoveredPassRate, 0);
});

// ── AC9 ─────────────────────────────────────────────────────────────────────

test("AC9 criteria evaluation: synthetic fixtures drive PASS and FAIL per criterion", () => {
  const makeAnalysis = (
    arm: string,
    clusterCount: number,
    covPass: number,
    notCovByCPass: number,
  ): ArmAnalysis => ({
    arm,
    clusterResult: { count: clusterCount, sizes: new Array(clusterCount).fill(1) },
    meanPassRate: 0,
    coveredPassRate: covPass,
    uncoveredPassRate: 0,
    notCoveredByCPassRate: notCovByCPass,
    totalCostUsd: 0,
  });

  // Criterion 1 PASS: clusters(B)=2 ≤ 2, clusters(A)=5 ≥ 5
  const pass1 = evaluateCriteria(
    makeAnalysis("A", 5, 0.5, 0.5),
    makeAnalysis("B", 2, 0.9, 0),
    makeAnalysis("C", 3, 0, 0.4),
  );
  assert.ok(pass1.criterion1.pass);

  // Criterion 1 FAIL: clusters(B)=3 > 2
  const fail1 = evaluateCriteria(
    makeAnalysis("A", 5, 0.5, 0.5),
    makeAnalysis("B", 3, 0.9, 0),
    makeAnalysis("C", 3, 0, 0.4),
  );
  assert.ok(!fail1.criterion1.pass);

  // Criterion 2 PASS: B.covered - A.covered = 0.4 ≥ 0.15
  const pass2 = evaluateCriteria(
    makeAnalysis("A", 5, 0.5, 0.5),
    makeAnalysis("B", 2, 0.9, 0),
    makeAnalysis("C", 3, 0, 0.4),
  );
  assert.ok(pass2.criterion2.pass);

  // Criterion 2 FAIL: B.covered - A.covered = 0.05 < 0.15
  const fail2 = evaluateCriteria(
    makeAnalysis("A", 5, 0.85, 0.5),
    makeAnalysis("B", 2, 0.90, 0),
    makeAnalysis("C", 3, 0, 0.4),
  );
  assert.ok(!fail2.criterion2.pass);

  // Criterion 3 PASS: C.notCovByC=0.3 ≤ A.notCovByC=0.5
  const pass3 = evaluateCriteria(
    makeAnalysis("A", 5, 0.5, 0.5),
    makeAnalysis("B", 2, 0.9, 0),
    makeAnalysis("C", 3, 0, 0.3),
  );
  assert.ok(pass3.criterion3.pass);

  // Criterion 3 FAIL: C.notCovByC=0.7 > A.notCovByC=0.5
  const fail3 = evaluateCriteria(
    makeAnalysis("A", 5, 0.5, 0.5),
    makeAnalysis("B", 2, 0.9, 0),
    makeAnalysis("C", 3, 0, 0.7),
  );
  assert.ok(!fail3.criterion3.pass);

  // Criterion 4 always deferred
  assert.ok(!pass1.criterion4.pass);
  assert.equal(pass1.criterion4.detail, "deferred (E1b)");
});

// ── AC10 ────────────────────────────────────────────────────────────────────

test("AC10 arm/model mapping: correct model ids, system=E1A_SYSTEM, max_tokens=2048, no thinking", async () => {
  const captured: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client = fakeClient("```js\nfunction parseDuration(s){return 0;}\n```", (b) =>
    captured.push(b),
  );

  await runAndReadArtifact({ n: 1, arms: ["A", "B", "C", "D"], client });

  assert.equal(captured.length, 4);

  // Arms A, B, C → LOW; D → HIGH
  const byArm = new Map<string, Anthropic.MessageCreateParamsNonStreaming>();
  // We can't directly know which body belongs to which arm from model alone;
  // instead verify the counts and that all calls use the right configuration.
  const lowCalls = captured.filter((b) => b.model === TIERS.LOW.id);
  const highCalls = captured.filter((b) => b.model === TIERS.HIGH.id);
  assert.equal(lowCalls.length, 3);
  assert.equal(highCalls.length, 1);
  void byArm;

  for (const b of captured) {
    assert.equal(b.system, E1A_SYSTEM);
    assert.equal(b.max_tokens, 2048);
    assert.ok(!("thinking" in b), "thinking key must not be present");
  }
});

// ── AC11 ────────────────────────────────────────────────────────────────────

test("AC11 results artifact has correct structure and cost consistency", async () => {
  const fencedImpl = "```js\n" + CORRECT_IMPL + "\n```";
  const { artifact } = await runAndReadArtifact({
    n: 1,
    arms: ["A", "B", "C", "D"],
    client: fakeClient(fencedImpl),
  });

  assert.equal((artifact["config"] as { n: number }).n, 1);
  assert.deepEqual((artifact["config"] as { arms: string[] }).arms, ["A", "B", "C", "D"]);
  assert.equal((artifact["config"] as { task: string }).task, "duration-parse");
  assert.equal(artifact["taskName"], "duration-parse");

  const task = loadTask(DURATION_DIR);
  assert.equal(artifact["graderHash"], task.grader.hash);

  const runs = artifact["runs"] as RunRecord[];
  assert.equal(runs.length, 4); // N=1 × 4 arms

  // Each run has the required fields
  for (const r of runs) {
    assert.ok(["A", "B", "C", "D"].includes(r.arm));
    assert.equal(r.index, 0);
    assert.equal(typeof r.model, "string");
    assert.equal(typeof r.generationFailed, "boolean");
    assert.equal(r.vector.length, 12);
    assert.equal(typeof r.score, "number");
    assert.equal(typeof r.coveredScore, "number");
    assert.equal(typeof r.uncoveredScore, "number");
    assert.equal(typeof r.costUsd, "number");
    assert.equal(typeof r.wallMs, "number");
  }

  // Analysis present for all 4 arms
  const analysis = artifact["analysis"] as Record<string, unknown>;
  for (const arm of ["A", "B", "C", "D"]) {
    assert.ok(arm in analysis);
  }

  // Criteria present with criterion4 deferred
  const criteria = artifact["criteria"] as {
    criterion4: { detail: string };
  };
  assert.equal(criteria.criterion4.detail, "deferred (E1b)");

  // Ledger present
  const ledger = artifact["ledger"] as Array<{ costUsd: number }>;
  assert.ok(Array.isArray(ledger));
  assert.equal(ledger.length, 4); // one entry per run

  // Cost consistency: run costs sum to ledger total
  const runTotal = runs.reduce((s, r) => s + r.costUsd, 0);
  const ledgerTotal = ledger.reduce((s, e) => s + e.costUsd, 0);
  assert.ok(Math.abs(runTotal - ledgerTotal) < 1e-9);
  assert.ok(Math.abs((artifact["totalCostUsd"] as number) - ledgerTotal) < 1e-9);
});

// ── AC12 ────────────────────────────────────────────────────────────────────

test("AC12 transient retry: throws once then succeeds → exactly one ledger entry", async () => {
  const fencedImpl = "```js\nfunction parseDuration(s){return 0;}\n```";
  const { client } = fakeClientThrowsThenSucceeds(fencedImpl);

  const { artifact } = await runAndReadArtifact({ n: 1, arms: ["A"], client });
  const runs = artifact["runs"] as RunRecord[];
  assert.equal(runs.length, 1);
  assert.equal(runs[0]!.generationFailed, false);

  const ledger = artifact["ledger"] as unknown[];
  assert.equal(ledger.length, 1);
});

test("AC12 transient retry: always throws → generationFailed, experiment completes", async () => {
  const { artifact } = await runAndReadArtifact({
    n: 1,
    arms: ["A"],
    client: alwaysThrowsClient(),
  });

  const runs = artifact["runs"] as RunRecord[];
  assert.equal(runs.length, 1);
  assert.equal(runs[0]!.generationFailed, true);

  const ledger = artifact["ledger"] as unknown[];
  assert.equal(ledger.length, 0);
});

// ── AC13 ────────────────────────────────────────────────────────────────────

test("AC13 mechanical freeze on grading path: own hash executes, wrong hash throws", () => {
  const task = loadTask(DURATION_DIR);
  const code = "function parseDuration(s) { return 0; }";

  // Own hash → no throw
  assert.doesNotThrow(() =>
    judge(task.grader, code, {
      battery: task.hidden,
      expectedHash: task.grader.hash,
    }),
  );

  // Wrong hash → throws ContractHashMismatch
  assert.throws(
    () =>
      judge(task.grader, code, {
        battery: task.hidden,
        expectedHash: "deadbeef",
      }),
    ContractHashMismatch,
  );
});

// ── AC14 (cost-ledger JSONL) ─────────────────────────────────────────────────

test("AC14 runE1a emits a cost-ledger JSONL, one parseable line per successful call", async () => {
  const fencedImpl = "```js\nfunction parseDuration(s){return 0;}\n```";
  // Fake client that also carries a request id, so the durable log is reconcilable.
  const client: MessagesClient = {
    messages: {
      create: async (body) => {
        void body;
        return {
          content: [{ type: "text", text: fencedImpl }],
          usage: { input_tokens: 100, output_tokens: 50 },
          _request_id: "req_e1a",
        } as unknown as Anthropic.Message;
      },
    },
  };

  const { outDir, files } = await runAndReadArtifact({
    n: 1,
    arms: ["A", "B"],
    client,
  });

  const ledgerName = files.find((f) => f.startsWith("cost-ledger-") && f.endsWith(".jsonl"));
  assert.ok(ledgerName, "cost-ledger JSONL written");

  const raw = await readFile(join(outDir, ledgerName), "utf8");
  const lines = raw.split("\n").filter((l) => l.length > 0);
  // 2 arms × N=1 = 2 successful calls → 2 lines.
  assert.equal(lines.length, 2);

  for (const line of lines) {
    const entry = JSON.parse(line) as {
      requestId?: string;
      modelLabel?: string;
      cost?: { totalCost: number };
      costUsd?: number;
    };
    assert.equal(entry.requestId, "req_e1a");
    assert.equal(typeof entry.modelLabel, "string");
    assert.ok(entry.cost && typeof entry.cost.totalCost === "number");
    assert.equal(entry.cost.totalCost, entry.costUsd);
  }
});
