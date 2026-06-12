/** AC1–AC6 — see specs/decompose-run.spec.md (rev 1; rev 4 warboss call-site update). Offline, fake client. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import type { MessagesClient } from "../src/agent.ts";
import { Contract } from "../src/contract.ts";
import { DecompositionParseError } from "../src/warboss.ts";
import {
  runDecompose,
  parseCliArgs,
  type DecomposeArtifact,
} from "../src/experiment/decompose-run.ts";

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
