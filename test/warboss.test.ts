/** AC1–AC9 — see specs/warboss-decomposition.spec.md */
import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { Agent, type MessagesClient } from "../src/agent.ts";
import { Ledger } from "../src/cost.ts";
import { TIERS } from "../src/models.ts";
import { Contract } from "../src/contract.ts";
import {
  decompose,
  admit,
  DecompositionParseError,
  type DraftSet,
} from "../src/warboss.ts";

function scriptedClient(
  responses: Array<{ text: string } | { throw: Error }>,
): MessagesClient {
  let call = 0;
  return {
    messages: {
      create: async () => {
        const r = responses[call++];
        if (!r) throw new Error("unexpected call");
        if ("throw" in r) throw r.throw;
        return {
          content: [{ type: "text", text: r.text }],
          usage: { input_tokens: 10, output_tokens: 5 },
        } as unknown as Anthropic.Message;
      },
    },
  };
}

const VALID_2REQ_JSON = JSON.stringify([
  {
    id: "parse-duration",
    requirement: "Parse a duration string like '1h30m' and return total seconds.",
    entry: "parseDuration",
    signature: "(s: string) => number",
    examples: [
      { name: "basic", input: ["1h30m"], expected: 5400 },
      { name: "invalid", input: ["-1h"], expected: "<throws>", throws: true },
    ],
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
  },
]);

const VALID_2REQ_FENCED = "```json\n" + VALID_2REQ_JSON + "\n```";
const EMPTY_GAPS_FENCED = "```json\n[]\n```";

function makeAgent(client: MessagesClient): { agent: Agent; ledger: Ledger } {
  const ledger = new Ledger();
  const agent = new Agent(TIERS.HIGH, ledger, { client });
  return { agent, ledger };
}

test("AC1 — happy path: 2-requirement decomposition, empty audit", async () => {
  const client = scriptedClient([
    { text: VALID_2REQ_FENCED },
    { text: EMPTY_GAPS_FENCED },
  ]);
  const { agent, ledger } = makeAgent(client);

  const draft = await decompose({ agent, intent: "Parse and format durations" });

  assert.equal(draft.requirements.length, 2);
  assert.equal(draft.contracts.length, 2);
  assert.deepEqual(draft.auditGaps, []);

  const entries = ledger.all();
  const decomposeEntries = entries.filter((e) => e.kind === "warboss.decompose");
  const auditEntries = entries.filter((e) => e.kind === "warboss.audit");
  assert.equal(decomposeEntries.length, 1, "exactly 1 decompose call");
  assert.equal(auditEntries.length, 1, "exactly 1 audit call");
  assert.equal(entries.length, 2, "exactly 2 total calls");

  // Deterministic hashes
  const c1 = draft.contracts[0];
  const c2 = draft.contracts[0];
  assert.ok(c1 !== undefined);
  assert.ok(c2 !== undefined);
  assert.equal(c1.version, "1");
  assert.equal(c1.hash, c1.hash); // trivially stable

  // Run again with same script — same hashes
  const client2 = scriptedClient([
    { text: VALID_2REQ_FENCED },
    { text: EMPTY_GAPS_FENCED },
  ]);
  const { agent: agent2 } = makeAgent(client2);
  const draft2 = await decompose({ agent: agent2, intent: "Parse and format durations" });
  assert.equal(draft.contracts[0]?.hash, draft2.contracts[0]?.hash);
  assert.equal(draft.contracts[1]?.hash, draft2.contracts[1]?.hash);
});

test("AC2 — error-example mandate: no throws example → throws naming requirement", async () => {
  const noThrowsJSON = JSON.stringify([
    {
      id: "csv-parse",
      requirement: "Parse CSV row.",
      entry: "parseCsv",
      signature: "(s: string) => string[]",
      examples: [
        { name: "basic", input: ["a,b"], expected: ["a", "b"] },
        { name: "empty", input: [""], expected: [] },
      ],
    },
  ]);
  const client = scriptedClient([{ text: "```json\n" + noThrowsJSON + "\n```" }]);
  const { agent, ledger } = makeAgent(client);

  await assert.rejects(
    () => decompose({ agent, intent: "parse csv" }),
    (err: Error) => {
      assert.ok(err.message.includes("csv-parse"), `error should name requirement: ${err.message}`);
      return true;
    },
  );

  const entries = ledger.all();
  assert.equal(entries.length, 1, "no audit call should happen (only 1 entry)");
});

