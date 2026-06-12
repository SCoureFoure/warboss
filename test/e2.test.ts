/** AC1–AC10 — see specs/e2-contract-authorship.spec.md */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import type { MessagesClient } from "../src/agent.ts";
import { Contract } from "../src/contract.ts";
import { loadTask } from "../src/experiment/task.ts";
import type { FeedbackArmAnalysis } from "../src/experiment/e1b.ts";
import type { DecomposeArtifact } from "../src/experiment/decompose-run.ts";
import {
  runE2,
  reconstructWarbossContract,
  computeCoverageSplit,
  evaluateE2Criterion,
  hasErrorExample,
  type E2SessionRecord,
  type RunE2Result,
} from "../src/experiment/e2.ts";
import { TIERS } from "../src/models.ts";

const _thisDir = dirname(fileURLToPath(import.meta.url));
const TASKS_DIR = join(_thisDir, "..", "tasks");
const DURATION_DIR = join(TASKS_DIR, "duration-parse");

// Reference impl defining `parseDuration` — passes all 12 hidden cases.
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

// Same logic but under a DIFFERENT entry name (the warboss entry-name case).
const CORRECT_IMPL_ALT_ENTRY = CORRECT_IMPL.replace(
  /parseDuration/g,
  "parseDurationSeconds",
);

function fence(code: string): string {
  return "```js\n" + code + "\n```";
}

// Fake client: returns a fixed text for every call. (capture optional)
function fixedClient(
  text: string,
  capture?: (body: Anthropic.MessageCreateParamsNonStreaming, idx: number) => void,
): MessagesClient {
  let calls = 0;
  return {
    messages: {
      create: async (body) => {
        const idx = calls++;
        capture?.(body, idx);
        return {
          content: [{ type: "text", text }],
          usage: { input_tokens: 100, output_tokens: 50 },
        } as unknown as Anthropic.Message;
      },
    },
  };
}

// Fake client that picks its response by the entry name present in the prompt:
// the human prompt names `parseDuration`, the warboss prompt names the alt entry.
function entryAwareClient(
  warbossEntry: string,
  capture?: (body: Anthropic.MessageCreateParamsNonStreaming) => void,
): MessagesClient {
  return {
    messages: {
      create: async (body) => {
        capture?.(body);
        const prompt = body.messages[0]!.content as string;
        const text = prompt.includes(warbossEntry)
          ? fence(CORRECT_IMPL_ALT_ENTRY.replace(/parseDurationSeconds/g, warbossEntry))
          : fence(CORRECT_IMPL);
        return {
          content: [{ type: "text", text }],
          usage: { input_tokens: 100, output_tokens: 50 },
        } as unknown as Anthropic.Message;
      },
    },
  };
}

// Build a warboss contract from the duration-parse examples + one error example.
function warbossContractWithError(entry = "parseDuration"): Contract {
  return Contract.freeze({
    requirement: "duration-parse",
    entry,
    version: "1",
    examples: [
      { name: "basic-hm", input: ["1h30m"], expected: 5400 },
      { name: "bare-minutes", input: ["90m"], expected: 5400 },
      { name: "seconds-only", input: ["45s"], expected: 45 },
      { name: "bare-number", input: ["90"], expected: 90 },
      { name: "full-hms", input: ["2h15m30s"], expected: 8130 },
      // input "abc" is NOT in the hidden battery (throws-inputs there are "-1h",
      // "1x") → contamination audit stays clean; CORRECT_IMPL throws on it.
      { name: "rejects-garbage", input: ["abc"], expected: "<throws>", throws: true },
    ],
  });
}

// Build a decompose-artifact fixture with exactly one requirement whose re-frozen
// hash matches the recorded contracts[0].hash.
function makeArtifact(
  contract: Contract,
  totalCostUsd = 0.26,
  reqCount = 1,
): DecomposeArtifact {
  const requirements = Array.from({ length: reqCount }, (_, i) => ({
    id: `R${i + 1}`,
    requirement: contract.requirement,
    entry: contract.entry,
    signature: `${contract.entry}(s: string): number`,
    examples: [...contract.examples],
  }));
  return {
    intent: "parse a duration string",
    context: null,
    requirements,
    contracts: Array.from({ length: reqCount }, (_, i) => ({
      id: `R${i + 1}`,
      hash: contract.hash,
      version: contract.version,
    })),
    auditGaps: [],
    admission: { admitted: [contract.hash], kickedBack: [] },
    ledger: [],
    totalCostUsd,
  };
}

