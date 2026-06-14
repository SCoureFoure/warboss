/** AC1–AC9 (decompose-run rev 2) + AC5–AC9 (kickback-pipeline rev 1). Offline, fake client. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import type { MessagesClient } from "../src/agent.ts";
import { Contract } from "../src/contract.ts";
import { DecompositionParseError } from "../src/warboss.ts";
import {
  runDecompose,
  parseCliArgs,
  type DecomposeArtifact,
} from "../src/experiment/decompose-run.ts";
import type { AnswerQueue } from "../src/kickback.ts";

interface ScriptedResponse {
  text: string;
  usage?: { input_tokens: number; output_tokens: number };
}

/** Call-order-keyed fake client (pattern: test/warboss.test.ts). */
function scriptedClient(responses: ScriptedResponse[]): {
  client: MessagesClient;
  calls: () => number;
} {
  let call = 0;
  return {
    client: {
      messages: {
        create: async () => {
          const r = responses[call++];
          if (!r) throw new Error("unexpected call");
          return {
            content: [{ type: "text", text: r.text }],
            usage: r.usage ?? { input_tokens: 10, output_tokens: 5 },
          } as unknown as Anthropic.Message;
        },
      },
    },
    calls: () => call,
  };
}

// rev 4: all requirement fixtures carry resolutions: []
const VALID_2REQ = [
  {
    id: "parse-duration",
    requirement: "Parse a duration string like '1h30m' and return total seconds.",
    entry: "parseDuration",
    signature: "(s: string) => number",
    examples: [
      { name: "basic", input: ["1h30m"], expected: 5400 },
      { name: "invalid", input: ["-1h"], expected: "<throws>", throws: true },
    ],
    resolutions: [],
  },
  {
    id: "format-duration",
    requirement: "Format a number of seconds as a duration string like '1h30m'.",
    entry: "formatDuration",
    signature: "(n: number) => string",
    examples: [
      { name: "basic", input: [5400], expected: "1h30m" },
      { name: "negative", input: [-1], expected: "<throws>", throws: true },
    ],
    resolutions: [],
  },
];

const VALID_2REQ_FENCED = "```json\n" + JSON.stringify(VALID_2REQ) + "\n```";
const EMPTY_GAPS_FENCED = "```json\n[]\n```";

function ledgerSum(artifact: DecomposeArtifact): number {
  return artifact.ledger.reduce((acc, e) => acc + e.costUsd, 0);
}

function assertCostIdentity(artifact: DecomposeArtifact): void {
  // rev 4: no gate.judge entries — admission is probe-only, no model calls for no-battery kick-backs
  const draftCost = artifact.ledger
    .filter((e) => e.kind.startsWith("warboss."))
    .reduce((acc, e) => acc + e.costUsd, 0);
  const admitCost = artifact.ledger
    .filter((e) => e.kind.startsWith("gate."))
    .reduce((acc, e) => acc + e.costUsd, 0);
  assert.ok(
    Math.abs(artifact.totalCostUsd - (draftCost + admitCost)) < 1e-9,
    `totalCostUsd ${artifact.totalCostUsd} should equal draft ${draftCost} + admission ${admitCost}`,
  );
  assert.ok(
    Math.abs(artifact.totalCostUsd - ledgerSum(artifact)) < 1e-9,
    `totalCostUsd ${artifact.totalCostUsd} should equal ledger sum ${ledgerSum(artifact)}`,
  );
}

async function freshOutDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "decompose-run-test-"));
}