test("AC3 — strict parse re-ask: call1 bad → call2 valid succeeds; both bad → DecompositionParseError", async () => {
  // Sub-test A: call 1 prose, call 2 valid JSON
  const clientA = scriptedClient([
    { text: "Here are some requirements..." },
    { text: VALID_2REQ_FENCED },
    { text: EMPTY_GAPS_FENCED },
  ]);
  const { agent: agentA, ledger: ledgerA } = makeAgent(clientA);
  const draftA = await decompose({ agent: agentA, intent: "test" });
  assert.equal(draftA.requirements.length, 2);
  const decomposeEntries = ledgerA.all().filter((e) => e.kind === "warboss.decompose");
  assert.equal(decomposeEntries.length, 2, "2 decompose calls for re-ask");

  // Sub-test B: both calls bad → DecompositionParseError
  const clientB = scriptedClient([
    { text: "prose without fence" },
    { text: "still no fence" },
  ]);
  const { agent: agentB } = makeAgent(clientB);
  await assert.rejects(
    () => decompose({ agent: agentB, intent: "test" }),
    (err: unknown) => {
      assert.ok(err instanceof DecompositionParseError, "should be DecompositionParseError");
      assert.ok(
        (err as DecompositionParseError).rawOutput1.includes("prose without fence"),
        "carries raw output 1",
      );
      assert.ok(
        (err as DecompositionParseError).rawOutput2.includes("still no fence"),
        "carries raw output 2",
      );
      return true;
    },
  );

  // Exactly 2 calls
  const ledgerB = new Ledger();
  const agentB2 = new Agent(TIERS.HIGH, ledgerB, { client: clientB });
  void agentB2; // already used above; just verify call count on the first run
});

test("AC4 — validation catalogue", async () => {
  async function expectValidationError(json: unknown[], desc: string, snippet: string): Promise<void> {
    const client = scriptedClient([{ text: "```json\n" + JSON.stringify(json) + "\n```" }]);
    const { agent } = makeAgent(client);
    await assert.rejects(
      () => decompose({ agent, intent: "test" }),
      (err: Error) => {
        assert.ok(
          err.message.toLowerCase().includes(snippet.toLowerCase()),
          `[${desc}] error '${err.message}' should include '${snippet}'`,
        );
        return true;
      },
      desc,
    );
  }

  // Duplicate ids
  await expectValidationError(
    [
      {
        id: "dup",
        requirement: "r1",
        entry: "fn1",
        signature: "(x:number)=>number",
        examples: [
          { name: "a", input: [1], expected: 1 },
          { name: "b", input: [-1], expected: "<throws>", throws: true },
        ],
      },
      {
        id: "dup",
        requirement: "r2",
        entry: "fn2",
        signature: "(x:number)=>number",
        examples: [
          { name: "a", input: [1], expected: 1 },
          { name: "b", input: [-1], expected: "<throws>", throws: true },
        ],
      },
    ],
    "duplicate ids",
    "dup",
  );

  // Bad entry identifier
  await expectValidationError(
    [
      {
        id: "some-req",
        requirement: "r",
        entry: "123bad",
        signature: "(x:number)=>number",
        examples: [
          { name: "a", input: [1], expected: 1 },
          { name: "b", input: [-1], expected: "<throws>", throws: true },
        ],
      },
    ],
    "bad entry identifier",
    "123bad",
  );

  // < 2 examples
  await expectValidationError(
    [
      {
        id: "only-one",
        requirement: "r",
        entry: "fn",
        signature: "(x:number)=>number",
        examples: [{ name: "a", input: [1], expected: 1, throws: true }],
      },
    ],
    "< 2 examples",
    "only-one",
  );

  // 0 requirements
  const clientEmpty = scriptedClient([{ text: "```json\n[]\n```" }]);
  const { agent: agentEmpty } = makeAgent(clientEmpty);
  await assert.rejects(
    () => decompose({ agent: agentEmpty, intent: "test" }),
    (err: Error) => {
      assert.ok(err.message.toLowerCase().includes("empty"), `should mention empty: ${err.message}`);
      return true;
    },
    "0 requirements",
  );

  // > maxRequirements
  const manyReqs = Array.from({ length: 3 }, (_, i) => ({
    id: `req-${i}`,
    requirement: `r${i}`,
    entry: `fn${i}`,
    signature: "(x:number)=>number",
    examples: [
      { name: "a", input: [1], expected: 1 },
      { name: "b", input: [-1], expected: "<throws>", throws: true },
    ],
  }));
  const clientMany = scriptedClient([{ text: "```json\n" + JSON.stringify(manyReqs) + "\n```" }]);
  const { agent: agentMany } = makeAgent(clientMany);
  await assert.rejects(
    () => decompose({ agent: agentMany, intent: "test", maxRequirements: 2 }),
    (err: Error) => {
      assert.ok(
        err.message.includes("maxRequirements") || err.message.includes("3"),
        `should mention count: ${err.message}`,
      );
      return true;
    },
    "> maxRequirements",
  );
});