async function runAndRead(
  opts: Parameters<typeof runE2>[0],
): Promise<{
  artifact: Record<string, unknown>;
  outDir: string;
  files: string[];
  result: RunE2Result;
}> {
  const outDir = await mkdtemp(join(tmpdir(), "e2-test-"));
  const result = await runE2({ ...opts, out: outDir, tasksDir: TASKS_DIR });
  const files = await readdir(outDir);
  const name = files.find((f) => f.startsWith("e2-") && f.endsWith(".json"));
  assert.ok(name, "results artifact written");
  const raw = await readFile(join(outDir, name), "utf8");
  return {
    artifact: JSON.parse(raw) as Record<string, unknown>,
    outDir,
    files,
    result,
  };
}

const synthAnalysis = (meanFinalHiddenScore: number): FeedbackArmAnalysis => ({
  feedbackArm: "x",
  greenRate: 1,
  meanAttempts: 1,
  stallRate: 0,
  meanFinalHiddenScore,
  meanCostPerGreenSession: 0.001,
  totalCostUsd: 0.001,
});

const synthSession = (
  source: "human" | "warboss",
  finalVector: boolean[],
): E2SessionRecord => ({
  source,
  sessionIndex: 0,
  model: TIERS.LOW.id,
  attempts: 1,
  stalled: false,
  green: true,
  finalCode: "x",
  finalVector,
  finalScore: finalVector.filter(Boolean).length / finalVector.length,
  totalCostUsd: 0.001,
  totalWallMs: 1,
});

// ── AC1 ───────────────────────────────────────────────────────────────────────

test("AC1 two sources, same loop: 2 sessions, both green, each ran against its own contract", async () => {
  const warboss = warbossContractWithError();
  const task = loadTask(DURATION_DIR);

  const captured: string[] = [];
  const client = fixedClient(fence(CORRECT_IMPL), (body) =>
    captured.push(body.messages[0]!.content as string),
  );

  const { artifact } = await runAndRead({ client, warbossContract: warboss, n: 1 });

  const sessions = artifact["sessions"] as E2SessionRecord[];
  assert.equal(sessions.length, 2);
  const human = sessions.find((s) => s.source === "human")!;
  const wb = sessions.find((s) => s.source === "warboss")!;
  assert.equal(human.green, true);
  assert.equal(wb.green, true);

  // The human prompt carries the grader hash; the warboss prompt carries the warboss hash.
  assert.ok(
    captured.some((p) => p.includes(task.grader.hash)),
    "a prompt contains the human grader hash",
  );
  assert.ok(
    captured.some((p) => p.includes(warboss.hash)),
    "a prompt contains the warboss contract hash",
  );

  // Ledger tagged with source + sessionIndex.
  const ledger = artifact["ledger"] as Array<{
    tags?: { source?: string; sessionIndex?: number };
  }>;
  assert.ok(ledger.length >= 2);
  for (const e of ledger) {
    assert.ok(e.tags?.source !== undefined, "tag: source");
    assert.ok(e.tags?.sessionIndex !== undefined, "tag: sessionIndex");
  }
});

// ── AC2 ───────────────────────────────────────────────────────────────────────

test("AC2 warboss reconstruction from artifact: hash matches recorded contracts[0].hash", async () => {
  const warboss = warbossContractWithError();
  const artifactFixture = makeArtifact(warboss);

  // Direct reconstruction.
  const reconstructed = reconstructWarbossContract(artifactFixture);
  assert.equal(reconstructed.hash, warboss.hash);

  // Through runE2 via a written artifact file.
  const outDir = await mkdtemp(join(tmpdir(), "e2-art-"));
  const artPath = join(outDir, "decompose-fixture.json");
  await writeFile(artPath, JSON.stringify(artifactFixture, null, 2));

  const result = await runE2({
    client: fixedClient(fence(CORRECT_IMPL)),
    warbossArtifact: artPath,
    n: 1,
    out: outDir,
    tasksDir: TASKS_DIR,
  });
  assert.equal(result.deadRun, false);

  const files = await readdir(outDir);
  const name = files.find((f) => f.startsWith("e2-") && f.endsWith(".json"))!;
  const artifact = JSON.parse(await readFile(join(outDir, name), "utf8")) as Record<string, unknown>;
  const contracts = artifact["contracts"] as { warboss: { hash: string } };
  assert.equal(contracts.warboss.hash, warboss.hash);
});

