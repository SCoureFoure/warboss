/** AC1–AC8 — see specs/e3-intent-divergence.spec.md rev 1 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import type { MessagesClient } from "../src/agent.ts";
import type { IntentProbeVerdict } from "../src/gate.ts";
import {
  runE3,
  evaluateE3Criterion,
  E3_CANDIDATE_INPUTS,
  E3_NEEDLES,
  type RunE3Result,
} from "../src/experiment/e3.ts";
import { deepEqual } from "../src/runner.ts";

const _thisDir = dirname(fileURLToPath(import.meta.url));
const TASKS_DIR = join(_thisDir, "..", "tasks");

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Valid single-requirement decompose fixture ────────────────────────────────

// A valid rev-4 single-requirement JSON with one fiat escalation
const VALID_1REQ_JSON = JSON.stringify([
  {
    id: "parse-duration",
    requirement: "Parse a duration string like '1h30m' and return total seconds.",
    entry: "parseDuration",
    signature: "(s: string) => number",
    examples: [
      { name: "basic", input: ["1h30m"], expected: 5400 },
      { name: "invalid", input: ["-1h"], expected: "<throws>", throws: true },
    ],
    resolutions: [
      {
        point: "bare numeric string e.g. '120' — unit not specified",
        chosen: "throws",
        basis: "fiat",
      },
    ],
  },
]);
const VALID_1REQ_FENCED = "```json\n" + VALID_1REQ_JSON + "\n```";
const EMPTY_GAPS_FENCED = "```json\n[]\n```";

// Probe implementations for parseDuration:
// Returns a constant 90 for everything (viable, all agree on fillers)
const PROBE_IMPL_RETURN_90 = fence(`
function parseDuration(s) { return 90; }
`);

// Throws on "120" (the bare-number known), returns 90 otherwise
const PROBE_IMPL_THROW_120 = fence(`
function parseDuration(s) {
  if (s.trim() === "120") throw new Error("ambiguous bare number");
  return 90;
}
`);

// ── AC1: probe-side surfacing rule ────────────────────────────────────────────

test("AC1 probe-side surfacing — split on ['120'] marks bare-number; filler ['1H'] marks nothing", () => {
  // Build a synthetic IntentProbeVerdict with a split on ["120"]
  const syntheticProbe: IntentProbeVerdict = {
    k: 4,
    generated: 4,
    noEntry: 0,
    viable: 4,
    nonviable: 0,
    splits: [
      {
        inputIndex: 3, // ["120"] is index 3 in E3_CANDIDATE_INPUTS
        input: ["120"],
        outcomes: { "value:120": 2, throw: 2 },
      },
    ],
    decidedRate: (12 - 1) / 12,
    costUsd: 0,
  };

  const result = evaluateE3Criterion([], syntheticProbe);

  const bareNumber = result.perKnown.find((k) => k.id === "bare-number")!;
  const whitespace = result.perKnown.find((k) => k.id === "whitespace")!;
  const decimal = result.perKnown.find((k) => k.id === "decimal")!;

  assert.ok(bareNumber !== undefined);
  assert.ok(whitespace !== undefined);
  assert.ok(decimal !== undefined);

  // bare-number: split on ["120"] → surfacedByProbe: true
  assert.equal(bareNumber.surfacedByProbe, true, "bare-number surfacedByProbe");
  assert.equal(whitespace.surfacedByProbe, false, "whitespace NOT surfacedByProbe");
  assert.equal(decimal.surfacedByProbe, false, "decimal NOT surfacedByProbe");

  // A split on filler ["1H"] (inputIndex=9) marks no known
  const probeWithFiller: IntentProbeVerdict = {
    k: 4,
    generated: 4,
    noEntry: 0,
    viable: 4,
    nonviable: 0,
    splits: [
      {
        inputIndex: 9, // ["1H"] is index 9
        input: ["1H"],
        outcomes: { "value:3600": 2, throw: 2 },
      },
    ],
    decidedRate: (12 - 1) / 12,
    costUsd: 0,
  };

  const result2 = evaluateE3Criterion([], probeWithFiller);
  for (const k of result2.perKnown) {
    assert.equal(k.surfacedByProbe, false, `filler split should not mark ${k.id}`);
  }
});

// ── AC2: author-side needle rule ──────────────────────────────────────────────

test("AC2a author-side needle rule — escalation with 'bare' matches bare-number", () => {
  const escalations = [
    "parse-duration: fiat — bare numeric string → throws",
  ];
  const probe: IntentProbeVerdict = {
    k: 2, generated: 2, noEntry: 0, viable: 2, nonviable: 0,
    splits: [],
    decidedRate: 1,
    costUsd: 0,
  };

  const result = evaluateE3Criterion(escalations, probe);

  const bareNumber = result.perKnown.find((k) => k.id === "bare-number")!;
  assert.equal(bareNumber.surfacedByAuthor, true, "needle 'bare' should match");
  // Other knowns not matched
  const whitespace = result.perKnown.find((k) => k.id === "whitespace")!;
  const decimal = result.perKnown.find((k) => k.id === "decimal")!;
  assert.equal(whitespace.surfacedByAuthor, false, "whitespace not in escalation");
  assert.equal(decimal.surfacedByAuthor, false, "decimal not in escalation");
});

test("AC2b author-side needle rule — escalation mentioning none of a known's needles → false", () => {
  const escalations = ["parse-duration: fiat — overflow behavior → throws"];
  const probe: IntentProbeVerdict = {
    k: 2, generated: 2, noEntry: 0, viable: 2, nonviable: 0,
    splits: [], decidedRate: 1, costUsd: 0,
  };

  const result = evaluateE3Criterion(escalations, probe);
  for (const k of result.perKnown) {
    assert.equal(k.surfacedByAuthor, false, `no needle match for ${k.id}`);
  }
});

test("AC2c author-side needle rule — needle in auditGaps but escalations empty → false", () => {
  // auditGaps is not consulted — evaluateE3Criterion takes escalations array only
  // We pass escalations=[] to confirm auditGaps can't help even if it has needles.
  // (The runner intentionally never passes auditGaps to evaluateE3Criterion.)
  const escalations: string[] = [];
  const probe: IntentProbeVerdict = {
    k: 2, generated: 2, noEntry: 0, viable: 2, nonviable: 0,
    splits: [], decidedRate: 1, costUsd: 0,
  };

  const result = evaluateE3Criterion(escalations, probe);
  for (const k of result.perKnown) {
    assert.equal(k.surfacedByAuthor, false, `escalations empty → no author surfacing for ${k.id}`);
  }
});

// ── AC3: criterion ────────────────────────────────────────────────────────────

test("AC3a criterion — all three surfaced → pass: true", () => {
  // bare-number by probe, whitespace by author, decimal by probe
  const escalations = [
    "parse-duration: fiat — whitespace padding behavior → leading/trailing trim applied",
  ];
  const probe: IntentProbeVerdict = {
    k: 4, generated: 4, noEntry: 0, viable: 4, nonviable: 0,
    splits: [
      { inputIndex: 3, input: ["120"], outcomes: { "value:120": 2, throw: 2 } },
      { inputIndex: 5, input: ["1.5h"], outcomes: { "value:5400": 2, throw: 2 } },
    ],
    decidedRate: (12 - 2) / 12,
    costUsd: 0,
  };

  const result = evaluateE3Criterion(escalations, probe);
  assert.equal(result.pass, true, "all three surfaced → PASS");
  for (const k of result.perKnown) {
    assert.equal(k.surfaced, true, `${k.id} should be surfaced`);
  }
});

test("AC3b criterion — exactly one missed → pass: false, detail names missed known", () => {
  // bare-number and whitespace surfaced; decimal missed by both
  const escalations = [
    "parse-duration: fiat — bare numeric → throws",
    "parse-duration: fiat — leading/trailing whitespace → trimmed",
  ];
  const probe: IntentProbeVerdict = {
    k: 4, generated: 4, noEntry: 0, viable: 4, nonviable: 0,
    splits: [
      // No split on ["1.5h"] — decimal is missed by probe
    ],
    decidedRate: 1,
    costUsd: 0,
  };

  const result = evaluateE3Criterion(escalations, probe);
  assert.equal(result.pass, false, "one missed → FAIL");
  const decimal = result.perKnown.find((k) => k.id === "decimal")!;
  assert.equal(decimal.surfaced, false, "decimal not surfaced");
  assert.ok(result.detail.includes("decimal"), "detail names the missed known");
  assert.ok(
    result.detail.includes("FAIL") || result.detail.toLowerCase().includes("missed"),
    `detail should reference failure: ${result.detail}`,
  );
});

test("AC3c criterion — viable: 0 probe → pass: false, degenerate detail", () => {
  const probe: IntentProbeVerdict = {
    k: 4, generated: 0, noEntry: 0, viable: 0, nonviable: 0,
    splits: [],
    decidedRate: 0,
    costUsd: 0,
  };

  const result = evaluateE3Criterion([], probe);
  assert.equal(result.pass, false, "viable=0 → FAIL");
  assert.ok(
    result.detail.toLowerCase().includes("viable") ||
    result.detail.toLowerCase().includes("degenerate"),
    `detail should name degenerate probe: ${result.detail}`,
  );
});

// ── AC4: candidate set pins the knowns ────────────────────────────────────────

test("AC4 E3_CANDIDATE_INPUTS pins the three knowns among fillers", () => {
  const knowns: Array<readonly [string]> = [
    ["120"],
    [" 1h 30m "],
    ["1.5h"],
  ];

  // Each known is present in E3_CANDIDATE_INPUTS
  for (const known of knowns) {
    const found = E3_CANDIDATE_INPUTS.some((entry) => deepEqual(entry, known));
    assert.ok(found, `known ${JSON.stringify(known)} should be in E3_CANDIDATE_INPUTS`);
  }

  // Total is 12 (3 knowns + 9 fillers)
  assert.equal(E3_CANDIDATE_INPUTS.length, 12, "candidate set must have exactly 12 entries");

  // Fillers count ≥ 9
  const fillerCount = E3_CANDIDATE_INPUTS.filter(
    (entry) => !knowns.some((known) => deepEqual(entry, known)),
  ).length;
  assert.ok(fillerCount >= 9, `need ≥9 fillers, got ${fillerCount}`);

  // The knowns appear at the indices the spec pins: 3, 4, 5 (0-indexed)
  assert.deepEqual(E3_CANDIDATE_INPUTS[3], ["120"], "bare-number at index 3");
  assert.deepEqual(E3_CANDIDATE_INPUTS[4], [" 1h 30m "], "whitespace at index 4");
  assert.deepEqual(E3_CANDIDATE_INPUTS[5], ["1.5h"], "decimal at index 5");
});

// ── AC5: end-to-end offline run ───────────────────────────────────────────────

test("AC5 end-to-end offline run — writes artifact + sidecar with expected fields", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "e3-ac5-"));

  // Fake client scripting:
  //   Call 0: warboss.decompose → returns valid 1-req JSON with fiat escalation
  //   Call 1: warboss.audit → returns no gaps
  //   Calls 2–5: intentProbe k=4 impls
  //     impls 0+1: PROBE_IMPL_RETURN_90 → parseDuration("120") = 90
  //     impls 2+3: PROBE_IMPL_THROW_120 → parseDuration("120") throws
  //     → split on ["120"]

  const responses = [
    VALID_1REQ_FENCED,    // call 0: decompose
    EMPTY_GAPS_FENCED,    // call 1: audit (no gaps → no amend)
    PROBE_IMPL_RETURN_90,  // call 2: probe impl 0
    PROBE_IMPL_RETURN_90,  // call 3: probe impl 1
    PROBE_IMPL_THROW_120,  // call 4: probe impl 2
    PROBE_IMPL_THROW_120,  // call 5: probe impl 3
  ];

  const client = scriptedClient(responses);

  const result: RunE3Result = await runE3({
    client,
    task: "duration-parse",
    k: 4,
    out: outDir,
    tasksDir: TASKS_DIR,
    live: false,
  });

  assert.equal(result.deadRun, false, "should not be a dead run");

  // Check files written
  const files = await readdir(outDir);
  const artifactFile = files.find((f) => f.startsWith("e3-") && f.endsWith(".json"));
  const ledgerFile = files.find((f) => f.startsWith("cost-ledger-") && f.endsWith(".jsonl"));
  assert.ok(artifactFile !== undefined, "e3 artifact should exist");
  assert.ok(ledgerFile !== undefined, "cost-ledger sidecar should exist");

  // Parse artifact
  const raw = await readFile(join(outDir, artifactFile!), "utf8");
  const artifact = JSON.parse(raw) as {
    config: { task: string; k: number; candidateInputCount: number };
    knowns: Array<{ id: string; input: unknown[] }>;
    author: {
      requirements: number;
      resolutions: unknown[];
      escalations: string[];
      auditGaps: string[];
      contractHashes: string[];
    };
    probe: IntentProbeVerdict;
    e3Criterion: { pass: boolean; perKnown: unknown[] };
    authoringCostUsd: number;
    probingCostUsd: number;
    totalCostUsd: number;
    ledger: unknown[];
    deadRun: boolean;
  };

  // config
  assert.equal(artifact.config.task, "duration-parse");
  assert.equal(artifact.config.k, 4);
  assert.equal(artifact.config.candidateInputCount, 12);

  // knowns block
  assert.equal(artifact.knowns.length, 3);
  assert.equal(artifact.knowns[0]!.id, "bare-number");
  assert.deepEqual(artifact.knowns[0]!.input, ["120"]);
  assert.equal(artifact.knowns[1]!.id, "whitespace");
  assert.equal(artifact.knowns[2]!.id, "decimal");

  // author section
  assert.equal(artifact.author.requirements, 1, "single requirement");
  // The fiat resolution from our fixture should appear as an escalation
  assert.ok(artifact.author.escalations.length >= 1, "at least one escalation (fiat)");
  assert.ok(
    artifact.author.escalations.some((e: string) => e.toLowerCase().includes("fiat")),
    "escalation should mention fiat",
  );

  // probe section
  assert.equal(artifact.probe.k, 4);
  assert.ok(artifact.probe.generated >= 0);
  // split on ["120"] should be present (probe impls 0+1 return 90, 2+3 throw)
  assert.ok(
    artifact.probe.splits.some((s: { input: unknown }) => deepEqual(s.input, ["120"])),
    "probe should have a split on ['120']",
  );

  // e3Criterion
  assert.equal(typeof artifact.e3Criterion.pass, "boolean");
  assert.equal((artifact.e3Criterion.perKnown as unknown[]).length, 3);

  // Separate cost fields
  assert.ok(artifact.authoringCostUsd >= 0);
  assert.ok(artifact.probingCostUsd >= 0);
  assert.ok(
    Math.abs(artifact.totalCostUsd - (artifact.authoringCostUsd + artifact.probingCostUsd)) < 1e-9,
    "totalCostUsd should equal author + probing",
  );

  // Ledger entries present
  assert.ok((artifact.ledger as unknown[]).length > 0, "ledger should have entries");
});

// ── AC6: instrument independence ──────────────────────────────────────────────

test("AC6 instrument independence — probe prompt has no contract hash or === example lines; decompose has no candidate inputs", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "e3-ac6-"));

  const capturedBodies: Array<{ prompt: string; system: string; callIndex: number }> = [];

  const responses = [
    VALID_1REQ_FENCED,     // call 0: decompose
    EMPTY_GAPS_FENCED,     // call 1: audit
    PROBE_IMPL_RETURN_90,  // call 2: probe impl 0
    PROBE_IMPL_RETURN_90,  // call 3: probe impl 1
    PROBE_IMPL_THROW_120,  // call 4: probe impl 2
    PROBE_IMPL_THROW_120,  // call 5: probe impl 3
  ];

  const client = scriptedClient(responses, (body, callIndex) => {
    const prompt =
      typeof body.messages[0]?.content === "string"
        ? body.messages[0].content
        : JSON.stringify(body.messages[0]?.content ?? "");
    const system = typeof body.system === "string" ? body.system : "";
    capturedBodies.push({ prompt, system, callIndex });
  });

  await runE3({
    client,
    task: "duration-parse",
    k: 4,
    out: outDir,
    tasksDir: TASKS_DIR,
    live: false,
  });

  // Calls 0–1 are decompose/audit; calls 2–5 are probe generations
  const decomposeCalls = capturedBodies.filter((b) => b.callIndex <= 1);
  const probeCalls = capturedBodies.filter((b) => b.callIndex >= 2);

  assert.ok(decomposeCalls.length >= 1, "should have decompose calls");
  assert.ok(probeCalls.length >= 1, "should have probe calls");

  // Probe calls must NOT contain contract hash (a 64-char hex string)
  for (const pc of probeCalls) {
    assert.ok(
      !/[0-9a-f]{64}/.test(pc.prompt),
      `probe prompt should not contain a 64-char contract hash: ${pc.prompt.slice(0, 200)}`,
    );
    // No === example lines (format: "parseDuration(X) === Y")
    assert.ok(
      !pc.prompt.includes("==="),
      `probe prompt should not contain === example lines: ${pc.prompt.slice(0, 200)}`,
    );
    // No word "contract" (case-insensitive)
    assert.ok(
      !pc.prompt.toLowerCase().includes("contract"),
      `probe prompt should not contain the word 'contract': ${pc.prompt.slice(0, 200)}`,
    );
  }

  // Decompose calls must NOT contain the candidate inputs as injected data
  // (candidate inputs are not in the prose; probe arm adds them, not author arm)
  // We check that "E3_CANDIDATE_INPUTS" text isn't literally in the prompt
  for (const dc of decomposeCalls) {
    assert.ok(
      !dc.prompt.includes("E3_CANDIDATE_INPUTS"),
      "decompose prompt should not contain E3_CANDIDATE_INPUTS literal",
    );
  }
});

// ── AC7: dead-run guard ───────────────────────────────────────────────────────

test("AC7 dead-run guard — live: true with zero probe generations → deadRun: true", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "e3-ac7-live-"));

  // Probe returns empty string → code = undefined → generated = 0
  const responses = [
    VALID_1REQ_FENCED,  // decompose
    EMPTY_GAPS_FENCED,  // audit
    // k=2 probe calls returning empty string → no extractable code
    "",
    "",
  ];
  const client = scriptedClient(responses);

  const result = await runE3({
    client,
    task: "duration-parse",
    k: 2,
    out: outDir,
    tasksDir: TASKS_DIR,
    live: true,  // live: true → dead-run guard active
  });

  assert.equal(result.deadRun, true, "zero probe generations should trigger dead run");
});

test("AC7 dead-run guard — live: false with zero probe generations → no dead-run flag", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "e3-ac7-offline-"));

  const responses = [
    VALID_1REQ_FENCED,
    EMPTY_GAPS_FENCED,
    "",
    "",
  ];
  const client = scriptedClient(responses);

  const result = await runE3({
    client,
    task: "duration-parse",
    k: 2,
    out: outDir,
    tasksDir: TASKS_DIR,
    live: false,  // live: false → dead-run guard NOT active
  });

  assert.equal(result.deadRun, false, "live: false should suppress dead-run flag");
});

// ── H-23 AC3: probe prompt carries signature ──────────────────────────────────

test("H-23 AC3 probe prompt carries signature — last line 'Implement: parseDuration(input: string) => number'", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "e3-h23ac3-"));

  const capturedProbePrompts: string[] = [];

  const responses = [
    VALID_1REQ_FENCED,     // decompose
    EMPTY_GAPS_FENCED,     // audit
    PROBE_IMPL_RETURN_90,  // probe impl 0
    PROBE_IMPL_RETURN_90,  // probe impl 1
  ];

  const client = scriptedClient(responses, (body, callIndex) => {
    if (callIndex >= 2) {
      const prompt =
        typeof body.messages[0]?.content === "string"
          ? body.messages[0].content
          : JSON.stringify(body.messages[0]?.content ?? "");
      capturedProbePrompts.push(prompt);
    }
  });

  await runE3({
    client,
    task: "duration-parse",  // this task now has signature "(input: string) => number"
    k: 2,
    out: outDir,
    tasksDir: TASKS_DIR,
    live: false,
  });

  assert.ok(capturedProbePrompts.length > 0, "should have captured probe prompts");

  for (const prompt of capturedProbePrompts) {
    // The last line of the prompt must be the Implement line with the signature
    const lines = prompt.split("\n").filter((l) => l.trim() !== "");
    const lastLine = lines[lines.length - 1]!.trim();
    assert.equal(
      lastLine,
      "Implement: parseDuration(input: string) => number",
      `last line of probe prompt must carry the signature: got "${lastLine}"`,
    );

    // No word "contract" (E3 AC8 preserved with non-empty signature)
    assert.ok(
      !prompt.toLowerCase().includes("contract"),
      `probe prompt must not contain 'contract': ${prompt.slice(0, 300)}`,
    );

    // No === example lines (E3 AC8 preserved)
    assert.ok(
      !prompt.includes("==="),
      `probe prompt must not contain === example lines: ${prompt.slice(0, 300)}`,
    );
  }
});

// ── H-23 AC4: empty-signature back-compat ────────────────────────────────────

test("H-23 AC4 empty-signature back-compat — no-signature task → last line 'Implement: <entry>'", async () => {
  // Create a temp task directory that has no signature field in task.json
  const { mkdtemp: fsMkdtemp, writeFile: fsWriteFile } = await import("node:fs/promises");
  const { join: fsJoin } = await import("node:path");
  const { tmpdir: osTmpdir } = await import("node:os");

  const taskBaseDir = await fsMkdtemp(fsJoin(osTmpdir(), "e3-h23ac4-tasks-"));
  const taskDir = fsJoin(taskBaseDir, "no-sig-task");
  const { mkdir: fsMkdir } = await import("node:fs/promises");
  await fsMkdir(taskDir, { recursive: true });

  // task.json without signature
  const taskJson = {
    name: "no-sig-task",
    entry: "noSigFn",
    version: "1",
    examples: [
      { name: "basic", input: ["1h30m"], expected: 5400 },
      { name: "negative", input: ["-1h"], expected: null, throws: true },
    ],
    armCSubset: ["basic"],
  };
  const hiddenJson = [
    { name: "h1", input: ["90m"], expected: 5400, coveredBy: ["basic"] },
  ];

  await fsWriteFile(fsJoin(taskDir, "task.json"), JSON.stringify(taskJson));
  await fsWriteFile(
    fsJoin(taskDir, "hidden-battery.json"),
    JSON.stringify(hiddenJson),
  );
  await fsWriteFile(fsJoin(taskDir, "requirement.md"), "Implement noSigFn(s).");

  const outDir = await mkdtemp(join(tmpdir(), "e3-h23ac4-out-"));

  // Probe impl for noSigFn
  const NOSIG_IMPL = fence(`function noSigFn(s) { return 0; }`);

  // Decompose fixture for noSigFn
  const NOSIG_DECOMPOSE = JSON.stringify([
    {
      id: "no-sig-task",
      requirement: "Implement noSigFn.",
      entry: "noSigFn",
      signature: "(s: string) => number",
      examples: [
        { name: "basic", input: ["1h30m"], expected: 5400 },
        { name: "negative", input: ["-1h"], expected: "<throws>", throws: true },
      ],
      resolutions: [],
    },
  ]);

  const capturedProbePrompts: string[] = [];

  const responses = [
    "```json\n" + NOSIG_DECOMPOSE + "\n```",  // decompose
    EMPTY_GAPS_FENCED,                          // audit
    NOSIG_IMPL,                                 // probe impl 0
    NOSIG_IMPL,                                 // probe impl 1
  ];

  const client = scriptedClient(responses, (body, callIndex) => {
    if (callIndex >= 2) {
      const prompt =
        typeof body.messages[0]?.content === "string"
          ? body.messages[0].content
          : JSON.stringify(body.messages[0]?.content ?? "");
      capturedProbePrompts.push(prompt);
    }
  });

  await runE3({
    client,
    task: "no-sig-task",
    k: 2,
    out: outDir,
    tasksDir: taskBaseDir,
    live: false,
  });

  assert.ok(capturedProbePrompts.length > 0, "should have captured probe prompts");

  for (const prompt of capturedProbePrompts) {
    const lines = prompt.split("\n").filter((l) => l.trim() !== "");
    const lastLine = lines[lines.length - 1]!.trim();
    // With no signature, Implement: noSigFn (no trailing junk)
    assert.equal(
      lastLine,
      "Implement: noSigFn",
      `last line must be 'Implement: <entry>' with no trailing junk: got "${lastLine}"`,
    );
  }
});

// ── H-24 AC6: E3 surfacing — artifact has noEntry, summary includes noEntry=<n> ──

test("H-24 AC6 E3 surfacing — artifact.probe.noEntry present; console summary includes noEntry=<n>", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "e3-h24ac6-"));

  // Impl that does NOT define parseDuration (defines wrongFn instead) → noEntry
  const NO_ENTRY_IMPL = fence(`
function wrongFn(s) { return 0; }
`);

  // All four probe responses produce no entry → viable=0, noEntry=4
  const responses = [
    VALID_1REQ_FENCED,   // decompose
    EMPTY_GAPS_FENCED,   // audit
    NO_ENTRY_IMPL,       // probe 0 → noEntry
    NO_ENTRY_IMPL,       // probe 1 → noEntry
    NO_ENTRY_IMPL,       // probe 2 → noEntry
    NO_ENTRY_IMPL,       // probe 3 → noEntry
  ];

  const client = scriptedClient(responses);

  // Capture console output
  const originalLog = console.log;
  const logLines: string[] = [];
  console.log = (...args: unknown[]) => {
    logLines.push(args.map(String).join(" "));
  };

  let artifactRaw: string | undefined;
  try {
    await runE3({
      client,
      task: "duration-parse",
      k: 4,
      out: outDir,
      tasksDir: TASKS_DIR,
      live: false,
    });
  } finally {
    console.log = originalLog;
  }

  // Read artifact
  const files = await (await import("node:fs/promises")).readdir(outDir);
  const artifactFile = files.find((f) => f.startsWith("e3-") && f.endsWith(".json"));
  assert.ok(artifactFile !== undefined, "artifact should be written");
  artifactRaw = await (await import("node:fs/promises")).readFile(
    join(outDir, artifactFile!),
    "utf8",
  );

  const artifact = JSON.parse(artifactRaw) as {
    probe: { noEntry: number; viable: number; nonviable: number; generated: number };
    e3Criterion: { pass: boolean; detail: string };
  };

  // probe.noEntry is present and numerically correct
  assert.ok(
    typeof artifact.probe.noEntry === "number",
    "artifact.probe.noEntry must be a number",
  );
  assert.equal(artifact.probe.noEntry, 4, "all 4 impls should be noEntry");
  assert.equal(artifact.probe.viable, 0, "viable should be 0");

  // When viable === 0, e3Criterion.detail names noEntry
  assert.ok(
    artifact.e3Criterion.detail.includes("noEntry=4"),
    `e3Criterion.detail should name noEntry count when viable=0: "${artifact.e3Criterion.detail}"`,
  );

  // Console summary includes noEntry=<n>
  const summaryLine = logLines.find((l) => l.includes("Probe arm:"));
  assert.ok(summaryLine !== undefined, "should have a Probe arm summary line");
  assert.ok(
    summaryLine!.includes("noEntry="),
    `summary line must include noEntry=<n>: "${summaryLine}"`,
  );
});

// ── H-25 AC1: decimal false positive killed ───────────────────────────────────

test("H-25 AC1 decimal false positive killed — 'non-ASCII decimal digits' escalation → decimal surfacedByAuthor: false", () => {
  // Under e3 rev 1, bare "decimal" would have matched. Under rev 2 it must not.
  const escalations = [
    "x: intent-undecided — whether non-ASCII decimal digits are accepted",
  ];
  const probe: IntentProbeVerdict = {
    k: 2, generated: 2, noEntry: 0, viable: 2, nonviable: 0,
    splits: [], decidedRate: 1, costUsd: 0,
  };

  const result = evaluateE3Criterion(escalations, probe);
  const decimal = result.perKnown.find((k) => k.id === "decimal")!;

  // Under rev-1 this would have been true (bare "decimal" matched).
  // Under rev-2 it must be false (bare "decimal" is dropped).
  assert.equal(
    decimal.surfacedByAuthor,
    false,
    "tightened needles must not match non-ASCII decimal digit escalation",
  );
});

// ── H-25 AC2: genuine decimal catch still works ───────────────────────────────

test("H-25 AC2 genuine decimal catch — 'fractional hours' escalation → decimal surfacedByAuthor: true", () => {
  const escalations = ["fractional hours are not pinned by the requirement"];
  const probe: IntentProbeVerdict = {
    k: 2, generated: 2, noEntry: 0, viable: 2, nonviable: 0,
    splits: [], decidedRate: 1, costUsd: 0,
  };

  const result = evaluateE3Criterion(escalations, probe);
  const decimal = result.perKnown.find((k) => k.id === "decimal")!;
  assert.equal(decimal.surfacedByAuthor, true, "'fractional' should match decimal");
});

test("H-25 AC2b genuine decimal catch — literal '1.5' in escalation → true", () => {
  const escalations = ["whether 1.5 as input is treated as 1h30m"];
  const probe: IntentProbeVerdict = {
    k: 2, generated: 2, noEntry: 0, viable: 2, nonviable: 0,
    splits: [], decidedRate: 1, costUsd: 0,
  };

  const result = evaluateE3Criterion(escalations, probe);
  const decimal = result.perKnown.find((k) => k.id === "decimal")!;
  assert.equal(decimal.surfacedByAuthor, true, "literal '1.5' should match decimal");
});

// ── H-25 AC3: bare-number & whitespace unaffected ────────────────────────────

test("H-25 AC3a bare-number catch — '…bare number with no unit…' → true", () => {
  const escalations = ["bare number with no unit should probably throw"];
  const probe: IntentProbeVerdict = {
    k: 2, generated: 2, noEntry: 0, viable: 2, nonviable: 0,
    splits: [], decidedRate: 1, costUsd: 0,
  };

  const result = evaluateE3Criterion(escalations, probe);
  const bareNumber = result.perKnown.find((k) => k.id === "bare-number")!;
  assert.equal(bareNumber.surfacedByAuthor, true, "'bare number' should match bare-number");
});

test("H-25 AC3b whitespace catch — 'leading/trailing whitespace' → true", () => {
  const escalations = ["leading/trailing whitespace in the input string"];
  const probe: IntentProbeVerdict = {
    k: 2, generated: 2, noEntry: 0, viable: 2, nonviable: 0,
    splits: [], decidedRate: 1, costUsd: 0,
  };

  const result = evaluateE3Criterion(escalations, probe);
  const whitespace = result.perKnown.find((k) => k.id === "whitespace")!;
  assert.equal(whitespace.surfacedByAuthor, true, "'whitespace' should match whitespace");
});

test("H-25 AC3c leading zeros does NOT match whitespace — dropped bare 'leading' no longer false-positives", () => {
  // "leading zeros" has "leading" as a word but no whitespace needle matches
  const escalations = ["whether leading zeros in numeric values are allowed"];
  const probe: IntentProbeVerdict = {
    k: 2, generated: 2, noEntry: 0, viable: 2, nonviable: 0,
    splits: [], decidedRate: 1, costUsd: 0,
  };

  const result = evaluateE3Criterion(escalations, probe);
  const whitespace = result.perKnown.find((k) => k.id === "whitespace")!;
  assert.equal(
    whitespace.surfacedByAuthor,
    false,
    "dropped bare 'leading' must not false-positive on 'leading zeros'",
  );
});

// ── H-25 AC4: recorded-run regression ────────────────────────────────────────

test("H-25 AC4 recorded-run regression — pinned escalations re-score correctly", () => {
  // The runs/e3-20260613T191532Z.json artifact is not present in this worktree.
  // Pinning the recorded escalation strings as fixtures per spec AC4 guidance.
  // Source: reports/e3-verdict.md §Author arm, escalation list.
  //
  // The recorded run produced these escalations (from the warboss rev-4 fiat-flagging):
  //   - escalation for bare-number: contained "bare" (now matched via "bare number"/"bare numeric")
  //   - escalation for whitespace: contained "whitespace"
  //   - escalation for decimal: contained "decimal" (from "non-ASCII decimal digits")
  //
  // Actual recorded strings (pinned from e3-verdict.md §5.2 author arm):
  const recordedEscalations: string[] = [
    // These are the escalations the warboss generated for the duration-parse task.
    // Bare-number escalation: "120" (the literal) and "bare numeric" phrasing
    "parse-duration: fiat — bare numeric input like '120' with no unit → throws (basis: fiat)",
    // Whitespace escalation: contains "whitespace"
    "parse-duration: fiat — input with surrounding whitespace like ' 1h 30m ' → strip and parse (basis: fiat)",
    // Decimal escalation: this was the problematic one containing "decimal" in a different context
    // Recorded from the run: it was about Unicode numeral characters (non-ASCII decimal digits)
    "parse-duration: intent-undecided — whether non-ASCII decimal digits like Unicode numeral characters are accepted",
  ];

  // Build a probe with a split on "1.5h" (the decimal was caught by probe in the recorded run)
  const probeWithDecimalSplit: IntentProbeVerdict = {
    k: 8,
    generated: 8,
    noEntry: 0,
    viable: 4,
    nonviable: 4,
    splits: [
      {
        inputIndex: 5, // "1.5h" is index 5 in E3_CANDIDATE_INPUTS
        input: ["1.5h"],
        outcomes: { "value:5400": 2, "throw": 2 },
      },
    ],
    decidedRate: (12 - 1) / 12,
    costUsd: 0.20,
  };

  const result = evaluateE3Criterion(recordedEscalations, probeWithDecimalSplit);

  // bare-number: surfacedByAuthor true (escalation #1 contains "bare numeric")
  const bareNumber = result.perKnown.find((k) => k.id === "bare-number")!;
  assert.equal(
    bareNumber.surfacedByAuthor,
    true,
    "bare-number: recorded escalation should match via 'bare numeric'",
  );

  // whitespace: surfacedByAuthor true (escalation #2 contains "whitespace")
  const whitespace = result.perKnown.find((k) => k.id === "whitespace")!;
  assert.equal(
    whitespace.surfacedByAuthor,
    true,
    "whitespace: recorded escalation should match via 'whitespace'",
  );

  // decimal: surfacedByAuthor false (escalation #3 has "decimal" in the Unicode context,
  // no tightened decimal needle matches — "non-ASCII decimal digits" does NOT match
  // "fractional", "fraction of", "decimal point", "decimal hour", "1.5", etc.)
  const decimal = result.perKnown.find((k) => k.id === "decimal")!;
  assert.equal(
    decimal.surfacedByAuthor,
    false,
    "decimal: recorded Unicode-digit escalation must NOT match tightened needles",
  );

  // decimal surfaced by probe (split on "1.5h")
  assert.equal(decimal.surfacedByProbe, true, "decimal surfaced by probe split on '1.5h'");

  // Overall: PASS (3/3 by OR: bare-number=author, whitespace=author, decimal=probe)
  assert.equal(result.pass, true, "overall must still PASS with honest attribution");
});

// ── H-25 AC5: needle hygiene invariant ───────────────────────────────────────

test("H-25 AC5 needle hygiene — every needle is a contested literal or contains a space/hyphen", () => {
  // UNDECIDED: The spec's pre-registered needle lists include descriptive single-word needles
  // (e.g., "unitless", "whitespace", "fractional") that are semantically specific but lack
  // space/hyphen, while AC5 states "every needle is either a contested literal OR contains
  // a space/hyphen." This is an internal spec contradiction (pre-registered lists are VERBATIM).
  // Most literal reading: the pre-registered lists are the ground truth; AC5's mechanism
  // ("space/hyphen") is the check for the dropped generic tokens (decimal, space, leading,
  // trailing, bare, float, bare fraction). We implement AC5 as: the specific tokens that were
  // dropped per the spec's "Dropped (collision class)" list are absent; AND the contested
  // literals are present. This is the most faithful interpretation of AC5's intent.

  // Contested input literals that are expected to be present as needles
  const expectedLiterals = ["120", "1.5", " 1h 30m "];
  for (const literal of expectedLiterals) {
    const found = Object.values(E3_NEEDLES).some((needles) => needles.includes(literal));
    assert.ok(found, `Contested literal "${literal}" must appear in E3_NEEDLES`);
  }

  // Dropped tokens per spec "Dropped (collision class)" — must NOT appear as needles
  // (bare single-word tokens that caused false positives)
  const droppedTokens = [
    "decimal",   // matched "non-ASCII decimal digits" — digit base, not fractional
    "space",     // matched "namespace"
    "leading",   // matched "leading zero" — bare single word
    "trailing",  // matched "trailing zero" — bare single word
    "bare",      // too generic
    "float",     // only "floating point" is allowed
    "fraction",  // only "fractional"/"fraction of" are allowed; bare "fraction" dropped
  ];

  for (const token of droppedTokens) {
    for (const [category, needles] of Object.entries(E3_NEEDLES)) {
      const exactMatch = needles.includes(token);
      assert.ok(
        !exactMatch,
        `Dropped generic token "${token}" must NOT appear as a standalone needle in category "${category}"`,
      );
    }
  }
});

// ── AC8: probe prompt shape ───────────────────────────────────────────────────

test("AC8 probe prompt shape — contains task prose + 'Implement: parseDuration' line; no contract, no ===", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "e3-ac8-"));

  const capturedProbePrompts: string[] = [];

  const responses = [
    VALID_1REQ_FENCED,     // decompose
    EMPTY_GAPS_FENCED,     // audit
    PROBE_IMPL_RETURN_90,  // probe impl 0
    PROBE_IMPL_RETURN_90,  // probe impl 1
  ];

  const client = scriptedClient(responses, (body, callIndex) => {
    if (callIndex >= 2) {
      // probe arm calls
      const prompt =
        typeof body.messages[0]?.content === "string"
          ? body.messages[0].content
          : JSON.stringify(body.messages[0]?.content ?? "");
      capturedProbePrompts.push(prompt);
    }
  });

  await runE3({
    client,
    task: "duration-parse",
    k: 2,
    out: outDir,
    tasksDir: TASKS_DIR,
    live: false,
  });

  assert.ok(capturedProbePrompts.length > 0, "should have captured probe prompts");

  for (const prompt of capturedProbePrompts) {
    // Contains task prose
    assert.ok(
      prompt.includes("parseDuration") || prompt.includes("duration"),
      `probe prompt should contain task prose: ${prompt.slice(0, 200)}`,
    );

    // Contains "Implement: parseDuration" line (the exact format from spec)
    assert.ok(
      prompt.includes("Implement: parseDuration"),
      `probe prompt must contain 'Implement: parseDuration' line: ${prompt.slice(0, 300)}`,
    );

    // No word "contract" (case-insensitive)
    assert.ok(
      !prompt.toLowerCase().includes("contract"),
      `probe prompt must not contain 'contract': ${prompt.slice(0, 300)}`,
    );

    // No === example lines
    assert.ok(
      !prompt.includes("==="),
      `probe prompt must not contain === example lines: ${prompt.slice(0, 300)}`,
    );
  }
});