test("AC1 — happy path artifact: 2 requirements, empty audit, both kicked back (no probe batteries)", async () => {
  // rev 4: runDecompose passes empty probes map → both contracts kick back with no-battery question
  const { client } = scriptedClient([
    { text: VALID_2REQ_FENCED },
    { text: EMPTY_GAPS_FENCED },
    // No more judge calls — probe-only admission with empty map makes no model calls
  ]);
  const out = await freshOutDir();

  const result = await runDecompose({
    client,
    intent: "Parse and format durations",
    out,
  });
  const artifact = result.artifact;

  assert.equal(artifact.requirements.length, 2);
  assert.equal(artifact.contracts.length, 2);
  assert.deepEqual(artifact.auditGaps, []);
  // rev 4: both kicked back (no probe batteries)
  assert.equal(artifact.admission.admitted.length, 0, "no batteries → none admitted");
  assert.equal(artifact.admission.kickedBack.length, 2, "both kicked back");

  // kicked-back questions are the no-battery strings
  assert.ok(
    artifact.admission.kickedBack[0]?.questions[0]?.includes("no probe battery supplied for"),
    `first kicked-back question: ${artifact.admission.kickedBack[0]?.questions[0]}`,
  );
  assert.ok(
    artifact.admission.kickedBack[1]?.questions[0]?.includes("no probe battery supplied for"),
    `second kicked-back question: ${artifact.admission.kickedBack[1]?.questions[0]}`,
  );

  // contracts[].hash matches the frozen contract of the source requirement
  artifact.contracts.forEach((c, i) => {
    const req = artifact.requirements[i]!;
    assert.equal(c.id, req.id);
    assert.equal(c.version, "1");
    const frozen = Contract.freeze({
      requirement: req.requirement,
      entry: req.entry,
      version: "1",
      examples: req.examples,
    });
    assert.equal(c.hash, frozen.hash, `contract ${c.id} hash matches frozen`);
  });

  assert.ok(
    Math.abs(artifact.totalCostUsd - ledgerSum(artifact)) < 1e-9,
    "totalCostUsd equals ledger sum",
  );

  // Artifact file written with the same content
  const files = await readdir(out);
  const artifactFiles = files.filter(
    (f) => f.startsWith("decompose-") && f.endsWith(".json"),
  );
  assert.equal(artifactFiles.length, 1, "exactly one artifact file");
  const onDisk = JSON.parse(
    await readFile(join(out, artifactFiles[0]!), "utf8"),
  ) as DecomposeArtifact;
  assert.deepEqual(onDisk, JSON.parse(JSON.stringify(artifact)));
  assert.equal(onDisk.intent, "Parse and format durations");
  assert.equal(onDisk.context, null);

  // AC3 leg on the AC1 fixture
  assertCostIdentity(artifact);
});

test("AC2 — kick-back surfaced: both requirements kicked back with no-battery question", async () => {
  // rev 4: empty probes map → both get kicked back
  const { client } = scriptedClient([
    { text: VALID_2REQ_FENCED },
    { text: EMPTY_GAPS_FENCED },
    // No model calls for admission
  ]);
  const out = await freshOutDir();

  const result = await runDecompose({
    client,
    intent: "Parse and format durations",
    out,
  });
  const artifact = result.artifact;

  assert.equal(artifact.admission.admitted.length, 0);
  assert.equal(artifact.admission.kickedBack.length, 2);

  // Both kicked back with the no-battery question, naming their requirement id
  const kb0 = artifact.admission.kickedBack[0]!;
  const kb1 = artifact.admission.kickedBack[1]!;
  assert.ok(kb0.questions[0]?.includes(kb0.id), `question names id: ${kb0.questions[0]}`);
  assert.ok(kb1.questions[0]?.includes(kb1.id), `question names id: ${kb1.questions[0]}`);

  // AC3 leg on the AC2 fixture
  assertCostIdentity(artifact);
});

test("AC3 — cost identity holds in both fixtures (explicit)", async () => {
  // Both AC1/AC2 already assert via assertCostIdentity; this run pins the
  // identity on its own fixture for direct traceability to the AC.
  const { client } = scriptedClient([
    { text: VALID_2REQ_FENCED },
    { text: EMPTY_GAPS_FENCED },
  ]);
  const out = await freshOutDir();
  const { artifact } = await runDecompose({
    client,
    intent: "durations",
    out,
  });
  assertCostIdentity(artifact);
  // warboss calls have nonzero cost; admission has zero (no model calls for no-battery)
  const warbossCost = artifact.ledger
    .filter((e) => e.kind.startsWith("warboss."))
    .reduce((acc, e) => acc + e.costUsd, 0);
  assert.ok(warbossCost > 0, "warboss calls carry nonzero cost");
});

test("AC4 — intent input validation: both / neither → descriptive error, no model call", () => {
  const { calls } = scriptedClient([]);

  assert.throws(
    () => parseCliArgs(["--intent", "do x", "--intent-file", "intent.md"]),
    (err: Error) => {
      assert.ok(
        err.message.includes("--intent") && err.message.includes("--intent-file"),
        `error names the conflict: ${err.message}`,
      );
      assert.ok(err.message.includes("both"), `names both-given: ${err.message}`);
      return true;
    },
  );

  assert.throws(
    () => parseCliArgs([]),
    (err: Error) => {
      assert.ok(
        err.message.includes("--intent") && err.message.includes("--intent-file"),
        `error names the conflict: ${err.message}`,
      );
      assert.ok(err.message.includes("neither"), `names neither-given: ${err.message}`);
      return true;
    },
  );

  // No model call happened: the scripted client was never invoked (ledger
  // equivalent — parse fails before any agent exists).
  assert.equal(calls(), 0, "zero model calls");
});