test("AC2 variant: artifact with 2 requirements → throws naming the count, before any model call", async () => {
  const warboss = warbossContractWithError();
  const twoReq = makeArtifact(warboss, 0.26, 2);
  const outDir = await mkdtemp(join(tmpdir(), "e2-2req-"));
  const artPath = join(outDir, "decompose-2req.json");
  await writeFile(artPath, JSON.stringify(twoReq, null, 2));

  let calls = 0;
  const countingClient: MessagesClient = {
    messages: {
      create: async () => {
        calls++;
        return {
          content: [{ type: "text", text: fence(CORRECT_IMPL) }],
          usage: { input_tokens: 1, output_tokens: 1 },
        } as unknown as Anthropic.Message;
      },
    },
  };

  await assert.rejects(
    runE2({ client: countingClient, warbossArtifact: artPath, n: 1, out: outDir, tasksDir: TASKS_DIR }),
    /exactly one requirement.*has 2|has 2/i,
  );
  assert.equal(calls, 0, "no model call before the requirement-count check");
});

// ── AC3 ───────────────────────────────────────────────────────────────────────

test("AC3 hash integrity guard: recorded hash ≠ re-frozen hash → throws naming the mismatch, before any session", async () => {
  const warboss = warbossContractWithError();
  const bad = makeArtifact(warboss);
  // Corrupt the recorded hash.
  const corrupted: DecomposeArtifact = {
    ...bad,
    contracts: [{ id: "R1", hash: "deadbeef".repeat(8), version: "1" }],
  };

  assert.throws(
    () => reconstructWarbossContract(corrupted),
    /hash mismatch/i,
  );

  // Through runE2: no model call.
  const outDir = await mkdtemp(join(tmpdir(), "e2-hash-"));
  const artPath = join(outDir, "decompose-bad.json");
  await writeFile(artPath, JSON.stringify(corrupted, null, 2));
  let calls = 0;
  const countingClient: MessagesClient = {
    messages: {
      create: async () => {
        calls++;
        return {
          content: [{ type: "text", text: fence(CORRECT_IMPL) }],
          usage: { input_tokens: 1, output_tokens: 1 },
        } as unknown as Anthropic.Message;
      },
    },
  };
  await assert.rejects(
    runE2({ client: countingClient, warbossArtifact: artPath, n: 1, out: outDir, tasksDir: TASKS_DIR }),
    /hash mismatch/i,
  );
  assert.equal(calls, 0, "no model call before the hash check");
});

// ── AC4 ───────────────────────────────────────────────────────────────────────

test("AC4 hidden scored through each source's own entry (entry names differ)", async () => {
  const WARBOSS_ENTRY = "parseDurationSeconds";
  const warboss = warbossContractWithError(WARBOSS_ENTRY);
  const client = entryAwareClient(WARBOSS_ENTRY);

  const { artifact } = await runAndRead({ client, warbossContract: warboss, n: 1 });

  const sessions = artifact["sessions"] as E2SessionRecord[];
  const wb = sessions.find((s) => s.source === "warboss")!;
  const human = sessions.find((s) => s.source === "human")!;

  // The warboss session scored through its own entry → non-degenerate (all pass).
  assert.equal(wb.finalScore, 1, "warboss scored via its own entry, not forced all-false");
  assert.ok((wb.finalVector as boolean[]).every((v) => v === true));
  // The human session scores through parseDuration.
  assert.equal(human.finalScore, 1);
});

// ── AC5 ───────────────────────────────────────────────────────────────────────

test("AC5 coverage split: partitions by throws flag; per-source means equal hand-computed", () => {
  const task = loadTask(DURATION_DIR);
  // duration-parse hidden battery: indices 10,11 are throws:true (negative, garbage-unit).
  const hidden = task.hidden;
  const errorExpected = hidden
    .map((c, i) => (c.throws === true ? i : -1))
    .filter((i) => i >= 0);
  const happyExpected = hidden
    .map((c, i) => (c.throws === true ? -1 : i))
    .filter((i) => i >= 0);

  // Human: passes all happy, fails all error. Warboss: passes everything.
  const humanVec = hidden.map((c) => c.throws !== true);
  const warbossVec = hidden.map(() => true);

  const split = computeCoverageSplit(hidden, {
    human: [synthSession("human", humanVec)],
    warboss: [synthSession("warboss", warbossVec)],
  });

  assert.deepEqual([...split.happyIdx], happyExpected);
  assert.deepEqual([...split.errorIdx], errorExpected);

  // human: happy = 1.0, error = 0.0
  assert.equal(split.human.meanHappyScore, 1);
  assert.equal(split.human.meanErrorScore, 0);
  // warboss: happy = 1.0, error = 1.0
  assert.equal(split.warboss.meanHappyScore, 1);
  assert.equal(split.warboss.meanErrorScore, 1);
});

