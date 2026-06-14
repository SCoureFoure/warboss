/** AC1–AC10 — see specs/e4-battery-authoring.spec.md rev 2 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import type { MessagesClient } from "../src/agent.ts";
import { Contract } from "../src/contract.ts";
import type { HiddenCase } from "../src/experiment/task.ts";
import type { FeedbackArmAnalysis } from "../src/experiment/e1b.ts";
import type { DecomposeArtifact } from "../src/experiment/decompose-run.ts";
import {
  loadGodAnswers,
  buildGodBattery,
  renderOwnerDecisions,
  evaluateE4Criterion,
  runE4,
  type GodRuling,
  type RunE4Result,
} from "../src/experiment/e4.ts";

const _thisDir = dirname(fileURLToPath(import.meta.url));
const TASKS_DIR = join(_thisDir, "..", "tasks");

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** A valid god-answers.json covering all three E3 knowns (rev 2: includes decision fields) */
const VALID_GOD_ANSWERS = JSON.stringify({
  task: "duration-parse",
  answeredAgainstArtifact: "e3-fixture",
  rulings: [
    {
      input: ["120"],
      expected: "<throws>",
      throws: true,
      decision: "A bare integer with no time unit is invalid input and must throw.",
      rationale: "bare number with no unit is invalid",
    },
    {
      input: [" 1h 30m "],
      expected: 5400,
      decision: "A duration string with leading or trailing whitespace and internal spaces between components must be accepted; the result is the sum of the component values in seconds.",
      rationale: "leading/trailing whitespace accepted; 1h30m = 5400s",
    },
    {
      input: ["1.5h"],
      expected: 5400,
      decision: "A fractional quantity before a unit is accepted and scaled by that unit; the result is 5400 seconds.",
      rationale: "fractional hours accepted: 1.5 * 3600 = 5400",
    },
  ],
});

/** A valid rev-4 single-requirement decompose JSON (fixture for runE4 tests) */
const VALID_1REQ_JSON = JSON.stringify([
  {
    id: "parse-duration",
    requirement: "Parse a duration string and return total seconds.",
    entry: "parseDuration",
    signature: "(s: string) => number",
    examples: [
      { name: "basic", input: ["1h30m"], expected: 5400 },
      { name: "invalid-bare", input: ["120"], expected: "<throws>", throws: true },
    ],
    resolutions: [
      {
        point: "bare numeric string '120' — no unit specified",
        chosen: "throws",
        basis: "intent",
      },
    ],
  },
]);
const VALID_1REQ_FENCED = "```json\n" + VALID_1REQ_JSON + "\n```";
const EMPTY_GAPS_FENCED = "```json\n[]\n```";