test("AC5 — fail-up propagation: both decompose calls unparseable → rejects, no artifact", async () => {
  const { client, calls } = scriptedClient([
    { text: "prose without fence" },
    { text: "still no fence" },
  ]);
  const out = await freshOutDir();

  await assert.rejects(
    () => runDecompose({ client, intent: "durations", out }),
    (err: unknown) => {
      assert.ok(err instanceof DecompositionParseError, "DecompositionParseError propagates");
      return true;
    },
  );

  assert.equal(calls(), 2, "exactly the two decompose calls");
  const files = await readdir(out);
  assert.deepEqual(
    files.filter((f) => f.startsWith("decompose-")),
    [],
    "no artifact file written",
  );
});

test("AC6 — dead-run guard: live + zero cost → deadRun stamped; live false → no stamp", async () => {
  const zero = { input_tokens: 0, output_tokens: 0 };
  // rev 4: only 2 model calls (decompose + audit); admission is probe-only, no model calls
  const zeroCostScript = (): ScriptedResponse[] => [
    { text: VALID_2REQ_FENCED, usage: zero },
    { text: EMPTY_GAPS_FENCED, usage: zero },
  ];

  // live: true + zero-cost fixture → deadRun stamped, nonzero exit path
  const { client: liveClient } = scriptedClient(zeroCostScript());
  const outLive = await freshOutDir();
  const liveResult = await runDecompose({
    client: liveClient,
    intent: "durations",
    out: outLive,
    live: true,
  });
  assert.equal(liveResult.deadRun, true, "deadRun signals the nonzero exit path");
  assert.equal(liveResult.artifact.deadRun, true, "artifact stamped deadRun: true");
  const onDisk = JSON.parse(
    await readFile(liveResult.artifactPath, "utf8"),
  ) as DecomposeArtifact;
  assert.equal(onDisk.deadRun, true, "stamp persisted in artifact file");

  // live: false → no stamp failure
  const { client: offlineClient } = scriptedClient(zeroCostScript());
  const outOffline = await freshOutDir();
  const offlineResult = await runDecompose({
    client: offlineClient,
    intent: "durations",
    out: outOffline,
  });
  assert.equal(offlineResult.deadRun, false);
  assert.equal(offlineResult.artifact.deadRun, undefined, "no deadRun stamp when not live");
});

test("AC7 — jsonl sidecar: one sidecar beside artifact, matching ts, one line per call, cost sum == totalCostUsd", async () => {
  const { client } = scriptedClient([
    { text: VALID_2REQ_FENCED },
    { text: EMPTY_GAPS_FENCED },
  ]);
  const out = await freshOutDir();

  const result = await runDecompose({
    client,
    intent: "Parse and format durations",
    out,
  });

  const files = await readdir(out);

  // Exactly one artifact file and exactly one sidecar
  const artifactFiles = files.filter(
    (f) => f.startsWith("decompose-") && f.endsWith(".json"),
  );
  const sidecarFiles = files.filter(
    (f) => f.startsWith("cost-ledger-") && f.endsWith(".jsonl"),
  );
  assert.equal(artifactFiles.length, 1, "exactly one artifact file");
  assert.equal(sidecarFiles.length, 1, "exactly one sidecar file");

  // Timestamps match between artifact and sidecar
  const artifactTs = artifactFiles[0]!.replace("decompose-", "").replace(".json", "");
  const sidecarTs = sidecarFiles[0]!.replace("cost-ledger-", "").replace(".jsonl", "");
  assert.equal(artifactTs, sidecarTs, "artifact and sidecar share the same timestamp");

  // Sidecar has one JSON line per metered model call
  const sidecarContent = await readFile(join(out, sidecarFiles[0]!), "utf8");
  const sidecarLines = sidecarContent.trim().split("\n").filter((l) => l.trim().length > 0);
  assert.ok(sidecarLines.length > 0, "sidecar has at least one line");

  // Sum of sidecar costUsd equals artifact totalCostUsd
  const sidecarEntries = sidecarLines.map((line) => JSON.parse(line) as { costUsd: number });
  const sidecarCostSum = sidecarEntries.reduce((acc, e) => acc + e.costUsd, 0);
  assert.ok(
    Math.abs(sidecarCostSum - result.artifact.totalCostUsd) < 1e-9,
    `sidecar costUsd sum ${sidecarCostSum} should equal artifact totalCostUsd ${result.artifact.totalCostUsd}`,
  );

  // Artifact ledger length equals sidecar line count
  assert.equal(
    result.artifact.ledger.length,
    sidecarLines.length,
    "artifact ledger length equals sidecar line count",
  );
});