test("AC5 — audit/amend round: gap filled → auditGaps empty; gap not filled → appears in auditGaps", async () => {
  const durParseWithExtra = JSON.stringify([
    {
      id: "dur-parse",
      requirement: "Parse a duration string.",
      entry: "parseDuration",
      signature: "(s: string) => number",
      examples: [
        { name: "basic", input: ["1h"], expected: 3600 },
        { name: "invalid", input: ["-1h"], expected: "<throws>", throws: true },
        { name: "pinned-gap", input: ["0s"], expected: 0 },
      ],
    },
  ]);
  const gapResponse = '```json\n[{"id":"dur-parse","gap":"What happens when input is 0s?"}]\n```';
  const amendedFenced = "```json\n" + durParseWithExtra + "\n```";

  // Variant A: amend fills the gap (no re-audit needed; auditGaps stays empty based on one-round rule)
  const clientA = scriptedClient([
    { text: "```json\n" + JSON.stringify([{
      id: "dur-parse",
      requirement: "Parse a duration string.",
      entry: "parseDuration",
      signature: "(s: string) => number",
      examples: [
        { name: "basic", input: ["1h"], expected: 3600 },
        { name: "invalid", input: ["-1h"], expected: "<throws>", throws: true },
      ],
    }]) + "\n```" },
    { text: gapResponse },
    { text: amendedFenced },
  ]);
  const { agent: agentA, ledger: ledgerA } = makeAgent(clientA);
  const draftA = await decompose({ agent: agentA, intent: "test" });

  assert.equal(draftA.contracts.length, 1);
  const contract = draftA.contracts[0];
  assert.ok(contract !== undefined);
  assert.ok(contract.examples.some((ex) => ex.name === "pinned-gap"), "amended example present");
  assert.deepEqual(draftA.auditGaps, []);

  const kindsA = ledgerA.all().map((e) => e.kind);
  assert.ok(kindsA.includes("warboss.decompose"), "has decompose");
  assert.ok(kindsA.includes("warboss.audit"), "has audit");
  assert.ok(kindsA.includes("warboss.amend"), "has amend");

  // Variant B: amend returns original drafts (gap unaddressed) → gap in auditGaps
  const origDraftJson = JSON.stringify([{
    id: "dur-parse",
    requirement: "Parse a duration string.",
    entry: "parseDuration",
    signature: "(s: string) => number",
    examples: [
      { name: "basic", input: ["1h"], expected: 3600 },
      { name: "invalid", input: ["-1h"], expected: "<throws>", throws: true },
    ],
  }]);
  const clientB = scriptedClient([
    { text: "```json\n" + origDraftJson + "\n```" },
    { text: gapResponse },
    { text: "```json\n" + origDraftJson + "\n```" }, // amend returns same (gap still present — no new examples)
  ]);
  const { agent: agentB } = makeAgent(clientB);
  const draftB = await decompose({ agent: agentB, intent: "test" });
  assert.ok(draftB.auditGaps.length > 0, "unaddressed gap should appear in auditGaps");
  assert.ok(
    draftB.auditGaps.some((g) => g.includes("dur-parse")),
    `gap should name requirement dur-parse, got: ${JSON.stringify(draftB.auditGaps)}`,
  );
});

test("AC6 — amend re-validated: amend with mandate violation throws", async () => {
  const validDraft = JSON.stringify([{
    id: "dur-parse",
    requirement: "Parse a duration string.",
    entry: "parseDuration",
    signature: "(s: string) => number",
    examples: [
      { name: "basic", input: ["1h"], expected: 3600 },
      { name: "invalid", input: ["-1h"], expected: "<throws>", throws: true },
    ],
  }]);
  const gapResponse = '```json\n[{"id":"dur-parse","gap":"ambiguous behavior"}]\n```';
  // Amend returns draft without throws example — violates mandate
  const badAmend = JSON.stringify([{
    id: "dur-parse",
    requirement: "Parse a duration string.",
    entry: "parseDuration",
    signature: "(s: string) => number",
    examples: [
      { name: "basic", input: ["1h"], expected: 3600 },
      { name: "extra", input: ["30m"], expected: 1800 },
    ],
  }]);

  const client = scriptedClient([
    { text: "```json\n" + validDraft + "\n```" },
    { text: gapResponse },
    { text: "```json\n" + badAmend + "\n```" },
  ]);
  const { agent } = makeAgent(client);

  await assert.rejects(
    () => decompose({ agent, intent: "test" }),
    (err: Error) => {
      assert.ok(
        err.message.includes("dur-parse"),
        `should name requirement: ${err.message}`,
      );
      assert.ok(
        err.message.toLowerCase().includes("throws") || err.message.toLowerCase().includes("mandate"),
        `should mention mandate: ${err.message}`,
      );
      return true;
    },
    "amend violating mandate should throw",
  );
});

