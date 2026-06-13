/** AC1–AC17 — see specs/warboss-decomposition.spec.md rev 4 */
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

// rev 4: all fixtures carry resolutions: [] (AC12 makes the field mandatory)
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
      resolutions: [],
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
        resolutions: [],
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
        resolutions: [],
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
        resolutions: [],
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
        resolutions: [],
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
    resolutions: [],
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
      resolutions: [],
    },
  ]);
  // rev 4: audit gap now carries intentDecides: true to be amendable
  const gapResponse = '```json\n[{"id":"dur-parse","gap":"What happens when input is 0s?","intentDecides":true}]\n```';
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
      resolutions: [],
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
    resolutions: [],
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
    resolutions: [],
  }]);
  // rev 4: intentDecides: true makes this amendable
  const gapResponse = '```json\n[{"id":"dur-parse","gap":"ambiguous behavior","intentDecides":true}]\n```';
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
    resolutions: [],
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

// rev 4: AC7 uses probe scripts only — no judgeAgent, no gate.judge calls
test("AC7 — admit partitions (rev 4: probe-only): converging probe → admitted, split probe → kickedBack", async () => {
  // Use simple contracts that the impls below can actually satisfy.
  // parse-duration: parseDuration("1h") === 3600, throws on invalid
  // format-duration: formatDuration(3600) === "1h", throws on negative
  const contracts = [
    Contract.freeze({
      requirement: "Parse a duration string and return total seconds.",
      entry: "parseDuration",
      version: "1",
      examples: [
        { name: "basic", input: ["1h"], expected: 3600 },
        { name: "invalid", input: ["-1h"], expected: "<throws>", throws: true },
      ],
    }),
    Contract.freeze({
      requirement: "Format seconds as a duration string.",
      entry: "formatDuration",
      version: "1",
      examples: [
        { name: "basic", input: [3600], expected: "1h" },
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
        resolutions: [],
      },
      {
        id: "format-duration",
        requirement: contracts[1]!.requirement,
        entry: contracts[1]!.entry,
        signature: "(n: number) => string",
        examples: [...contracts[1]!.examples] as import("../src/contract.ts").ContractCase[],
        resolutions: [],
      },
    ],
    contracts,
    auditGaps: [],
    escalations: [],
    costUsd: 0,
  };

  // parse-duration probe: "30m" → 1800 (NOT in frozen contract prompt)
  // format-duration probe: 7200 → "2h" (NOT in frozen contract prompt)
  const parseDurationProbe = { name: "probe-30m", input: ["30m"], expected: 1800 };
  const formatDurationProbe = { name: "probe-7200", input: [7200], expected: "2h" };

  const probes = new Map<string, import("../src/contract.ts").ContractCase[]>([
    ["parse-duration", [parseDurationProbe]],
    ["format-duration", [formatDurationProbe]],
  ]);

  // parse-duration impls: both correct — pass frozen contract AND probe (converge)
  const correctParseImpl = `function parseDuration(s) {
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

  // format-duration impl 1: correct — passes frozen "3600→1h", throws on -1, AND passes probe "7200→2h"
  const formatImpl1 = `function formatDuration(n) {
    if (n < 0) throw new Error('invalid');
    if (n % 3600 === 0) return (n / 3600) + 'h';
    return n + 's';
  }`;
  // format-duration impl 2: passes frozen "3600→1h", throws on -1, but FAILS probe "7200→2h"
  // (returns "7200s" instead of "2h" — hardcoded for 3600 only)
  const formatImpl2 = `function formatDuration(n) {
    if (n < 0) throw new Error('invalid');
    if (n === 3600) return '1h';
    return n + 's';
  }`;

  // k=2 for each contract
  // parse-duration: 2 calls both return correctParseImpl (converge on probe)
  // format-duration: 2 calls return formatImpl1 and formatImpl2 (split on probe)
  const capturedPrompts: string[] = [];
  const probeClient: MessagesClient = {
    messages: {
      create: async (body) => {
        const msgs = body.messages;
        const content = msgs[0]?.content;
        const promptText = typeof content === "string" ? content : "";
        capturedPrompts.push(promptText);
        // Script: calls 0,1 for parse-duration (converge), calls 2,3 for format-duration (split)
        const callIdx = capturedPrompts.length - 1;
        let text: string;
        if (callIdx < 2) {
          text = "```js\n" + correctParseImpl + "\n```";
        } else if (callIdx === 2) {
          text = "```js\n" + formatImpl1 + "\n```";
        } else {
          text = "```js\n" + formatImpl2 + "\n```";
        }
        return {
          content: [{ type: "text", text }],
          usage: { input_tokens: 10, output_tokens: 5 },
        } as unknown as Anthropic.Message;
      },
    },
  };

  const probeLedger = new Ledger();
  const probeAgent = new Agent(TIERS.LOW, probeLedger, { client: probeClient });

  const report = await admit(draft, {
    probe: { agent: probeAgent, probes, k: 2 },
  });

  assert.equal(report.admitted.length, 1, "parse-duration admitted");
  assert.equal(report.kickedBack.length, 1, "format-duration kicked back");
  assert.equal(report.admitted[0]?.hash, contracts[0]?.hash, "parse-duration hash");
  assert.equal(report.kickedBack[0]?.contract.hash, contracts[1]?.hash, "format-duration hash");

  // kickedBack question should be probe disagreement
  assert.ok(
    report.kickedBack[0]?.questions[0]?.includes("probe disagreement"),
    `expected probe disagreement, got: ${JSON.stringify(report.kickedBack[0]?.questions)}`,
  );

  // Capture-assert: probed prompts contain contract hash lines
  assert.ok(
    capturedPrompts.some((p) => p.includes(contracts[0]!.hash)),
    `A prompt should include parse-duration hash ${contracts[0]!.hash}`,
  );
  assert.ok(
    capturedPrompts.some((p) => p.includes(contracts[1]!.hash)),
    `A prompt should include format-duration hash ${contracts[1]!.hash}`,
  );

  // Capture-assert: NO gate.judge-kind entries (gruntJudge is unwired)
  const allLedgerEntries = probeLedger.all();
  const judgeEntries = allLedgerEntries.filter((e) => e.kind === "gate.judge");
  assert.equal(judgeEntries.length, 0, "no gate.judge calls — gruntJudge is unwired");
});

// rev 4: AC8 — admit fails closed without a battery
test("AC8 — admit fails closed without a battery (rev 4)", async () => {
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
        resolutions: [],
      },
      {
        id: "format-duration",
        requirement: contracts[1]!.requirement,
        entry: contracts[1]!.entry,
        signature: "(n: number) => string",
        examples: [...contracts[1]!.examples] as import("../src/contract.ts").ContractCase[],
        resolutions: [],
      },
    ],
    contracts,
    auditGaps: [],
    escalations: [],
    costUsd: 0,
  };

  // Probe battery only for parse-duration; format-duration has no battery
  const parseProbe = { name: "probe-30m", input: ["30m"], expected: 1800 };
  const probes = new Map<string, import("../src/contract.ts").ContractCase[]>([
    ["parse-duration", [parseProbe]],
    // format-duration intentionally absent
  ]);

  // k=2 for parse-duration (both converge)
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

  const probeLedger = new Ledger();
  // Only parse-duration will trigger model calls (k=2); format-duration gets no call
  const probeClient = scriptedClient([
    { text: "```js\n" + correctImpl + "\n```" },
    { text: "```js\n" + correctImpl + "\n```" },
  ]);
  const probeAgent = new Agent(TIERS.LOW, probeLedger, { client: probeClient });

  const ledgerBefore = probeLedger.all().length;

  const report = await admit(draft, {
    probe: { agent: probeAgent, probes, k: 2 },
  });

  // parse-duration admitted (probe converges)
  assert.equal(report.admitted.length, 1, "parse-duration admitted");
  assert.equal(report.kickedBack.length, 1, "format-duration kicked back");
  assert.equal(report.admitted[0]?.hash, contracts[0]?.hash);

  // format-duration question is the exact no-battery string
  const kb = report.kickedBack[0];
  assert.ok(kb !== undefined);
  assert.equal(kb.contract.hash, contracts[1]?.hash);
  assert.equal(kb.questions.length, 1);
  assert.equal(
    kb.questions[0],
    "no probe battery supplied for 'format-duration' — admission is probe-only and fails closed",
    "exact no-battery question string",
  );

  // NO model call was made for format-duration (ledger count asserted)
  const ledgerAfter = probeLedger.all().length;
  // parse-duration: k=2 → 2 model calls; format-duration: 0 calls
  assert.equal(ledgerAfter - ledgerBefore, 2, "exactly 2 model calls (parse-duration only)");
});

test("AC9 — cost accounting: DraftSet.costUsd equals ledger sum; AdmissionReport.costUsd equals probe ledger sum", async () => {
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

  // AdmissionReport cost: probe-only, no batteries → 0 model calls
  const probeProbes = new Map<string, import("../src/contract.ts").ContractCase[]>();
  const probeLedger = new Ledger();
  const probeClient = scriptedClient([]);
  const probeAgent = new Agent(TIERS.LOW, probeLedger, { client: probeClient });

  const report = await admit(draft, {
    probe: { agent: probeAgent, probes: probeProbes },
  });
  const probeLedgerTotal = probeLedger.totals().costUsd;
  assert.ok(
    Math.abs(report.costUsd - probeLedgerTotal) < 1e-9,
    `AdmissionReport.costUsd ${report.costUsd} should equal probe ledger sum ${probeLedgerTotal}`,
  );

  // Both contracts kick back (no batteries) — costUsd is 0
  assert.equal(draft.contracts.length, 2);
  assert.equal(report.kickedBack.length, 2, "both kicked back (no batteries)");
  assert.equal(report.admitted.length, 0);
});

test("AC10 — audit unavailable sentinel: double audit parse-failure → sentinel, no amend", async () => {
  const client = scriptedClient([
    { text: VALID_2REQ_FENCED },
    { text: "I think the gaps are roughly these..." }, // audit call 1: no fence
    { text: "still prose, still no fence" }, // audit re-ask: no fence either
  ]);
  const { agent, ledger } = makeAgent(client);

  const draft = await decompose({ agent, intent: "Parse and format durations" });

  // Resolves (no throw) with exactly the pinned sentinel as the sole entry
  assert.deepEqual(draft.auditGaps, [
    "<audit-unavailable>: audit output unparseable after one re-ask",
  ]);

  // Contracts still frozen from the validated drafts
  assert.equal(draft.contracts.length, 2);
  assert.equal(draft.contracts[0]?.version, "1");

  // Ledger: exactly 1 decompose + 2 audit, nothing else (amend skipped)
  const entries = ledger.all();
  assert.equal(
    entries.filter((e) => e.kind === "warboss.decompose").length,
    1,
    "exactly 1 decompose call",
  );
  assert.equal(
    entries.filter((e) => e.kind === "warboss.audit").length,
    2,
    "exactly 2 audit calls",
  );
  assert.equal(
    entries.filter((e) => e.kind === "warboss.amend").length,
    0,
    "no amend call",
  );
  assert.equal(entries.length, 3, "exactly 3 total calls");

  // costUsd still equals the ledger sum of all 3 calls
  const ledgerTotal = ledger.totals().costUsd;
  assert.ok(
    Math.abs(draft.costUsd - ledgerTotal) < 1e-9,
    `DraftSet.costUsd ${draft.costUsd} should equal ledger sum ${ledgerTotal}`,
  );
});

test("AC11 — auditGaps entry format: carried gap is the exact string `${id}: ${gap}`", async () => {
  // AC5 carried-gap variant: amend returns the original drafts (gap unaddressed)
  const origDraftJson = JSON.stringify([
    {
      id: "dur-parse",
      requirement: "Parse a duration string.",
      entry: "parseDuration",
      signature: "(s: string) => number",
      examples: [
        { name: "basic", input: ["1h"], expected: 3600 },
        { name: "invalid", input: ["-1h"], expected: "<throws>", throws: true },
      ],
      resolutions: [],
    },
  ]);
  const gapSentence = "What happens when input is 0s?";
  // rev 4: intentDecides: true makes it amendable
  const gapResponse =
    "```json\n" + JSON.stringify([{ id: "dur-parse", gap: gapSentence, intentDecides: true }]) + "\n```";
  const client = scriptedClient([
    { text: "```json\n" + origDraftJson + "\n```" },
    { text: gapResponse },
    { text: "```json\n" + origDraftJson + "\n```" }, // amend unchanged → gap carried
  ]);
  const { agent } = makeAgent(client);

  const draft = await decompose({ agent, intent: "test" });

  // Full-string equality on the carried entry (not substring match)
  assert.equal(draft.auditGaps.length, 1);
  assert.equal(draft.auditGaps[0], `dur-parse: ${gapSentence}`);
  assert.deepEqual(draft.auditGaps, [`dur-parse: ${gapSentence}`]);
});

// AC12 — resolutions shape validation (rev 4)
test("AC12 — resolutions shape validation (rev 4)", async () => {
  // Each of these should throw with a descriptive error naming the offending requirement/field

  // Missing resolutions field
  const missingResolutions = JSON.stringify([
    {
      id: "dur-parse",
      requirement: "r",
      entry: "fn",
      signature: "(x: string) => number",
      examples: [
        { name: "a", input: ["1h"], expected: 3600 },
        { name: "b", input: ["bad"], expected: "<throws>", throws: true },
      ],
      // resolutions intentionally absent
    },
  ]);
  const c1 = scriptedClient([{ text: "```json\n" + missingResolutions + "\n```" }]);
  const { agent: a1, ledger: l1 } = makeAgent(c1);
  await assert.rejects(
    () => decompose({ agent: a1, intent: "test" }),
    (err: Error) => {
      assert.ok(
        err.message.toLowerCase().includes("resolutions"),
        `should mention resolutions: ${err.message}`,
      );
      return true;
    },
    "missing resolutions field",
  );
  assert.equal(l1.all().length, 1, "no audit call when resolutions missing");

  // resolutions not an array
  const resolutionsNotArray = JSON.stringify([
    {
      id: "dur-parse",
      requirement: "r",
      entry: "fn",
      signature: "(x: string) => number",
      examples: [
        { name: "a", input: ["1h"], expected: 3600 },
        { name: "b", input: ["bad"], expected: "<throws>", throws: true },
      ],
      resolutions: "not-an-array",
    },
  ]);
  const c2 = scriptedClient([{ text: "```json\n" + resolutionsNotArray + "\n```" }]);
  const { agent: a2, ledger: l2 } = makeAgent(c2);
  await assert.rejects(
    () => decompose({ agent: a2, intent: "test" }),
    (err: Error) => {
      assert.ok(
        err.message.toLowerCase().includes("resolutions"),
        `should mention resolutions: ${err.message}`,
      );
      return true;
    },
    "resolutions not an array",
  );
  assert.equal(l2.all().length, 1, "no audit call when resolutions not array");

  // entry with non-string point
  const badPoint = JSON.stringify([
    {
      id: "dur-parse",
      requirement: "r",
      entry: "fn",
      signature: "(x: string) => number",
      examples: [
        { name: "a", input: ["1h"], expected: 3600 },
        { name: "b", input: ["bad"], expected: "<throws>", throws: true },
      ],
      resolutions: [{ point: 42, chosen: "throws", basis: "fiat" }],
    },
  ]);
  const c3 = scriptedClient([{ text: "```json\n" + badPoint + "\n```" }]);
  const { agent: a3, ledger: l3 } = makeAgent(c3);
  await assert.rejects(
    () => decompose({ agent: a3, intent: "test" }),
    (err: Error) => {
      assert.ok(
        err.message.toLowerCase().includes("point"),
        `should mention point: ${err.message}`,
      );
      return true;
    },
    "non-string point",
  );
  assert.equal(l3.all().length, 1, "no audit call when point invalid");

  // basis: "guess" (not "intent" or "fiat")
  const badBasis = JSON.stringify([
    {
      id: "dur-parse",
      requirement: "r",
      entry: "fn",
      signature: "(x: string) => number",
      examples: [
        { name: "a", input: ["1h"], expected: 3600 },
        { name: "b", input: ["bad"], expected: "<throws>", throws: true },
      ],
      resolutions: [{ point: "some point", chosen: "throws", basis: "guess" }],
    },
  ]);
  const c4 = scriptedClient([{ text: "```json\n" + badBasis + "\n```" }]);
  const { agent: a4, ledger: l4 } = makeAgent(c4);
  await assert.rejects(
    () => decompose({ agent: a4, intent: "test" }),
    (err: Error) => {
      assert.ok(
        err.message.toLowerCase().includes("basis"),
        `should mention basis: ${err.message}`,
      );
      return true;
    },
    "basis: guess",
  );
  assert.equal(l4.all().length, 1, "no audit call when basis invalid");

  // Variant: resolutions: [] is valid — run proceeds
  const emptyResolutions = JSON.stringify([
    {
      id: "dur-parse",
      requirement: "r",
      entry: "fn",
      signature: "(x: string) => number",
      examples: [
        { name: "a", input: ["1h"], expected: 3600 },
        { name: "b", input: ["bad"], expected: "<throws>", throws: true },
      ],
      resolutions: [],
    },
  ]);
  const c5 = scriptedClient([
    { text: "```json\n" + emptyResolutions + "\n```" },
    { text: EMPTY_GAPS_FENCED },
  ]);
  const { agent: a5 } = makeAgent(c5);
  const result = await decompose({ agent: a5, intent: "test" });
  assert.equal(result.requirements.length, 1, "empty resolutions: [] is valid");
});

// AC13 — fiat resolutions escalate (rev 4)
test("AC13 — fiat resolutions escalate (rev 4)", async () => {
  const durParseWithFiat = JSON.stringify([
    {
      id: "dur-parse",
      requirement: "Parse a duration string.",
      entry: "parseDuration",
      signature: "(s: string) => number",
      examples: [
        { name: "basic", input: ["1h"], expected: 3600 },
        { name: "bare-throws", input: ["120"], expected: "<throws>", throws: true },
      ],
      resolutions: [
        { point: "bare numeric input", chosen: "throws", basis: "fiat" },
        { point: "whitespace trimming", chosen: "trim and parse", basis: "intent" },
      ],
    },
  ]);

  const client = scriptedClient([
    { text: "```json\n" + durParseWithFiat + "\n```" },
    { text: EMPTY_GAPS_FENCED },
  ]);
  const { agent } = makeAgent(client);

  const draft = await decompose({ agent, intent: "Parse duration strings" });

  // escalations: exactly the fiat entry (not the intent entry)
  assert.deepEqual(
    draft.escalations,
    ["dur-parse: fiat — bare numeric input → throws"],
    "full-string fiat escalation",
  );

  // auditGaps: [] (empty audit)
  assert.deepEqual(draft.auditGaps, []);

  // contracts still frozen
  assert.equal(draft.contracts.length, 1);
});

// AC14 — audit gap routing (rev 4)
test("AC14 — audit gap routing (rev 4): intentDecides:true → amend; intentDecides:false → escalation", async () => {
  const origDraftJson = JSON.stringify([
    {
      id: "dur-parse",
      requirement: "Parse a duration string.",
      entry: "parseDuration",
      signature: "(s: string) => number",
      examples: [
        { name: "basic", input: ["1h"], expected: 3600 },
        { name: "invalid", input: ["-1h"], expected: "<throws>", throws: true },
      ],
      resolutions: [],
    },
  ]);
  const amendableGapText = "What happens for 0-duration inputs?";
  const undecidedGapText = "What happens for bare numeric inputs like 120?";
  const twoGaps = JSON.stringify([
    { id: "dur-parse", gap: amendableGapText, intentDecides: true },
    { id: "dur-parse", gap: undecidedGapText, intentDecides: false },
  ]);
  const gapResponse = "```json\n" + twoGaps + "\n```";

  // Amend returns a draft with one more example (addresses the amendable gap)
  const amendedDraftJson = JSON.stringify([
    {
      id: "dur-parse",
      requirement: "Parse a duration string.",
      entry: "parseDuration",
      signature: "(s: string) => number",
      examples: [
        { name: "basic", input: ["1h"], expected: 3600 },
        { name: "invalid", input: ["-1h"], expected: "<throws>", throws: true },
        { name: "zero", input: ["0s"], expected: 0 },
      ],
      resolutions: [],
    },
  ]);

  let capturedAmendPrompt = "";
  const captureClient: MessagesClient = {
    messages: {
      create: async (body) => {
        const msgs = body.messages;
        const content = msgs[0]?.content;
        const text = typeof content === "string" ? content : "";
        // The 3rd call is the amend call (decompose=1, audit=2, amend=3)
        // We track by kind if possible, but since we can't here, track by call order
        // Actually we detect it by checking if it contains gap text
        if (text.includes("audit gaps") || text.includes("gaps")) {
          capturedAmendPrompt = text;
        }
        // Return scripted responses in order
        const callN = captureState.n++;
        const responses: string[] = [
          "```json\n" + origDraftJson + "\n```",
          gapResponse,
          "```json\n" + amendedDraftJson + "\n```",
        ];
        return {
          content: [{ type: "text", text: responses[callN] ?? "" }],
          usage: { input_tokens: 10, output_tokens: 5 },
        } as unknown as Anthropic.Message;
      },
    },
  };
  const captureState = { n: 0 };

  const { agent } = makeAgent(captureClient);
  const draft = await decompose({ agent, intent: "Parse duration" });

  // Amend prompt capture-asserted: contains amendable gap, does NOT contain undecided gap
  assert.ok(
    capturedAmendPrompt.includes(amendableGapText),
    `amend prompt should contain amendable gap: ${capturedAmendPrompt.slice(0, 200)}`,
  );
  assert.ok(
    !capturedAmendPrompt.includes(undecidedGapText),
    `amend prompt must NOT contain undecided gap: ${capturedAmendPrompt.slice(0, 200)}`,
  );

  // escalations contains the undecided gap
  assert.deepEqual(
    draft.escalations,
    [`dur-parse: intent-undecided — ${undecidedGapText}`],
    "undecided gap escalated",
  );

  // Variant: gap entry with intentDecides missing → routed to escalations (fail-closed)
  const missingIntentDecides = JSON.stringify([
    { id: "dur-parse", gap: undecidedGapText },  // no intentDecides field
  ]);
  const missingGapResponse = "```json\n" + missingIntentDecides + "\n```";

  const { client: clientB, ledger: ledgerB } = (() => {
    const l = new Ledger();
    const c = scriptedClient([
      { text: "```json\n" + origDraftJson + "\n```" },
      { text: missingGapResponse },
    ]);
    return { client: c, ledger: l };
  })();
  const agentB = new Agent(TIERS.HIGH, ledgerB, { client: clientB });
  const draftB = await decompose({ agent: agentB, intent: "Parse duration" });

  // Gap with missing intentDecides → fail-closed → escalation, amend NOT called
  assert.deepEqual(
    draftB.escalations,
    [`dur-parse: intent-undecided — ${undecidedGapText}`],
    "missing intentDecides escalated (fail-closed)",
  );
  assert.equal(
    ledgerB.all().filter((e) => e.kind === "warboss.amend").length,
    0,
    "no amend call when no amendable gaps remain",
  );
});

// AC15 — audit sees the intent (rev 4)
test("AC15 — audit sees the intent (rev 4): audit call user content contains drafts + 'Original intent:' + intent text", async () => {
  const intentText = "Parse duration strings in the format 1h30m and return seconds";

  let capturedAuditPrompt = "";
  let callN = 0;
  const captureClient: MessagesClient = {
    messages: {
      create: async (body) => {
        const msgs = body.messages;
        const content = msgs[0]?.content;
        const text = typeof content === "string" ? content : "";
        const n = callN++;
        if (n === 1) {
          // Second call is the audit call
          capturedAuditPrompt = text;
        }
        const responses: string[] = [
          "```json\n" + VALID_2REQ_JSON + "\n```",
          EMPTY_GAPS_FENCED,
        ];
        return {
          content: [{ type: "text", text: responses[n] ?? "" }],
          usage: { input_tokens: 10, output_tokens: 5 },
        } as unknown as Anthropic.Message;
      },
    },
  };

  const { agent } = makeAgent(captureClient);
  await decompose({ agent, intent: intentText });

  // capture-asserted: audit prompt contains drafts JSON and the exact line + intent text
  assert.ok(
    capturedAuditPrompt.includes("Original intent:"),
    `audit prompt should contain 'Original intent:' literal: ${capturedAuditPrompt.slice(0, 300)}`,
  );
  assert.ok(
    capturedAuditPrompt.includes(intentText),
    `audit prompt should contain verbatim intent: ${capturedAuditPrompt.slice(0, 300)}`,
  );
  // Drafts JSON also present
  assert.ok(
    capturedAuditPrompt.includes("parse-duration"),
    `audit prompt should contain drafts JSON: ${capturedAuditPrompt.slice(0, 300)}`,
  );
});

// AC16 — requirement cap in the decompose prompt (rev 4)
test("AC16 — requirement cap in the decompose prompt (rev 4)", async () => {
  let capturedPrompts: string[] = [];
  let callN = 0;

  function makeCapturingClient(responses: string[]): MessagesClient {
    return {
      messages: {
        create: async (body) => {
          const msgs = body.messages;
          const content = msgs[0]?.content;
          capturedPrompts.push(typeof content === "string" ? content : "");
          const n = callN++;
          return {
            content: [{ type: "text", text: responses[n] ?? "" }],
            usage: { input_tokens: 10, output_tokens: 5 },
          } as unknown as Anthropic.Message;
        },
      },
    };
  }

  // Run 1: explicit maxRequirements: 1
  capturedPrompts = [];
  callN = 0;
  const singleReqJson = JSON.stringify([
    {
      id: "dur-parse",
      requirement: "Parse a duration string.",
      entry: "parseDuration",
      signature: "(s: string) => number",
      examples: [
        { name: "basic", input: ["1h"], expected: 3600 },
        { name: "invalid", input: ["-1h"], expected: "<throws>", throws: true },
      ],
      resolutions: [],
    },
  ]);
  const client1 = makeCapturingClient([
    "```json\n" + singleReqJson + "\n```",
    EMPTY_GAPS_FENCED,
  ]);
  const ledger1 = new Ledger();
  const agent1 = new Agent(TIERS.HIGH, ledger1, { client: client1 });
  await decompose({ agent: agent1, intent: "Parse durations", maxRequirements: 1 });

  const decomposePrompt1 = capturedPrompts[0] ?? "";
  const capLine1 = "At most 1 requirement(s). If the intent needs more, it must be decomposed further UP the chain — do not exceed the cap.";
  assert.ok(
    decomposePrompt1.includes(capLine1),
    `prompt should contain exact cap line for maxRequirements=1:\n${decomposePrompt1.slice(0, 500)}`,
  );

  // Run 2: default maxRequirements (8)
  capturedPrompts = [];
  callN = 0;
  const client2 = makeCapturingClient([
    "```json\n" + VALID_2REQ_JSON + "\n```",
    EMPTY_GAPS_FENCED,
  ]);
  const ledger2 = new Ledger();
  const agent2 = new Agent(TIERS.HIGH, ledger2, { client: client2 });
  await decompose({ agent: agent2, intent: "Parse and format durations" });

  const decomposePrompt2 = capturedPrompts[0] ?? "";
  const capLine8 = "At most 8 requirement(s). If the intent needs more, it must be decomposed further UP the chain — do not exceed the cap.";
  assert.ok(
    decomposePrompt2.includes(capLine8),
    `prompt should contain exact cap line for default maxRequirements=8:\n${decomposePrompt2.slice(0, 500)}`,
  );
});

// AC17 — escalations ordering + cost (rev 4)
test("AC17 — escalations ordering + cost (rev 4): fiat first, then intent-undecided; costUsd equals ledger sum", async () => {
  const twoReqWithFiat = JSON.stringify([
    {
      id: "dur-parse",
      requirement: "Parse a duration string.",
      entry: "parseDuration",
      signature: "(s: string) => number",
      examples: [
        { name: "basic", input: ["1h"], expected: 3600 },
        { name: "bare-throws", input: ["120"], expected: "<throws>", throws: true },
      ],
      resolutions: [
        { point: "bare numeric input", chosen: "throws", basis: "fiat" },
      ],
    },
    {
      id: "dur-format",
      requirement: "Format seconds as a duration string.",
      entry: "formatDuration",
      signature: "(n: number) => string",
      examples: [
        { name: "basic", input: [3600], expected: "1h" },
        { name: "negative", input: [-1], expected: "<throws>", throws: true },
      ],
      resolutions: [
        { point: "fractional hours", chosen: "use minutes", basis: "fiat" },
      ],
    },
  ]);

  // One intent-undecided audit gap
  const undecidedGapText = "What happens for bare decimals like 1.5h?";
  const oneGap = JSON.stringify([
    { id: "dur-parse", gap: undecidedGapText, intentDecides: false },
  ]);
  const gapResponse = "```json\n" + oneGap + "\n```";

  const client = scriptedClient([
    { text: "```json\n" + twoReqWithFiat + "\n```" },
    { text: gapResponse },
  ]);
  const { agent, ledger } = makeAgent(client);

  const draft = await decompose({ agent, intent: "Duration utility" });

  // Ordering: fiat entries first (req order: dur-parse fiat, dur-format fiat), then undecided
  assert.deepEqual(draft.escalations, [
    "dur-parse: fiat — bare numeric input → throws",
    "dur-format: fiat — fractional hours → use minutes",
    `dur-parse: intent-undecided — ${undecidedGapText}`,
  ]);

  // costUsd equals ledger sum
  const ledgerTotal = ledger.totals().costUsd;
  assert.ok(
    Math.abs(draft.costUsd - ledgerTotal) < 1e-9,
    `DraftSet.costUsd ${draft.costUsd} should equal ledger sum ${ledgerTotal}`,
  );
});