test("AC5 no error-path case in hidden battery → meanErrorScore: null", () => {
  const hidden = [
    { name: "a", input: ["x"], expected: 1, coveredBy: [] },
    { name: "b", input: ["y"], expected: 2, coveredBy: [] },
  ];
  const split = computeCoverageSplit(hidden, {
    human: [synthSession("human", [true, false])],
    warboss: [synthSession("warboss", [true, true])],
  });
  assert.deepEqual([...split.errorIdx], []);
  assert.equal(split.human.meanErrorScore, null);
  assert.equal(split.warboss.meanErrorScore, null);
  assert.equal(split.human.meanHappyScore, 0.5);
});

// ── AC6 ───────────────────────────────────────────────────────────────────────

test("AC6 static contract coverage: human false, warboss (with throws example) true", async () => {
  const task = loadTask(DURATION_DIR);
  assert.equal(hasErrorExample(task.grader), false);

  const warboss = warbossContractWithError();
  assert.equal(hasErrorExample(warboss), true);

  const { artifact } = await runAndRead({
    client: fixedClient(fence(CORRECT_IMPL)),
    warbossContract: warboss,
    n: 1,
  });
  const contracts = artifact["contracts"] as {
    human: { hasErrorExample: boolean };
    warboss: { hasErrorExample: boolean };
  };
  assert.equal(contracts.human.hasErrorExample, false);
  assert.equal(contracts.warboss.hasErrorExample, true);
});

// ── AC7 ───────────────────────────────────────────────────────────────────────

test("AC7 E2 criterion: 0.92 vs 1.0 → pass; 0.80 vs 1.0 → fail; human 0 → fail (degenerate)", () => {
  const pass = evaluateE2Criterion(synthAnalysis(1.0), synthAnalysis(0.92));
  assert.equal(pass.pass, true);
  assert.ok(pass.detail.includes("0.920") && pass.detail.includes("1.000"));

  const fail = evaluateE2Criterion(synthAnalysis(1.0), synthAnalysis(0.8));
  assert.equal(fail.pass, false);
  assert.ok(fail.detail.includes("0.800") && fail.detail.includes("1.000"));

  const degen = evaluateE2Criterion(synthAnalysis(0), synthAnalysis(0.5));
  assert.equal(degen.pass, false);
  assert.ok(/degenerate/i.test(degen.detail));
  assert.ok(degen.detail.includes("0.000") && degen.detail.includes("0.500"));
});

// ── AC8 ───────────────────────────────────────────────────────────────────────

test("AC8 contamination audit over both prompts: warboss example == a hidden input → throws, before any session", async () => {
  // Hidden case "carry-minutes" input is "1h90m"; put it into the warboss contract.
  const contaminated = Contract.freeze({
    requirement: "duration-parse",
    entry: "parseDuration",
    version: "1",
    examples: [
      { name: "leak", input: ["1h90m"], expected: 9000 },
    ],
  });

  let calls = 0;
  const countingClient: MessagesClient = {
    messages: {
      create: async () => {
        calls++;
        return {
          content: [{ type: "text", text: fence(CORRECT_IMPL) }],
          usage: { input_tokens: 1, output_tokens: 1 },
        } as unknown as Anthropic.Message;
      },
    },
  };

  await assert.rejects(
    runE2({
      client: countingClient,
      warbossContract: contaminated,
      n: 1,
      out: await mkdtemp(join(tmpdir(), "e2-leak-")),
      tasksDir: TASKS_DIR,
    }),
    /Contamination.*1h90m|carry-minutes/i,
  );
  assert.equal(calls, 0, "audit runs before any dispatch");
});

// ── AC9 ───────────────────────────────────────────────────────────────────────