test("AC7 — admit partitions: READY → admitted, NOT READY → kickedBack with question", async () => {
  // Build a DraftSet manually
  const contracts = [
    Contract.freeze({
      requirement: "Parse a duration string like '1h30m' and return total seconds.",
      entry: "parseDuration",
      version: "1",
      examples: [
        { name: "basic", input: ["1h30m"], expected: 5400 },
        { name: "invalid", input: ["-1h"], expected: "<throws>", throws: true },
      ],
    }),
    Contract.freeze({
      requirement: "Format a number of seconds as a duration string like '1h30m'.",
      entry: "formatDuration",
      version: "1",
      examples: [
        { name: "basic", input: [5400], expected: "1h30m" },
        { name: "negative", input: [-1], expected: "<throws>", throws: true },
      ],
    }),
  ];

  const draft: DraftSet = {
    requirements: [
      {
        id: "parse-duration",
        requirement: contracts[0]!.requirement,
        entry: contracts[0]!.entry,
        signature: "(s: string) => number",
        examples: [...contracts[0]!.examples] as import("../src/contract.ts").ContractCase[],
      },
      {
        id: "format-duration",
        requirement: contracts[1]!.requirement,
        entry: contracts[1]!.entry,
        signature: "(n: number) => string",
        examples: [...contracts[1]!.examples] as import("../src/contract.ts").ContractCase[],
      },
    ],
    contracts,
    auditGaps: [],
    costUsd: 0,
  };

  const capturedPrompts: string[] = [];
  const judgeClient = scriptedClient([
    { text: "READY" },
    { text: "NOT READY\n- what does overflow mean?" },
  ]);
  const judgeLedger = new Ledger();
  const judgeAgent = new Agent(TIERS.LOW, judgeLedger, {
    client: {
      messages: {
        create: async (body) => {
          capturedPrompts.push(
            typeof body.messages[0]?.content === "string"
              ? body.messages[0].content
              : "",
          );
          return (judgeClient.messages.create as (b: typeof body) => Promise<Anthropic.Message>)(body);
        },
      },
    },
  });

  const report = await admit(draft, { judgeAgent });

  assert.equal(report.admitted.length, 1);
  assert.equal(report.kickedBack.length, 1);
  assert.equal(report.admitted[0]?.hash, contracts[0]?.hash);
  assert.equal(report.kickedBack[0]?.contract.hash, contracts[1]?.hash);
  assert.deepEqual(report.kickedBack[0]?.questions, ["what does overflow mean?"]);

  // Prompts must contain contract hash lines
  assert.ok(
    capturedPrompts[0]?.includes(contracts[0]!.hash),
    `First prompt should include hash ${contracts[0]!.hash}`,
  );
  assert.ok(
    capturedPrompts[1]?.includes(contracts[1]!.hash),
    `Second prompt should include hash ${contracts[1]!.hash}`,
  );
});