// A correct parseDuration implementation that passes the contamination-clean hidden cases.
// It avoids the three God-override inputs (120, " 1h 30m ", 1.5h) in examples,
// but passes the residual cases.
const CORRECT_IMPL = `
function parseDuration(s) {
  s = s.trim();
  if (/^-/.test(s)) throw new Error('invalid');
  if (/^\\d+(\\.\\d+)?$/.test(s)) throw new Error('invalid bare number');
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

function fence(code: string): string {
  return "```js\n" + code + "\n```";
}

/**
 * Scripted client: each call returns the next response in the array.
 * Optional capture callback receives body + call index.
 */
function scriptedClient(
  responses: string[],
  capture?: (
    body: Anthropic.MessageCreateParamsNonStreaming,
    callIndex: number,
  ) => void,
): MessagesClient {
  let calls = 0;
  return {
    messages: {
      create: async (body) => {
        const idx = calls++;
        capture?.(body, idx);
        const text = responses[idx % responses.length] ?? "";
        return {
          content: [{ type: "text", text }],
          usage: { input_tokens: 100, output_tokens: 50 },
        } as unknown as Anthropic.Message;
      },
    },
  };
}

/** Fixed-response client */
function fixedClient(text: string): MessagesClient {
  return scriptedClient([text]);
}

/** Synthetic FeedbackArmAnalysis */
function synthAnalysis(meanFinalHiddenScore: number): FeedbackArmAnalysis {
  return {
    feedbackArm: "x",
    greenRate: 1,
    meanAttempts: 1,
    stallRate: 0,
    meanFinalHiddenScore,
    meanCostPerGreenSession: 0.001,
    totalCostUsd: 0.001,
  };
}

/**
 * Build E2 scripted responses: decompose (1 call for warboss rev-4) + audit (1 call)
 * + n grinding sessions for human + n for warboss (each gets one generate call via runLoop).
 */
function e2GrindingResponses(n: number): string[] {
  // Each session = 1 generate call returning correct impl
  return Array(n * 2).fill(fence(CORRECT_IMPL));
}

/**
 * Full scripted responses for E4: decompose + audit + E2 grinding.
 * E4 does: 1 decompose + 1 audit (possibly + 1 amend if gaps) + N*2 grinding calls.
 */
function e4Responses(n: number, extraResponses: string[] = []): string[] {
  return [
    VALID_1REQ_FENCED,      // call 0: warboss.decompose
    EMPTY_GAPS_FENCED,      // call 1: warboss.audit
    ...extraResponses,
    ...e2GrindingResponses(n),
  ];
}

// ── Helper: write god-answers fixture and return path ─────────────────────────

async function writeGodAnswers(dir: string, content = VALID_GOD_ANSWERS): Promise<string> {
  const path = join(dir, "god-answers.json");
  await writeFile(path, content);
  return path;
}

// ── AC1: god-answers loader ───────────────────────────────────────────────────

test("AC1 loadGodAnswers — valid asset covering three E3 knowns → returns rulings verbatim", async () => {
  const dir = await mkdtemp(join(tmpdir(), "e4-ac1-"));
  const path = await writeGodAnswers(dir);

  const rulings = await loadGodAnswers(path);

  assert.equal(rulings.length, 3, "three rulings loaded");

  // throws ruling: input ["120"]
  const throwing = rulings.find((r) => JSON.stringify(r.input) === JSON.stringify(["120"]));
  assert.ok(throwing !== undefined, "ruling for ['120'] present");
  assert.equal(throwing!.throws, true, "throwing ruling has throws: true");
  assert.equal(throwing!.expected, "<throws>", "throwing ruling expected is '<throws>'");
  assert.ok(typeof throwing!.decision === "string", "decision is a string");
  assert.ok(throwing!.decision.length > 0, "decision is non-empty");

  // value ruling: input [" 1h 30m "]
  const whitespace = rulings.find(
    (r) => JSON.stringify(r.input) === JSON.stringify([" 1h 30m "]),
  );
  assert.ok(whitespace !== undefined, "ruling for [' 1h 30m '] present");
  assert.equal(whitespace!.expected, 5400, "whitespace ruling expected is 5400");
  assert.equal(whitespace!.throws, undefined, "whitespace ruling has no throws");

  // value ruling: input ["1.5h"]
  const decimal = rulings.find(
    (r) => JSON.stringify(r.input) === JSON.stringify(["1.5h"]),
  );
  assert.ok(decimal !== undefined, "ruling for ['1.5h'] present");
  assert.equal(decimal!.expected, 5400, "decimal ruling expected is 5400");
});

test("AC1 variant: asset missing '1.5h' → descriptive throw naming the missing input", async () => {
  const dir = await mkdtemp(join(tmpdir(), "e4-ac1-miss-"));
  const missing = JSON.stringify({
    task: "duration-parse",
    rulings: [
      { input: ["120"], expected: "<throws>", throws: true, decision: "A bare integer with no time unit is invalid input and must throw.", rationale: "x" },
      { input: [" 1h 30m "], expected: 5400, decision: "Whitespace-padded duration strings are accepted.", rationale: "y" },
      // missing: ["1.5h"]
    ],
  });
  const path = await writeGodAnswers(dir, missing);

  await assert.rejects(
    loadGodAnswers(path),
    /1\.5h|missing/i,
  );
});

test("AC1 variant: duplicate input tuple → descriptive throw", async () => {
  const dir = await mkdtemp(join(tmpdir(), "e4-ac1-dup-"));
  const dup = JSON.stringify({
    task: "duration-parse",
    rulings: [
      { input: ["120"], expected: "<throws>", throws: true, decision: "A bare integer with no time unit is invalid input and must throw.", rationale: "a" },
      { input: ["120"], expected: 120, decision: "Duplicate ruling — this should cause a throw.", rationale: "b" }, // duplicate!
      { input: [" 1h 30m "], expected: 5400, decision: "Whitespace-padded duration strings are accepted.", rationale: "c" },
      { input: ["1.5h"], expected: 5400, decision: "A fractional quantity before a unit is accepted.", rationale: "d" },
    ],
  });
  const path = await writeGodAnswers(dir, dup);

  await assert.rejects(
    loadGodAnswers(path),
    /duplicate/i,
  );
});

// ── AC2: God battery override + append ───────────────────────────────────────

test("AC2 buildGodBattery — override replaces in place, novel ruling appended; coveredBy=[]; names unique", () => {
  // Use a synthetic hidden battery where one case matches a ruling input
  const taskHidden: HiddenCase[] = [
    { name: "happy-a", input: ["2h"], expected: 7200, coveredBy: ["basic-hm"] },
    { name: "happy-b", input: ["10m"], expected: 600, coveredBy: [] },
    { name: "match-me", input: ["120"], expected: 120, coveredBy: [] }, // will be overridden
    { name: "error-a", input: ["-1h"], expected: "<throws>", throws: true, coveredBy: [] },
  ];

  const rulings: GodRuling[] = [
    {
      input: ["120"],          // matches "match-me" → override in place
      expected: "<throws>",
      throws: true,
      decision: "A bare integer with no time unit is invalid input and must throw.",
      rationale: "bare number is invalid",
    },
    {
      input: ["1.5h"],         // novel → append
      expected: 5400,
      decision: "A fractional quantity before a unit is accepted and scaled by that unit.",
      rationale: "fractional hours",
    },
  ];

  const battery = buildGodBattery(taskHidden, rulings);

  // Total = 4 original + 1 appended = 5
  assert.equal(battery.length, 5, "4 task cases + 1 appended God case = 5");

  // Override: "match-me" replaced in place at index 2
  const overridden = battery[2]!;
  assert.equal(overridden.name, "match-me", "override keeps original name");
  assert.equal(overridden.throws, true, "God's throws wins");
  assert.deepEqual([...overridden.coveredBy], [], "coveredBy = []");

  // Original cases at positions 0, 1, 3 unchanged (except their coveredBy may vary)
  assert.equal(battery[0]!.name, "happy-a");
  assert.equal(battery[1]!.name, "happy-b");
  assert.equal(battery[3]!.name, "error-a");

  // Appended God case at position 4
  const appended = battery[4]!;
  assert.ok(appended.name.startsWith("god-"), `appended name starts with 'god-': ${appended.name}`);
  assert.deepEqual([...appended.input], ["1.5h"], "appended input is ['1.5h']");
  assert.equal(appended.expected, 5400, "appended expected is 5400");
  assert.equal(appended.throws, undefined, "appended case is not throwing");
  assert.deepEqual([...appended.coveredBy], [], "appended coveredBy = []");

  // Name uniqueness (no throw means it was satisfied)
  const names = battery.map((c) => c.name);
  const nameSet = new Set(names);
  assert.equal(nameSet.size, battery.length, "all names unique");
});

test("AC2 variant: all rulings are novel → all appended in asset order", () => {
  const taskHidden: HiddenCase[] = [
    { name: "h1", input: ["2h"], expected: 7200, coveredBy: [] },
    { name: "e1", input: ["-1h"], expected: "<throws>", throws: true, coveredBy: [] },
  ];
  const rulings: GodRuling[] = [
    { input: ["120"], expected: "<throws>", throws: true, decision: "A bare integer with no time unit is invalid input and must throw.", rationale: "a" },
    { input: ["1.5h"], expected: 5400, decision: "A fractional quantity before a unit is accepted and scaled by that unit.", rationale: "b" },
    { input: [" 1h 30m "], expected: 5400, decision: "A duration with whitespace between components is accepted.", rationale: "c" },
  ];

  const battery = buildGodBattery(taskHidden, rulings);
  assert.equal(battery.length, 5, "2 original + 3 appended");

  // First two are original
  assert.equal(battery[0]!.name, "h1");
  assert.equal(battery[1]!.name, "e1");

  // Appended in asset order (indices 0, 1, 2)
  assert.ok(battery[2]!.name.includes("120") || battery[2]!.name.startsWith("god-0"), `battery[2] is god-0: ${battery[2]!.name}`);
  assert.ok(battery[3]!.name.startsWith("god-"), `battery[3] is god-1: ${battery[3]!.name}`);
  assert.ok(battery[4]!.name.startsWith("god-"), `battery[4] is god-2: ${battery[4]!.name}`);

  // All coveredBy = []
  for (const c of battery.slice(2)) {
    assert.deepEqual([...c.coveredBy], [], `God case ${c.name} coveredBy = []`);
  }
});

// ── AC3: owner-decision rendering (rev 2, PROSE ONLY) ────────────────────────

test("AC3 renderOwnerDecisions — prose-only, one bullet per ruling = decision VERBATIM, asset order", () => {
  const rulings: GodRuling[] = [
    {
      input: ["120"],
      expected: "<throws>",
      throws: true,
      decision: "A bare integer with no time unit is invalid input and must throw.",
      rationale: "bare number invalid",
    },
    {
      input: [" 1h 30m "],
      expected: 5400,
      decision: "A duration string with leading or trailing whitespace must be accepted.",
      rationale: "whitespace ok",
    },
    {
      input: ["1.5h"],
      expected: 5400,
      decision: "A fractional quantity before a unit is accepted and scaled by that unit.",
      rationale: "fractional hours ok",
    },
  ];

  const result = renderOwnerDecisions(rulings);

  // Must contain the header
  assert.ok(result.includes("The owner has DECIDED"), "contains header");
  assert.ok(result.includes("not open choices"), "contains 'not open choices'");

  // Each bullet = the decision string VERBATIM
  assert.ok(
    result.includes(`- A bare integer with no time unit is invalid input and must throw.`),
    `throwing ruling decision rendered verbatim: ${result}`,
  );
  assert.ok(
    result.includes(`- A duration string with leading or trailing whitespace must be accepted.`),
    `whitespace ruling decision rendered verbatim: ${result}`,
  );
  assert.ok(
    result.includes(`- A fractional quantity before a unit is accepted and scaled by that unit.`),
    `decimal ruling decision rendered verbatim: ${result}`,
  );

  // All three bullets present
  const bullets = result.split("\n").filter((l) => l.startsWith("- "));
  assert.equal(bullets.length, 3, "exactly three bullets");

  // Order preserved (asset order)
  assert.ok(bullets[0]!.includes("bare integer"), "first bullet is throwing ruling decision");
  assert.ok(bullets[1]!.includes("leading or trailing"), "second bullet is whitespace ruling decision");
  assert.ok(bullets[2]!.includes("fractional quantity"), "third bullet is decimal ruling decision");

  // Rev 2: NO input literal in the output
  // Assert that for every ruling, JSON.stringify(input element) is NOT a substring of the result
  for (const r of rulings) {
    for (const inp of r.input) {
      const needle = JSON.stringify(inp);
      assert.ok(
        !result.includes(needle),
        `output must NOT contain input literal ${needle} (self-leak guard): ${result}`,
      );
    }
  }

  // NO entry(args) form: no opening paren following a function-call pattern
  assert.ok(!result.includes("parseDuration("), "output contains no entry(args) form");
  // NO === in the bullets
  for (const bullet of bullets) {
    assert.ok(!bullet.includes("==="), `bullet must not contain '===': ${bullet}`);
  }
});

test("AC3 renderOwnerDecisions — no bullet omitted (throwing ruling NOT skipped)", () => {
  // Specifically test that throwing rulings are not omitted (kills "skip throwing" reading)
  const rulings: GodRuling[] = [
    { input: ["foo"], expected: "<throws>", throws: true, decision: "Input without a recognizable structure must be rejected with an error.", rationale: "invalid" },
    { input: ["bar"], expected: 42, decision: "A well-formed input returns the numeric result.", rationale: "valid" },
  ];

  const result = renderOwnerDecisions(rulings);
  const bullets = result.split("\n").filter((l) => l.startsWith("- "));
  assert.equal(bullets.length, 2, "both bullets present — throwing not omitted");
  assert.ok(result.includes("- Input without a recognizable structure must be rejected with an error."), "throwing ruling decision rendered");
  assert.ok(result.includes("- A well-formed input returns the numeric result."), "value ruling decision rendered");
});

// ── AC4: re-author wiring ─────────────────────────────────────────────────────

test("AC4 runE4 — calls decompose with maxRequirements:1, context contains owner-decision block, tagged e4/author", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "e4-ac4-"));
  const tasksDir = TASKS_DIR;

  const godAnswersPath = await writeGodAnswers(outDir);

  const capturedBodies: Array<{ prompt: string; system: string; callIndex: number }> = [];

  const responses = e4Responses(1);
  const client = scriptedClient(responses, (body, callIndex) => {
    const prompt =
      typeof body.messages[0]?.content === "string"
        ? body.messages[0].content
        : JSON.stringify(body.messages[0]?.content ?? "");
    const system = typeof body.system === "string" ? body.system : "";
    capturedBodies.push({ prompt, system, callIndex });
  });

  await runE4({
    client,
    task: "duration-parse",
    n: 1,
    out: outDir,
    tasksDir,
    godAnswers: godAnswersPath,
    live: false,
  });

  // Call 0 is the decompose call (the re-author)
  const decomposeCall = capturedBodies[0];
  assert.ok(decomposeCall !== undefined, "decompose call captured");

  // Context must contain the rendered owner-decision block
  assert.ok(
    decomposeCall!.prompt.includes("The owner has DECIDED"),
    `decompose prompt must contain owner-decision header: ${decomposeCall!.prompt.slice(0, 500)}`,
  );

  // Rev 2: must contain the decision prose verbatim (NOT the entry(args) form)
  assert.ok(
    decomposeCall!.prompt.includes("A bare integer with no time unit is invalid input and must throw."),
    "decompose prompt contains throwing ruling decision prose",
  );
  assert.ok(
    decomposeCall!.prompt.includes("A fractional quantity before a unit is accepted and scaled by that unit"),
    "decompose prompt contains decimal ruling decision prose",
  );

  // Rev 2: must NOT contain the input literals (no "120" or "1.5h" in the decisions block)
  // (They may appear in other parts of the prompt — we check the decision rendering is clean)
  assert.ok(
    !decomposeCall!.prompt.includes(`parseDuration("120") throws`),
    "decompose prompt must NOT contain old entry(args) form for throwing ruling",
  );
  assert.ok(
    !decomposeCall!.prompt.includes(`parseDuration("1.5h") ===`),
    "decompose prompt must NOT contain old entry(args) form for decimal ruling",
  );

  // decompose call must contain "maxRequirements" constraint — via the cap line
  assert.ok(
    decomposeCall!.prompt.includes("At most 1 requirement"),
    `decompose prompt must contain the cap line: ${decomposeCall!.prompt.slice(0, 600)}`,
  );

  // Verify the re-author artifact was written
  const files = await readdir(outDir);
  assert.ok(
    files.some((f) => f.startsWith("decompose-") && f.endsWith(".json")),
    "decompose artifact written",
  );

  // Verify e4 artifact has reauthorArtifactPath
  const e4File = files.find((f) => f.startsWith("e4-") && f.endsWith(".json"));
  assert.ok(e4File !== undefined, "e4 artifact written");
  const e4Raw = await readFile(join(outDir, e4File!), "utf8");
  const e4Artifact = JSON.parse(e4Raw) as Record<string, unknown>;
  assert.ok(
    typeof e4Artifact["reauthorArtifactPath"] === "string" &&
      (e4Artifact["reauthorArtifactPath"] as string).includes("decompose-"),
    "reauthorArtifactPath recorded in artifact",
  );
});

// ── AC5: E4 criterion ─────────────────────────────────────────────────────────

test("AC5 evaluateE4Criterion — warboss 0.95, human 1.0 → pass: true", () => {
  const result = evaluateE4Criterion(synthAnalysis(1.0), synthAnalysis(0.95), 9, 3);
  assert.equal(result.pass, true, "0.95 >= 0.90 × 1.0 → pass");
  // detail carries both means, threshold, residual count, exclusion count
  assert.ok(result.detail.includes("0.950"), "detail has warboss mean");
  assert.ok(result.detail.includes("1.000"), "detail has human mean");
  assert.ok(result.detail.includes("0.900"), "detail has threshold");
  assert.ok(result.detail.includes("residualGodCases=9"), "detail has residual count");
  assert.ok(result.detail.includes("exclusions=3"), "detail has exclusion count");
});

test("AC5 evaluateE4Criterion — warboss 0.80, human 1.0 → pass: false", () => {
  const result = evaluateE4Criterion(synthAnalysis(1.0), synthAnalysis(0.80), 9, 3);
  assert.equal(result.pass, false, "0.80 < 0.90 × 1.0 → fail");
  assert.ok(result.detail.includes("0.800"), "detail has warboss mean");
  assert.ok(result.detail.includes("1.000"), "detail has human mean");
  assert.ok(result.detail.includes("residualGodCases=9"), "detail has residual count");
  assert.ok(result.detail.includes("exclusions=3"), "detail has exclusion count");
});

test("AC5 evaluateE4Criterion — human 0 → pass: false, degenerate detail", () => {
  const result = evaluateE4Criterion(synthAnalysis(0), synthAnalysis(0.5), 5, 2);
  assert.equal(result.pass, false, "human=0 → degenerate fail");
  assert.ok(/degenerate/i.test(result.detail), "detail names degenerate baseline");
  assert.ok(result.detail.includes("0.000"), "detail has human mean 0.000");
  assert.ok(result.detail.includes("0.500"), "detail has warboss mean 0.500");
  assert.ok(result.detail.includes("residualGodCases=5"), "detail has residual count");
  assert.ok(result.detail.includes("exclusions=2"), "detail has exclusion count");
});

// ── AC6: e2 hiddenOverride (rev 3) ────────────────────────────────────────────

test("AC6 runE2 hiddenOverride — when present, scores against the override battery (not task.hidden)", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "e4-ac6-"));

  // Build a synthetic God battery with known structure
  const godBattery: HiddenCase[] = [
    { name: "g1", input: ["2h"], expected: 7200, coveredBy: [] },
    { name: "g2", input: ["-1h"], expected: "<throws>", throws: true, coveredBy: [] },
  ];

  // Import runE2 directly to test hiddenOverride behavior
  const { runE2 } = await import("../src/experiment/e2.ts");

  // Build a warboss contract that doesn't leak g1 or g2 inputs
  const warbossContract = Contract.freeze({
    requirement: "duration-parse",
    entry: "parseDuration",
    version: "1",
    examples: [
      { name: "basic", input: ["1h30m"], expected: 5400 },
      { name: "rejects-garbage", input: ["abc"], expected: "<throws>", throws: true },
    ],
  });

  // Run with hiddenOverride = godBattery
  const result = await runE2({
    client: fixedClient(fence(CORRECT_IMPL)),
    warbossContract,
    task: "duration-parse",
    n: 1,
    out: outDir,
    tasksDir: TASKS_DIR,
    hiddenOverride: godBattery,
    live: false,
  });

  assert.equal(result.deadRun, false);

  // Read the artifact and verify hiddenBattery reflects God battery, not task.hidden
  const files = await readdir(outDir);
  const e2File = files.find((f) => f.startsWith("e2-") && f.endsWith(".json"));
  assert.ok(e2File !== undefined, "e2 artifact written");
  const raw = await readFile(join(outDir, e2File!), "utf8");
  const artifact = JSON.parse(raw) as Record<string, unknown>;

  const hb = artifact["hiddenBattery"] as {
    total: number;
    residualCount: number;
    happyCount: number;
    errorCount: number;
  };

  // God battery has 2 cases (not the 12 from task.hidden)
  assert.equal(hb.total, 2, "hiddenBattery.total = God battery size (2), not task.hidden size (12)");

  // finalVector lengths equal residualCount (from God battery)
  const sessions = artifact["sessions"] as Array<{ finalVector: boolean[] }>;
  for (const s of sessions) {
    assert.equal(
      s.finalVector.length,
      hb.residualCount,
      "finalVector length = residualCount from God battery",
    );
  }
});

test("AC6 omitting hiddenOverride → reproduces rev-2 behavior (existing e2 test passes)", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "e4-ac6-rev2-"));

  const { runE2 } = await import("../src/experiment/e2.ts");

  const warbossContract = Contract.freeze({
    requirement: "duration-parse",
    entry: "parseDuration",
    version: "1",
    examples: [
      { name: "basic", input: ["1h30m"], expected: 5400 },
      { name: "rejects-garbage", input: ["abc"], expected: "<throws>", throws: true },
    ],
  });

  const result = await runE2({
    client: fixedClient(fence(CORRECT_IMPL)),
    warbossContract,
    task: "duration-parse",
    n: 1,
    out: outDir,
    tasksDir: TASKS_DIR,
    // hiddenOverride NOT provided → uses task.hidden (12 cases)
    live: false,
  });

  assert.equal(result.deadRun, false);

  const files = await readdir(outDir);
  const e2File = files.find((f) => f.startsWith("e2-") && f.endsWith(".json"));
  const raw = await readFile(join(outDir, e2File!), "utf8");
  const artifact = JSON.parse(raw) as Record<string, unknown>;
  const hb = artifact["hiddenBattery"] as { total: number };

  // task.hidden has 12 cases
  assert.equal(hb.total, 12, "without hiddenOverride, hiddenBattery.total = 12 (task.hidden)");
});

// ── AC7: contested inputs SURVIVE the residual (rev 2) ───────────────────────

/**
 * AC7: prose-only decisions carry no input literal, so the three contested God
 * cases are NOT leaked into the warboss prompt and SURVIVE the residual.
 * Variant: a warboss example that coincidentally equals a contested input →
 * that one case IS excluded, sessions still run, no throw.
 */
test("AC7 contested God inputs SURVIVE residual — prose-only decisions do not leak them", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "e4-ac7-survive-"));
  const godAnswersPath = await writeGodAnswers(outDir);

  // Warboss decompose uses examples with inputs DISTINCT from "120", " 1h 30m ", "1.5h"
  // so none of the three contested cases are leaked.
  const safeDecomposeJson = JSON.stringify([
    {
      id: "parse-duration",
      requirement: "Parse a duration string and return total seconds.",
      entry: "parseDuration",
      signature: "(s: string) => number",
      examples: [
        { name: "basic", input: ["2h30m"], expected: 9000 },         // distinct from all God inputs
        { name: "invalid-nounit", input: ["xyz"], expected: "<throws>", throws: true }, // distinct
      ],
      resolutions: [],
    },
  ]);
  const safeDecomposeFenced = "```json\n" + safeDecomposeJson + "\n```";

  const responses = [
    safeDecomposeFenced,   // call 0: decompose
    EMPTY_GAPS_FENCED,     // call 1: audit
    ...e2GrindingResponses(1),
  ];

  const client = scriptedClient(responses);

  await runE4({
    client,
    task: "duration-parse",
    n: 1,
    out: outDir,
    tasksDir: TASKS_DIR,
    godAnswers: godAnswersPath,
    live: false,
  });

  const files = await readdir(outDir);
  const e4File = files.find((f) => f.startsWith("e4-") && f.endsWith(".json"))!;
  const raw = await readFile(join(outDir, e4File), "utf8");
  const e4Artifact = JSON.parse(raw) as {
    e2: {
      hiddenBattery: {
        excluded: Array<{ name: string; leakedBy: string[] }>;
        residualCount: number;
      };
    };
  };

  const hb = e4Artifact.e2.hiddenBattery;

  // The three contested inputs should NOT appear in excluded
  const excludedNames = hb.excluded.map((e) => e.name);
  const contestedGodNames = ["120", "1h 30m", "1.5h"]; // substrings to check
  for (const contested of contestedGodNames) {
    const excludedContest = excludedNames.find((n) =>
      n.includes(contested.replace(/ /g, "").replace(/"/g, "")),
    );
    // Note: God cases have names like "god-0-[\"120\"]" — check for the input value
    const godCasesExcluded = hb.excluded.filter((e) =>
      e.name.includes("120") || e.name.includes("1h 30m") || e.name.includes("1.5h"),
    );
    if (godCasesExcluded.length > 0) {
      assert.fail(`Contested God case(s) should not be excluded with prose-only decisions: ${JSON.stringify(godCasesExcluded)}`);
    }
    break; // check once
  }
  assert.ok(hb.residualCount > 0, "residual is non-empty");
});

test("AC7 variant: warboss coincidentally chooses a contested input → that case excluded, sessions run, no throw", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "e4-ac7-coincidental-"));
  const godAnswersPath = await writeGodAnswers(outDir);

  // Warboss decompose uses "120" as an example — coincidentally equal to the God ruling input
  const coincidentalDecomposeJson = JSON.stringify([
    {
      id: "parse-duration",
      requirement: "Parse a duration string and return total seconds.",
      entry: "parseDuration",
      signature: "(s: string) => number",
      examples: [
        { name: "basic", input: ["2h30m"], expected: 9000 },
        // Coincidental: warboss chose "120" as a DIFFERENT example (maybe 120s or a throws)
        // But since "120" is a God battery input, the residual filter will exclude it.
        { name: "coincidental", input: ["120"], expected: 120 }, // warboss chose this; God says throws
        { name: "invalid", input: ["abc"], expected: "<throws>", throws: true },
      ],
      resolutions: [],
    },
  ]);
  const coincidentalFenced = "```json\n" + coincidentalDecomposeJson + "\n```";

  const responses = [
    coincidentalFenced,    // call 0: decompose
    EMPTY_GAPS_FENCED,     // call 1: audit
    ...e2GrindingResponses(1),
  ];
  const client = scriptedClient(responses);

  // Must NOT throw — the backstop filter handles it as an exclusion
  let result: RunE4Result | undefined;
  try {
    result = await runE4({
      client,
      task: "duration-parse",
      n: 1,
      out: outDir,
      tasksDir: TASKS_DIR,
      godAnswers: godAnswersPath,
      live: false,
    });
  } catch (err) {
    assert.fail(`runE4 must not throw on coincidental contamination: ${(err as Error).message}`);
  }

  assert.ok(result !== undefined, "runE4 returned a result");

  const files = await readdir(outDir);
  const e4File = files.find((f) => f.startsWith("e4-") && f.endsWith(".json"))!;
  const raw = await readFile(join(outDir, e4File), "utf8");
  const e4Artifact = JSON.parse(raw) as {
    e2: {
      hiddenBattery: {
        excluded: Array<{ name: string; leakedBy: string[] }>;
        residualCount: number;
      };
      sessions: unknown[];
    };
  };

  const hb = e4Artifact.e2.hiddenBattery;

  // The God case for "120" should be excluded with leakedBy including "warboss".
  // NOTE: input "120" already exists in the hidden battery (name "bare-number-2"),
  // so buildGodBattery OVERRIDES it in place — the god case keeps the original
  // name "bare-number-2" (spec: override keeps the original name), NOT a "god-…"
  // name. Find it by the warboss leak (the only coincidental exclusion here:
  // warboss examples are "2h30m"/"120"/"abc"; only "120" is a battery input).
  const excluded120 = hb.excluded.find((e) => e.leakedBy.includes("warboss"));
  assert.ok(
    excluded120 !== undefined,
    `The coincidentally-chosen "120" case should be excluded with leakedBy ["warboss"]: ${JSON.stringify(hb.excluded)}`,
  );

  // Sessions still ran
  assert.ok(e4Artifact.e2.sessions.length > 0, "sessions ran despite coincidental exclusion");
});

// ── AC8: self-leak guard (rev 2) ─────────────────────────────────────────────

test("AC8 self-leak guard — decision containing own input literal throws before any model call", async () => {
  const dir = await mkdtemp(join(tmpdir(), "e4-ac8-selfleakguard-"));

  // Ruling with decision containing its own input literal "120" (the JSON.stringify of it)
  // JSON.stringify("120") === '"120"' — check if that needle is in the decision
  // The spec says: throws if decision contains JSON.stringify(input element)
  // JSON.stringify("120") = '"120"' (a quoted string).
  // We embed the string 120 literally as a number context — but need the JSON form "120".
  const selfLeakAsset = JSON.stringify({
    task: "duration-parse",
    rulings: [
      {
        input: ["120"],
        expected: "<throws>",
        throws: true,
        // Decision contains JSON.stringify("120") = '"120"' — self-leak!
        decision: `The value "120" with no time unit is invalid input and must throw.`,
        rationale: "the self-leak is in the decision, not rationale",
      },
      {
        input: [" 1h 30m "],
        expected: 5400,
        decision: "A duration with whitespace padding is accepted.",
        rationale: "normal",
      },
      {
        input: ["1.5h"],
        expected: 5400,
        decision: "A fractional quantity before a unit is accepted.",
        rationale: "normal",
      },
    ],
  });

  const path = join(dir, "god-answers.json");
  await writeFile(path, selfLeakAsset);

  // loadGodAnswers must throw with a descriptive error naming the offending ruling
  await assert.rejects(
    loadGodAnswers(path),
    (err: Error) => {
      assert.ok(/self.?leak|self.?leak|"120"|120/i.test(err.message), `error names the offending ruling: ${err.message}`);
      return true;
    },
    "loadGodAnswers must throw on self-leak in decision",
  );
});

test("AC8 self-leak guard — rationale containing input literal does NOT throw", async () => {
  const dir = await mkdtemp(join(tmpdir(), "e4-ac8-rationale-ok-"));

  // Rationale is exempt — may contain anything including the input literal
  const rationaleWithLiteralAsset = JSON.stringify({
    task: "duration-parse",
    rulings: [
      {
        input: ["120"],
        expected: "<throws>",
        throws: true,
        // Clean decision (no input literal)
        decision: "A bare integer with no time unit is invalid input and must throw.",
        // Rationale has the literal "120" — this is FINE (rationale is never rendered)
        rationale: `The value "120" is ambiguous — could be seconds, minutes, etc.`,
      },
      {
        input: [" 1h 30m "],
        expected: 5400,
        decision: "A duration with whitespace padding is accepted.",
        rationale: "spaces around ' 1h 30m ' should be trimmed",
      },
      {
        input: ["1.5h"],
        expected: 5400,
        decision: "A fractional quantity before a unit is accepted.",
        rationale: "1.5h = 5400s",
      },
    ],
  });

  const path = join(dir, "god-answers.json");
  await writeFile(path, rationaleWithLiteralAsset);

  // Must NOT throw — rationale is exempt from the self-leak guard
  const rulings = await loadGodAnswers(path);
  assert.equal(rulings.length, 3, "rulings loaded successfully despite literal in rationale");
});

test("AC8 self-leak guard via renderOwnerDecisions — injected ruling with self-leak throws", () => {
  // Even if a ruling bypassed the loader (e.g., test-injected), renderOwnerDecisions also guards
  const selfLeakRulings: GodRuling[] = [
    {
      input: ["bad-value"],
      expected: "<throws>",
      throws: true,
      // JSON.stringify("bad-value") = '"bad-value"' — this is the needle
      decision: `The input "bad-value" must throw because it is unparseable.`,
    },
  ];

  assert.throws(
    () => renderOwnerDecisions(selfLeakRulings),
    /self.?leak|"bad-value"|bad-value/i,
    "renderOwnerDecisions must throw on self-leak",
  );
});

// ── AC9: end-to-end offline run + single shared sidecar (rev 2) ──────────────

test("AC9 runE4 end-to-end offline — single cost-ledger sidecar for BOTH phases; artifact fields correct", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "e4-ac9-"));
  const godAnswersPath = await writeGodAnswers(outDir);

  const responses = e4Responses(1);
  const client = scriptedClient(responses);

  const result: RunE4Result = await runE4({
    client,
    task: "duration-parse",
    n: 1,
    out: outDir,
    tasksDir: TASKS_DIR,
    godAnswers: godAnswersPath,
    live: false,
  });

  assert.equal(result.deadRun, false, "should not be a dead run");

  const files = await readdir(outDir);

  // Exactly one e4-*.json
  const e4Files = files.filter((f) => f.startsWith("e4-") && f.endsWith(".json"));
  assert.equal(e4Files.length, 1, "exactly one e4 artifact");

  // Rev 2: exactly ONE cost-ledger-*.jsonl — runE2 opened no second sidecar
  const ledgerFiles = files.filter(
    (f) => f.startsWith("cost-ledger-") && f.endsWith(".jsonl"),
  );
  assert.equal(
    ledgerFiles.length,
    1,
    `exactly one cost-ledger sidecar (rev 2: E4 owns the shared ledger; runE2 must not open a second one). Found: ${JSON.stringify(ledgerFiles)}`,
  );

  // Read and validate artifact
  const raw = await readFile(join(outDir, e4Files[0]!), "utf8");
  const artifact = JSON.parse(raw) as {
    config: { task: string; n: number; granularity: string };
    godAnswersPath: string;
    rulings: unknown[];
    reauthorArtifactPath: string;
    godBattery: { total: number; fromTask: number; fromGod: number; overridden: number };
    e2: Record<string, unknown>;
    e4Criterion: { pass: boolean; detail: string };
    authoringCostUsd: number;
    grindingCostUsd: number;
    totalCostUsd: number;
    ledger: unknown[];
    deadRun: boolean;
  };

  // config
  assert.equal(artifact.config.task, "duration-parse");
  assert.equal(artifact.config.n, 1);

  // godAnswersPath recorded
  assert.ok(typeof artifact.godAnswersPath === "string", "godAnswersPath is a string");

  // rulings verbatim (3 rulings from fixture)
  assert.equal(artifact.rulings.length, 3, "3 rulings in artifact");

  // reauthorArtifactPath
  assert.ok(
    typeof artifact.reauthorArtifactPath === "string" &&
      artifact.reauthorArtifactPath.includes("decompose-"),
    "reauthorArtifactPath recorded",
  );

  // godBattery counts
  assert.ok(typeof artifact.godBattery.total === "number", "godBattery.total");
  assert.ok(typeof artifact.godBattery.fromTask === "number", "godBattery.fromTask");
  assert.ok(typeof artifact.godBattery.fromGod === "number", "godBattery.fromGod");
  assert.ok(typeof artifact.godBattery.overridden === "number", "godBattery.overridden");

  // e2 embedded
  assert.ok(typeof artifact.e2 === "object" && artifact.e2 !== null, "e2 embedded");
  assert.ok("hiddenBattery" in artifact.e2, "e2 has hiddenBattery");
  assert.ok("analysis" in artifact.e2, "e2 has analysis");

  // e4Criterion
  assert.equal(typeof artifact.e4Criterion.pass, "boolean", "e4Criterion.pass is boolean");
  assert.ok(typeof artifact.e4Criterion.detail === "string", "e4Criterion.detail is string");
  assert.ok(artifact.e4Criterion.detail.includes("residualGodCases"), "e4Criterion.detail includes residualGodCases");

  // Cost accounting: totalCostUsd = authoringCostUsd + grindingCostUsd
  assert.ok(
    Math.abs(artifact.totalCostUsd - (artifact.authoringCostUsd + artifact.grindingCostUsd)) < 1e-9,
    `totalCostUsd === authoringCostUsd + grindingCostUsd: ${artifact.totalCostUsd} vs ${artifact.authoringCostUsd} + ${artifact.grindingCostUsd}`,
  );

  // ledger covers BOTH phases (author + E2 grinding): at least 1 entry
  assert.ok(Array.isArray(artifact.ledger), "ledger is array");
  assert.ok(artifact.ledger.length >= 1, "ledger covers both phases (has entries from author + E2)");

  // deadRun
  assert.equal(artifact.deadRun, false, "deadRun is false for offline run");
});

// ── AC9: dead-run guard ───────────────────────────────────────────────────────

/**
 * A client where decompose calls (indices < splitAt) return valid responses,
 * and grinding calls (indices >= splitAt) return zero-token usage — so E2's
 * grindingCostUsd stays 0, triggering E2's dead-run guard when live=true.
 */
function splitCostClient(
  decomposeResponses: string[],
  splitAt: number,
): MessagesClient {
  let calls = 0;
  return {
    messages: {
      create: async (body) => {
        const idx = calls++;
        if (idx < splitAt) {
          // Decompose/audit phase: return valid response with normal usage
          const text = decomposeResponses[idx % decomposeResponses.length] ?? "";
          return {
            content: [{ type: "text", text }],
            usage: { input_tokens: 100, output_tokens: 50 },
          } as unknown as Anthropic.Message;
        } else {
          // Grinding phase: return zero-token usage so grindingCostUsd = 0
          return {
            content: [{ type: "text", text: "" }],
            usage: { input_tokens: 0, output_tokens: 0 },
          } as unknown as Anthropic.Message;
        }
      },
    },
  };
}

test("AC9 dead-run guard — live: true + zero grinding cost → deadRun: true", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "e4-ac9-live-zero-"));
  const godAnswersPath = await writeGodAnswers(outDir);

  // Decompose (call 0) + audit (call 1) succeed; grinding (calls 2+) get zero-usage
  // → E2's grindingCostUsd = 0 → E2 deadRun = true → E4 deadRun = true
  const client = splitCostClient([VALID_1REQ_FENCED, EMPTY_GAPS_FENCED], 2);

  const result = await runE4({
    client,
    task: "duration-parse",
    n: 1,
    out: outDir,
    tasksDir: TASKS_DIR,
    godAnswers: godAnswersPath,
    live: true,  // live: true → dead-run guard active
  });

  assert.equal(result.deadRun, true, "dead run detected when grinding cost is zero");

  // Artifact also carries deadRun: true
  const files = await readdir(outDir);
  const e4File = files.find((f) => f.startsWith("e4-") && f.endsWith(".json"))!;
  const raw = await readFile(join(outDir, e4File), "utf8");
  const artifact = JSON.parse(raw) as { deadRun: boolean };
  assert.equal(artifact.deadRun, true, "artifact.deadRun is true");
});

test("AC9 dead-run guard — live: false + zero scores → no dead-run failure", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "e4-ac9-offline-"));
  const godAnswersPath = await writeGodAnswers(outDir);

  const deadGrindResponses = [
    VALID_1REQ_FENCED,
    EMPTY_GAPS_FENCED,
    "",
    "",
  ];
  const client = scriptedClient(deadGrindResponses);

  const result = await runE4({
    client,
    task: "duration-parse",
    n: 1,
    out: outDir,
    tasksDir: TASKS_DIR,
    godAnswers: godAnswersPath,
    live: false,  // live: false → dead-run guard NOT active
  });

  assert.equal(result.deadRun, false, "live: false suppresses dead-run flag");
});

test("AC9 dead-run guard — live: true + nonzero costs + working impl → deadRun: false", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "e4-ac9-live-ok-"));
  const godAnswersPath = await writeGodAnswers(outDir);

  const responses = e4Responses(1);
  const client = scriptedClient(responses);

  const result = await runE4({
    client,
    task: "duration-parse",
    n: 1,
    out: outDir,
    tasksDir: TASKS_DIR,
    godAnswers: godAnswersPath,
    live: true,
  });

  assert.equal(result.deadRun, false, "nonzero costs + good impl → no dead run");
});