test("AC9 artifact structure & costs (injected contract → authoringCostUsd 0)", async () => {
  const warboss = warbossContractWithError();
  const { artifact } = await runAndRead({
    client: fixedClient(fence(CORRECT_IMPL)),
    warbossContract: warboss,
    n: 1,
  });

  // config
  const config = artifact["config"] as { n: number; task: string; granularity: string; budget: number };
  assert.equal(config.n, 1);
  assert.equal(config.task, "duration-parse");

  // contracts keyed human/warboss
  const contracts = artifact["contracts"] as Record<string, unknown>;
  assert.ok("human" in contracts && "warboss" in contracts);

  // analysis, coverageSplit, e2Criterion present
  assert.ok("analysis" in artifact);
  assert.ok("coverageSplit" in artifact);
  assert.ok("e2Criterion" in artifact);

  // costs
  const ledger = artifact["ledger"] as Array<{ costUsd: number }>;
  const ledgerTotal = ledger.reduce((s, e) => s + e.costUsd, 0);
  assert.ok(Math.abs((artifact["grindingCostUsd"] as number) - ledgerTotal) < 1e-9);
  assert.equal(artifact["authoringCostUsd"], 0, "injected contract → authoring 0");
  assert.ok(Math.abs((artifact["totalCostUsd"] as number) - ledgerTotal) < 1e-9, "total = grinding only");

  // sessions length 2n
  const sessions = artifact["sessions"] as E2SessionRecord[];
  assert.equal(sessions.length, 2);

  // exactly one e2-*.json and one cost-ledger-*.jsonl
  const { files } = await (async () => {
    const outDir = await mkdtemp(join(tmpdir(), "e2-files-"));
    await runE2({ client: fixedClient(fence(CORRECT_IMPL)), warbossContract: warboss, n: 1, out: outDir, tasksDir: TASKS_DIR });
    return { files: await readdir(outDir) };
  })();
  assert.equal(files.filter((f) => f.startsWith("e2-") && f.endsWith(".json")).length, 1);
  assert.equal(files.filter((f) => f.startsWith("cost-ledger-") && f.endsWith(".jsonl")).length, 1);
});

test("AC9 authoringCostUsd = artifact totalCostUsd when reconstructed from a path", async () => {
  const warboss = warbossContractWithError();
  const artifactFixture = makeArtifact(warboss, 0.26);
  const outDir = await mkdtemp(join(tmpdir(), "e2-authcost-"));
  const artPath = join(outDir, "decompose.json");
  await writeFile(artPath, JSON.stringify(artifactFixture, null, 2));

  await runE2({
    client: fixedClient(fence(CORRECT_IMPL)),
    warbossArtifact: artPath,
    n: 1,
    out: outDir,
    tasksDir: TASKS_DIR,
  });
  const files = await readdir(outDir);
  const name = files.find((f) => f.startsWith("e2-") && f.endsWith(".json"))!;
  const artifact = JSON.parse(await readFile(join(outDir, name), "utf8")) as Record<string, unknown>;
  assert.equal(artifact["authoringCostUsd"], 0.26);
  assert.equal(artifact["warbossArtifactPath"], artPath);
});

// ── AC10 ──────────────────────────────────────────────────────────────────────

test("AC10 dead-run guard: live=true + all-zero scores → deadRun=true", async () => {
  const warboss = warbossContractWithError();
  // Empty response → no code → all-zero final scores.
  const { artifact, result } = await runAndRead({
    client: fixedClient(""),
    warbossContract: warboss,
    n: 1,
    live: true,
  });
  assert.equal(result.deadRun, true);
  assert.equal(artifact["deadRun"], true);
});

test("AC10 dead-run guard: live=false + zero scores → deadRun=false", async () => {
  const warboss = warbossContractWithError();
  const { artifact, result } = await runAndRead({
    client: fixedClient(""),
    warbossContract: warboss,
    n: 1,
    live: false,
  });
  assert.equal(result.deadRun, false);
  assert.equal(artifact["deadRun"], false);
});

test("AC10 dead-run guard: live=true + nonzero scores and cost → deadRun=false", async () => {
  const warboss = warbossContractWithError();
  const { artifact, result } = await runAndRead({
    client: fixedClient(fence(CORRECT_IMPL)),
    warbossContract: warboss,
    n: 1,
    live: true,
  });
  assert.equal(result.deadRun, false);
  assert.equal(artifact["deadRun"], false);
});