test("AC8 — --max-requirements NaN/range guard: bad values throw at parse time, valid integer passes", () => {
  const { calls } = scriptedClient([]);

  // "abc" is not a number → throw naming the bad value
  assert.throws(
    () => parseCliArgs(["--intent", "x", "--max-requirements", "abc"]),
    (err: Error) => {
      assert.ok(
        err.message.includes("abc"),
        `error names the bad value: ${err.message}`,
      );
      return true;
    },
    "--max-requirements abc should throw",
  );

  // "0" is < 1 → throw
  assert.throws(
    () => parseCliArgs(["--intent", "x", "--max-requirements", "0"]),
    (err: Error) => {
      assert.ok(
        err.message.includes("0"),
        `error names the bad value: ${err.message}`,
      );
      return true;
    },
    "--max-requirements 0 should throw",
  );

  // "-3" is < 1 → throw
  assert.throws(
    () => parseCliArgs(["--intent", "x", "--max-requirements", "-3"]),
    (err: Error) => {
      assert.ok(
        err.message.includes("-3"),
        `error names the bad value: ${err.message}`,
      );
      return true;
    },
    "--max-requirements -3 should throw",
  );

  // No model call happened at parse time
  assert.equal(calls(), 0, "zero model calls for all bad-value cases");

  // "5" is a valid positive integer → parses cleanly
  const opts = parseCliArgs(["--intent", "x", "--max-requirements", "5"]);
  assert.equal(opts.maxRequirements, 5, "--max-requirements 5 parses to 5");
});

test("AC9 — CRLF strip + healthy deadRun key omission", async () => {
  // CRLF strip: content ending "a\r\nb\r\n" → "a\r\nb" (interior \r\n preserved)
  const intentFileDir = await freshOutDir();
  const intentFilePath = join(intentFileDir, "intent.txt");
  // Write "a\r\nb\r\n" as raw bytes
  await writeFile(intentFilePath, Buffer.from("a\r\nb\r\n"));
  const opts = parseCliArgs(["--intent-file", intentFilePath]);
  assert.equal(opts.intent, "a\r\nb", "trailing \\r\\n stripped as one unit; interior preserved");

  // Pure LF ending also stripped
  await writeFile(intentFilePath, Buffer.from("hello\n"));
  const optsLF = parseCliArgs(["--intent-file", intentFilePath]);
  assert.equal(optsLF.intent, "hello", "trailing \\n stripped");

  // Healthy run: artifact has NO deadRun key
  const { client: healthyClient } = scriptedClient([
    { text: VALID_2REQ_FENCED },
    { text: EMPTY_GAPS_FENCED },
  ]);
  const outHealthy = await freshOutDir();
  const healthyResult = await runDecompose({
    client: healthyClient,
    intent: "Parse durations",
    out: outHealthy,
  });
  assert.equal(
    healthyResult.artifact.deadRun,
    undefined,
    "healthy run artifact has no deadRun key",
  );
  const healthyOnDisk = JSON.parse(
    await readFile(healthyResult.artifactPath, "utf8"),
  ) as Record<string, unknown>;
  assert.ok(
    !Object.prototype.hasOwnProperty.call(healthyOnDisk, "deadRun"),
    "healthy run artifact on disk has no deadRun key (grep-level absence)",
  );

  // Dead run: artifact stamps deadRun: true
  const zero = { input_tokens: 0, output_tokens: 0 };
  const { client: deadClient } = scriptedClient([
    { text: VALID_2REQ_FENCED, usage: zero },
    { text: EMPTY_GAPS_FENCED, usage: zero },
  ]);
  const outDead = await freshOutDir();
  const deadResult = await runDecompose({
    client: deadClient,
    intent: "durations",
    out: outDead,
    live: true,
  });
  assert.equal(deadResult.artifact.deadRun, true, "dead run stamps deadRun: true");
  const deadOnDisk = JSON.parse(
    await readFile(deadResult.artifactPath, "utf8"),
  ) as Record<string, unknown>;
  assert.equal(deadOnDisk["deadRun"], true, "dead run on-disk artifact has deadRun: true");
});

// ── Kickback AC5–AC9 — specs/kickback-pipeline.spec.md rev 1 ─────────────────
//
// Fixtures: a req with one fiat resolution (produces an escalation).
// All tests are offline (fake client + fixture artifact/queue in temp dirs).