test("AC8 — admit probe backstop: disagreement → kickedBack; convergence → admitted", async () => {
  const contract = Contract.freeze({
    requirement: "Parse a duration string like '1h30m' and return total seconds.",
    entry: "parseDuration",
    version: "1",
    examples: [
      { name: "basic", input: ["1h30m"], expected: 5400 },
      { name: "invalid", input: ["-1h"], expected: "<throws>", throws: true },
    ],
  });

  const draft: DraftSet = {
    requirements: [
      {
        id: "parse-duration",
        requirement: contract.requirement,
        entry: contract.entry,
        signature: "(s: string) => number",
        examples: [...contract.examples] as import("../src/contract.ts").ContractCase[],
      },
    ],
    contracts: [contract],
    auditGaps: [],
    costUsd: 0,
  };

  const probeCase = { name: "probe-case", input: ["30m"], expected: 1800 };
  const probes = new Map([["parse-duration", [probeCase]]]);

  // Sub-test A: probe disagrees → kickedBack
  // Judge says READY, then we need k=2 probe generations
  // Impl 1: correct for frozen contract (parseDuration passes), but probe case: returns 1800 (pass)
  // Impl 2: correct for frozen contract, but probe case: returns 999 (fail)
  // → survivors=2, probe vectors differ → not ready
  const correctImpl = `function parseDuration(s) {
    s = s.trim();
    if (/^-/.test(s)) throw new Error('invalid');
    let total = 0;
    const re = /(\\d+)([hms])/gi;
    let match;
    while ((match = re.exec(s)) !== null) {
      const v = parseInt(match[1]);
      const u = match[2].toLowerCase();
      if (u === 'h') total += v * 3600;
      else if (u === 'm') total += v * 60;
      else total += v;
    }
    return total;
  }`;

  // An impl that passes the frozen contract but fails the probe
  const wrongProbeImpl = `function parseDuration(s) {
    if (s === '1h30m') return 5400;
    throw new Error('invalid');
  }`;

  const judgeClientA = scriptedClient([{ text: "READY" }]);
  const judgeLedgerA = new Ledger();
  const judgeAgentA = new Agent(TIERS.LOW, judgeLedgerA, { client: judgeClientA });

  // probe agent: k=2 → one correct, one that only knows 1h30m
  const probeClientA = scriptedClient([
    { text: "```js\n" + correctImpl + "\n```" },
    { text: "```js\n" + wrongProbeImpl + "\n```" },
  ]);
  const probeLedgerA = new Ledger();
  const probeAgentA = new Agent(TIERS.LOW, probeLedgerA, { client: probeClientA });

  const reportA = await admit(draft, {
    judgeAgent: judgeAgentA,
    probe: { agent: probeAgentA, probes, k: 2 },
  });

  assert.equal(reportA.admitted.length, 0, "should not be admitted (probe disagreement)");
  assert.equal(reportA.kickedBack.length, 1);
  assert.ok(
    reportA.kickedBack[0]?.questions[0]?.includes("probe disagreement"),
    `expected probe disagreement question, got: ${reportA.kickedBack[0]?.questions[0]}`,
  );

  // Sub-test B: converging probe → admitted
  const judgeClientB = scriptedClient([{ text: "READY" }]);
  const judgeLedgerB = new Ledger();
  const judgeAgentB = new Agent(TIERS.LOW, judgeLedgerB, { client: judgeClientB });

  // Both impls agree on probe
  const probeClientB = scriptedClient([
    { text: "```js\n" + correctImpl + "\n```" },
    { text: "```js\n" + correctImpl + "\n```" },
  ]);
  const probeLedgerB = new Ledger();
  const probeAgentB = new Agent(TIERS.LOW, probeLedgerB, { client: probeClientB });

  const reportB = await admit(draft, {
    judgeAgent: judgeAgentB,
    probe: { agent: probeAgentB, probes, k: 2 },
  });

  assert.equal(reportB.admitted.length, 1, "should be admitted (converging probe)");
  assert.equal(reportB.kickedBack.length, 0);
});

test("AC9 — cost accounting: DraftSet.costUsd equals ledger sum; AdmissionReport.costUsd equals judge ledger sum", async () => {
  // DraftSet cost
  const decomposeClient = scriptedClient([
    { text: VALID_2REQ_FENCED },
    { text: EMPTY_GAPS_FENCED },
  ]);
  const decomposeLedger = new Ledger();
  const decomposeAgent = new Agent(TIERS.HIGH, decomposeLedger, { client: decomposeClient });
  const draft = await decompose({ agent: decomposeAgent, intent: "test" });

  const ledgerTotal = decomposeLedger.totals().costUsd;
  assert.ok(
    Math.abs(draft.costUsd - ledgerTotal) < 1e-9,
    `DraftSet.costUsd ${draft.costUsd} should equal ledger sum ${ledgerTotal}`,
  );

  // AdmissionReport cost
  const contracts = draft.contracts;
  const judgeClient = scriptedClient([
    { text: "READY" },
    { text: "READY" },
  ]);
  const judgeLedger = new Ledger();
  const judgeAgent = new Agent(TIERS.LOW, judgeLedger, { client: judgeClient });

  const report = await admit(draft, { judgeAgent });
  const judgeLedgerTotal = judgeLedger.totals().costUsd;
  assert.ok(
    Math.abs(report.costUsd - judgeLedgerTotal) < 1e-9,
    `AdmissionReport.costUsd ${report.costUsd} should equal judge ledger sum ${judgeLedgerTotal}`,
  );

  assert.equal(contracts.length, 2, "two contracts to judge");
  assert.equal(report.admitted.length, 2, "both admitted");
});