const VALID_1REQ_WITH_FIAT = [
  {
    id: "parse-duration",
    requirement: "Parse a duration string like '1h30m' and return total seconds.",
    entry: "parseDuration",
    signature: "(s: string) => number",
    examples: [
      { name: "basic", input: ["1h30m"], expected: 5400 },
      { name: "bare-number", input: ["120"], expected: "<throws>", throws: true },
    ],
    resolutions: [
      {
        point: "bare integer with no time unit",
        chosen: "throws",
        basis: "fiat",
      },
    ],
  },
];

const VALID_1REQ_NO_FIAT = [
  {
    id: "parse-duration",
    requirement: "Parse a duration string like '1h30m' and return total seconds.",
    entry: "parseDuration",
    signature: "(s: string) => number",
    examples: [
      { name: "basic", input: ["1h30m"], expected: 5400 },
      { name: "invalid", input: ["-1h"], expected: "<throws>", throws: true },
    ],
    resolutions: [], // no fiat resolutions → no escalations
  },
];

const WITH_FIAT_FENCED = "```json\n" + JSON.stringify(VALID_1REQ_WITH_FIAT) + "\n```";
const NO_FIAT_FENCED = "```json\n" + JSON.stringify(VALID_1REQ_NO_FIAT) + "\n```";

// ── AC5: phase-1 emit when escalations present ────────────────────────────────

test("KB-AC5 — phase-1 emit: runDecompose with fiat escalations writes answers-needed-<ts>.json with same ts, answerQueuePath in result", async () => {
  const { client } = scriptedClient([
    { text: WITH_FIAT_FENCED },
    { text: EMPTY_GAPS_FENCED },
  ]);
  const out = await freshOutDir();

  const result = await runDecompose({
    client,
    intent: "Parse durations",
    out,
  });

  // answerQueuePath must be set
  assert.ok(result.answerQueuePath !== undefined, "answerQueuePath is set");

  // The queue file must exist
  const files = await readdir(out);
  const queueFiles = files.filter((f) => f.startsWith("answers-needed-") && f.endsWith(".json"));
  assert.equal(queueFiles.length, 1, "exactly one answers-needed file written");

  // The ts in the queue filename must match the artifact filename
  const artifactFiles = files.filter((f) => f.startsWith("decompose-") && f.endsWith(".json"));
  assert.equal(artifactFiles.length, 1, "exactly one artifact file");
  const artifactTs = artifactFiles[0]!.replace("decompose-", "").replace(".json", "");
  const queueTs = queueFiles[0]!.replace("answers-needed-", "").replace(".json", "");
  assert.equal(queueTs, artifactTs, "queue and artifact share the same timestamp");

  // answerQueuePath points at the queue file
  assert.ok(
    result.answerQueuePath!.endsWith(queueFiles[0]!),
    `answerQueuePath points at the queue file: ${result.answerQueuePath}`,
  );

  // Queue content: one stubbed answer per escalation (blank decisions, parsed ids)
  const queueRaw = await readFile(result.answerQueuePath!, "utf8");
  const queue = JSON.parse(queueRaw) as AnswerQueue;

  // The fiat escalation was produced by warboss: "parse-duration: fiat — bare integer with no time unit"
  assert.ok(queue.answers.length >= 1, "at least one answer in queue");
  for (const answer of queue.answers) {
    assert.equal(answer.decision, "", "stub answer has blank decision");
  }
  // The first answer should have requirementId = "parse-duration" (matches id grammar)
  const parseAnswer = queue.answers.find((a) => a.escalation.startsWith("parse-duration:"));
  assert.ok(parseAnswer !== undefined, "answer for parse-duration escalation present");
  assert.equal(parseAnswer!.requirementId, "parse-duration", "requirementId parsed from escalation");
});

// ── AC6: phase-1 silent when no escalations ───────────────────────────────────

test("KB-AC6 — phase-1 silent: no escalations → no answers-needed file, answerQueuePath absent", async () => {
  const { client } = scriptedClient([
    { text: NO_FIAT_FENCED },
    { text: EMPTY_GAPS_FENCED },
  ]);
  const out = await freshOutDir();

  const result = await runDecompose({
    client,
    intent: "Parse durations",
    out,
  });

  // answerQueuePath must NOT be set
  assert.equal(result.answerQueuePath, undefined, "answerQueuePath is absent when no escalations");

  // No answers-needed file written
  const files = await readdir(out);
  const queueFiles = files.filter((f) => f.startsWith("answers-needed-"));
  assert.equal(queueFiles.length, 0, "no answers-needed file written when no escalations");
});

// ── AC7: phase-3 re-author wiring ────────────────────────────────────────────

async function writeFixtureArtifact(
  outDir: string,
  artifactContent: Partial<DecomposeArtifact> & { intent: string },
): Promise<string> {
  const ts = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z") + "-fixture";
  const artifactPath = join(outDir, `decompose-${ts}.json`);
  const artifact: DecomposeArtifact = {
    intent: artifactContent.intent,
    context: artifactContent.context ?? null,
    requirements: artifactContent.requirements ?? [],
    contracts: artifactContent.contracts ?? [],
    auditGaps: artifactContent.auditGaps ?? [],
    escalations: artifactContent.escalations ?? [],
    admission: artifactContent.admission ?? { admitted: [], kickedBack: [] },
    ledger: artifactContent.ledger ?? [],
    totalCostUsd: artifactContent.totalCostUsd ?? 0,
  };
  await writeFile(artifactPath, JSON.stringify(artifact, null, 2));
  return artifactPath;
}

async function writeFixtureQueue(
  outDir: string,
  artifactPath: string,
  intent: string,
  context: string | null,
  decisions: string[],
): Promise<string> {
  const queuePath = join(outDir, "answers-needed-fixture.json");
  const queue: AnswerQueue = {
    intent,
    context,
    artifact: artifactPath,
    answers: decisions.map((d, i) => ({
      escalation: `parse-duration: fiat — escalation ${i}`,
      requirementId: "parse-duration",
      decision: d,
    })),
  };
  await writeFile(queuePath, JSON.stringify(queue, null, 2));
  return queuePath;
}

test("KB-AC7 — phase-3 re-author: decompose called with source intent + context containing renderDecisionBlock; artifact has reauthorOf + answersPath", async () => {
  const out = await freshOutDir();

  // Create a fixture source artifact with intent I and context C
  const sourceArtifactPath = await writeFixtureArtifact(out, {
    intent: "Parse a duration string",
    context: "Source context C",
    escalations: [],
  });

  // Create a filled queue answering it
  const queuePath = await writeFixtureQueue(
    out,
    sourceArtifactPath,
    "Parse a duration string",
    "Source context C",
    ["Owner decision A prose.", "Owner decision B prose."],
  );

  // Capture the decompose call's prompt to assert it contains the decision block
  let capturedPrompt: string | undefined;
  const { client } = scriptedClient([
    { text: NO_FIAT_FENCED },
    { text: EMPTY_GAPS_FENCED },
  ]);

  // Wrap the client to capture prompts
  const capturingClient: MessagesClient = {
    messages: {
      create: async (body: Anthropic.MessageCreateParamsNonStreaming) => {
        // Capture the first call (decompose)
        if (capturedPrompt === undefined) {
          const msg = body.messages[0];
          if (msg !== undefined) {
            capturedPrompt =
              typeof msg.content === "string"
                ? msg.content
                : JSON.stringify(msg.content);
          }
        }
        return client.messages.create(body);
      },
    },
  };

  const result = await runDecompose({
    client: capturingClient,
    intent: "", // will be overridden by source artifact
    out,
    reauthorFrom: sourceArtifactPath,
    answers: queuePath,
  });

  // Captured prompt must contain the source context AND the decision block
  assert.ok(capturedPrompt !== undefined, "decompose was called");
  assert.ok(
    capturedPrompt!.includes("Source context C"),
    `prompt contains source context: ${capturedPrompt!.slice(0, 400)}`,
  );
  assert.ok(
    capturedPrompt!.includes("The owner has DECIDED"),
    `prompt contains decision block header: ${capturedPrompt!.slice(0, 600)}`,
  );
  assert.ok(
    capturedPrompt!.includes("Owner decision A prose."),
    `prompt contains first decision: ${capturedPrompt!.slice(0, 800)}`,
  );
  assert.ok(
    capturedPrompt!.includes("Owner decision B prose."),
    `prompt contains second decision: ${capturedPrompt!.slice(0, 800)}`,
  );

  // Artifact carries reauthorOf and answersPath provenance
  assert.equal(
    result.artifact.reauthorOf,
    sourceArtifactPath,
    "artifact.reauthorOf = sourceArtifactPath",
  );
  assert.equal(
    result.artifact.answersPath,
    queuePath,
    "artifact.answersPath = queuePath",
  );

  // Verify on-disk artifact has the provenance keys
  const onDisk = JSON.parse(await readFile(result.artifactPath, "utf8")) as Record<string, unknown>;
  assert.equal(onDisk["reauthorOf"], sourceArtifactPath, "on-disk reauthorOf present");
  assert.equal(onDisk["answersPath"], queuePath, "on-disk answersPath present");
});

test("KB-AC7 variant — source artifact with context: null → re-author context is exactly the decision block (no separator)", async () => {
  const out = await freshOutDir();

  const sourceArtifactPath = await writeFixtureArtifact(out, {
    intent: "Parse a duration string",
    context: null, // no context
    escalations: [],
  });

  const queuePath = await writeFixtureQueue(
    out,
    sourceArtifactPath,
    "Parse a duration string",
    null,
    ["Decision prose only."],
  );

  let capturedContext: string | undefined;
  const { client } = scriptedClient([
    { text: NO_FIAT_FENCED },
    { text: EMPTY_GAPS_FENCED },
  ]);
  const capturingClient: MessagesClient = {
    messages: {
      create: async (body: Anthropic.MessageCreateParamsNonStreaming) => {
        if (capturedContext === undefined) {
          const msg = body.messages[0];
          if (msg !== undefined) {
            capturedContext =
              typeof msg.content === "string"
                ? msg.content
                : JSON.stringify(msg.content);
          }
        }
        return client.messages.create(body);
      },
    },
  };

  await runDecompose({
    client: capturingClient,
    intent: "",
    out,
    reauthorFrom: sourceArtifactPath,
    answers: queuePath,
  });

  // Context must start with the decision block (no leading source context or separator)
  assert.ok(capturedContext !== undefined, "decompose was called");
  assert.ok(
    capturedContext!.includes("The owner has DECIDED"),
    `context contains decision block: ${capturedContext!.slice(0, 400)}`,
  );
  // The decision block must appear without a leading source-context section
  // i.e., the prompt should NOT include "Source context C" or similar
  assert.ok(
    !capturedContext!.includes("Source context C"),
    "context does NOT include old source context when it was null",
  );
});

test("KB-AC7 variant — first-pass run omits reauthorOf and answersPath", async () => {
  const { client } = scriptedClient([
    { text: NO_FIAT_FENCED },
    { text: EMPTY_GAPS_FENCED },
  ]);
  const out = await freshOutDir();

  const result = await runDecompose({
    client,
    intent: "Parse durations",
    out,
  });

  // First-pass: reauthorOf and answersPath must be omitted
  assert.equal(result.artifact.reauthorOf, undefined, "first-pass omits reauthorOf");
  assert.equal(result.artifact.answersPath, undefined, "first-pass omits answersPath");

  const onDisk = JSON.parse(await readFile(result.artifactPath, "utf8")) as Record<string, unknown>;
  assert.ok(
    !Object.prototype.hasOwnProperty.call(onDisk, "reauthorOf"),
    "first-pass on-disk artifact has no reauthorOf key",
  );
  assert.ok(
    !Object.prototype.hasOwnProperty.call(onDisk, "answersPath"),
    "first-pass on-disk artifact has no answersPath key",
  );
});

// ── AC8: phase-3 provenance + arg guards ─────────────────────────────────────

test("KB-AC8 parseCliArgs — --reauthor-from without --answers throws", () => {
  assert.throws(
    () => parseCliArgs(["--reauthor-from", "runs/decompose-x.json"]),
    (err: Error) => {
      assert.ok(
        err.message.includes("--answers") || err.message.includes("together"),
        `error mentions --answers: ${err.message}`,
      );
      return true;
    },
  );
});

test("KB-AC8 parseCliArgs — --answers without --reauthor-from throws", () => {
  assert.throws(
    () => parseCliArgs(["--answers", "runs/answers-needed-x.json"]),
    (err: Error) => {
      assert.ok(
        err.message.includes("--reauthor-from") || err.message.includes("together"),
        `error mentions --reauthor-from: ${err.message}`,
      );
      return true;
    },
  );
});

test("KB-AC8 parseCliArgs — --reauthor-from + --intent throws (mutually exclusive)", () => {
  assert.throws(
    () =>
      parseCliArgs([
        "--reauthor-from",
        "runs/decompose-x.json",
        "--answers",
        "runs/answers-needed-x.json",
        "--intent",
        "some intent",
      ]),
    (err: Error) => {
      assert.ok(
        err.message.includes("mutually exclusive") || err.message.includes("--intent"),
        `error names mutual exclusion: ${err.message}`,
      );
      return true;
    },
  );
});

test("KB-AC8 parseCliArgs — --reauthor-from + --answers (no intent) → options carry reauthorFrom + answers", () => {
  const opts = parseCliArgs([
    "--reauthor-from",
    "runs/decompose-x.json",
    "--answers",
    "runs/answers-needed-x.json",
  ]);
  assert.equal(opts.reauthorFrom, "runs/decompose-x.json", "reauthorFrom set");
  assert.equal(opts.answers, "runs/answers-needed-x.json", "answers set");
  // intent is not set (empty string is the sentinel for "come from artifact")
  // No intentInline — the caller (runDecompose) ignores opts.intent in reauthor mode
});

test("KB-AC8 runDecompose — provenance mismatch: queue.artifact basename ≠ reauthorFrom basename → throws before model call", async () => {
  const out = await freshOutDir();

  const sourceArtifactPath = await writeFixtureArtifact(out, {
    intent: "Parse durations",
    context: null,
    escalations: [],
  });

  // Create a queue that claims to answer a DIFFERENT artifact
  const wrongArtifactPath = join(out, "decompose-WRONG-ARTIFACT.json");
  const mismatchedQueue: AnswerQueue = {
    intent: "Parse durations",
    context: null,
    artifact: wrongArtifactPath, // basename differs from sourceArtifactPath basename
    answers: [
      {
        escalation: "parse-duration: fiat — …",
        requirementId: "parse-duration",
        decision: "Some decision.",
      },
    ],
  };
  const mismatchedQueuePath = join(out, "answers-needed-mismatched.json");
  await writeFile(mismatchedQueuePath, JSON.stringify(mismatchedQueue));

  // Verify basenames differ (sanity check)
  assert.notEqual(
    basename(wrongArtifactPath),
    basename(sourceArtifactPath),
    "test setup: basenames must differ",
  );

  const { client } = scriptedClient([
    { text: NO_FIAT_FENCED },
    { text: EMPTY_GAPS_FENCED },
  ]);

  await assert.rejects(
    runDecompose({
      client,
      intent: "",
      out,
      reauthorFrom: sourceArtifactPath,
      answers: mismatchedQueuePath,
    }),
    (err: Error) => {
      assert.ok(
        err.message.includes("provenance") || err.message.includes("mismatch"),
        `error names provenance mismatch: ${err.message}`,
      );
      return true;
    },
  );
});

// ── AC9: re-author iterates (phase-1 re-applied) ─────────────────────────────

test("KB-AC9 — re-author with its own escalations emits a fresh answers-needed pointing at the NEW artifact", async () => {
  const out = await freshOutDir();

  // Create the original source artifact (the one we're re-authoring FROM)
  const sourceArtifactPath = await writeFixtureArtifact(out, {
    intent: "Parse a duration string",
    context: null,
    escalations: [], // source artifact had escalations (now answered)
  });

  // Create a filled queue answering the source artifact's escalations
  const queuePath = await writeFixtureQueue(
    out,
    sourceArtifactPath,
    "Parse a duration string",
    null,
    ["Decision prose for first round."],
  );

  // The re-author decompose run ITSELF still produces a fiat escalation
  const { client } = scriptedClient([
    { text: WITH_FIAT_FENCED }, // re-author decompose → still has a fiat escalation
    { text: EMPTY_GAPS_FENCED },
  ]);

  const result = await runDecompose({
    client,
    intent: "",
    out,
    reauthorFrom: sourceArtifactPath,
    answers: queuePath,
  });

  // Phase-1 re-applied: the re-author emits its own answers-needed
  assert.ok(
    result.answerQueuePath !== undefined,
    "re-author with escalations emits a fresh answers-needed queue",
  );

  // The fresh queue's artifact must point at the NEW re-author artifact (not the source)
  const freshQueueRaw = await readFile(result.answerQueuePath!, "utf8");
  const freshQueue = JSON.parse(freshQueueRaw) as AnswerQueue;

  // freshQueue.artifact must be the NEW re-author artifact, NOT the source
  assert.equal(
    freshQueue.artifact,
    result.artifactPath,
    `fresh queue artifact points at NEW re-author artifact (${result.artifactPath}), not source`,
  );
  assert.notEqual(
    freshQueue.artifact,
    sourceArtifactPath,
    "fresh queue artifact is NOT the source artifact",
  );

  // Sanity: the new artifact has reauthorOf = sourceArtifactPath
  assert.equal(
    result.artifact.reauthorOf,
    sourceArtifactPath,
    "new artifact's reauthorOf points at source",
  );
});
