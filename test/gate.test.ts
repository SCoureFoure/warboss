/** AC1–AC10 — gate instruments: gruntJudge and convergenceProbe */
import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import type { MessagesClient } from "../src/agent.ts";
import { Agent } from "../src/agent.ts";
import { Ledger } from "../src/cost.ts";
import { Contract, type ContractCase } from "../src/contract.ts";
import { ContractHashMismatch } from "../src/runner.ts";
import { TIERS } from "../src/models.ts";
import { gruntJudge, convergenceProbe } from "../src/gate.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeAgent(client: MessagesClient): { agent: Agent; ledger: Ledger } {
  const ledger = new Ledger();
  const agent = new Agent(TIERS.LOW, ledger, { client });
  return { agent, ledger };
}

/**
 * Scripted client: each call returns the next response in the array (index-
 * based). After exhausting the array it loops, but for gate tests we size
 * the array to exactly the expected call count.
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

/** Client that always throws. */
function alwaysThrowsClient(): MessagesClient {
  return {
    messages: {
      create: async () => {
        throw new Error("network error");
      },
    },
  };
}

function fence(code: string): string {
  return "```js\n" + code + "\n```";
}

// ── Duration-parse contract & probes (self-contained) ────────────────────────

/**
 * Reference implementation. Passes all canonical contract cases.
 */
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

/** Returns wrong value for everything. */
const WRONG_IMPL = `function parseDuration(s) { return -999; }`;

/** No fenced code block at all. */
const NO_CODE_RESPONSE = "I cannot help with that.";

const durationContract = Contract.freeze({
  requirement:
    "Parse a human-readable duration string into seconds. Throws on invalid input.",
  entry: "parseDuration",
  version: "1",
  examples: [
    { name: "1h30m", input: ["1h30m"], expected: 5400 },
    { name: "90m", input: ["90m"], expected: 5400 },
    { name: "45s", input: ["45s"], expected: 45 },
    { name: "90", input: ["90"], expected: 90 },
    { name: "2h15m30s", input: ["2h15m30s"], expected: 8130 },
  ],
});

/**
 * Probe cases — distinct from contract examples, no overlap with prompt text.
 */
const durationProbes: ContractCase[] = [
  { name: "30m", input: ["30m"], expected: 1800 },
  { name: "1h", input: ["1h"], expected: 3600 },
];

// ── AC1: gruntJudge — READY parse ────────────────────────────────────────────

test("AC1 gruntJudge READY parse", async () => {
  const captured: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client = scriptedClient(["READY"], (body) => captured.push(body));
  const { agent } = makeAgent(client);

  const verdict = await gruntJudge({
    agent,
    prompt: "Write a function that adds two numbers.",
  });

  assert.equal(verdict.ready, true);
  assert.deepEqual(verdict.questions, []);
  assert.equal(verdict.malformed, false);
  assert.equal(verdict.raw, "READY");

  // Pinned system prompt, user === prompt verbatim, max_tokens 1024, no thinking key
  assert.equal(captured.length, 1);
  const body = captured[0]!;
  assert.equal(
    body.system,
    "You are the implementer who will receive this task. Judge ONLY whether the task is fully decided — zero interpretation latitude left. First line of your reply: exactly READY or NOT READY. If NOT READY, list every undecided question as a \"- \" bullet, one per line, nothing else.",
  );
  assert.equal(
    (body.messages[0]!.content as string),
    "Write a function that adds two numbers.",
  );
  assert.equal(body.max_tokens, 1024);
  assert.ok(!("thinking" in body), "no thinking key");
});

// ── AC2: gruntJudge — NOT READY parse ────────────────────────────────────────

test("AC2 gruntJudge NOT READY parse", async () => {
  const response =
    'NOT READY\n- what does "1h90m" mean?\n- negative input behavior?';
  const client = scriptedClient([response]);
  const { agent } = makeAgent(client);

  const verdict = await gruntJudge({
    agent,
    prompt: "Parse duration strings.",
  });

  assert.equal(verdict.ready, false);
  assert.equal(verdict.malformed, false);
  assert.deepEqual(verdict.questions, [
    'what does "1h90m" mean?',
    "negative input behavior?",
  ]);
  assert.equal(verdict.raw, response);
});

// ── AC3: gruntJudge — fails closed ───────────────────────────────────────────

test("AC3a gruntJudge malformed response — fails closed", async () => {
  const client = scriptedClient(["Sure! This looks doable."]);
  const { agent } = makeAgent(client);

  const verdict = await gruntJudge({ agent, prompt: "some task" });

  assert.equal(verdict.ready, false);
  assert.equal(verdict.malformed, true);
  assert.deepEqual(verdict.questions, []);
});

test("AC3b gruntJudge always-throws client — malformed shape, costUsd:0", async () => {
  const { agent } = makeAgent(alwaysThrowsClient());

  const verdict = await gruntJudge({ agent, prompt: "some task" });

  assert.equal(verdict.ready, false);
  assert.equal(verdict.malformed, true);
  assert.deepEqual(verdict.questions, []);
  assert.equal(verdict.costUsd, 0);
});

// ── AC4: convergenceProbe — survivor selection ────────────────────────────────

test("AC4 probe survivor selection", async () => {
  // k=4: 2 correct, 1 wrong-value, 1 no-code
  const responses = [
    fence(CORRECT_IMPL),     // 0 — survivor
    fence(CORRECT_IMPL),     // 1 — survivor
    fence(WRONG_IMPL),       // 2 — fails contract
    NO_CODE_RESPONSE,        // 3 — no extractable code
  ];
  const client = scriptedClient(responses);
  const { agent } = makeAgent(client);

  const verdict = await convergenceProbe({
    agent,
    contract: durationContract,
    prompt: "Implement parseDuration.",
    probes: durationProbes,
    k: 4,
  });

  assert.equal(verdict.survivors, 2);
  assert.equal(verdict.k, 4);
  assert.equal(verdict.survivorRate, 0.5);
});

// ── AC5: convergenceProbe — convergence + ready ───────────────────────────────

test("AC5 probe convergence — all agree, ready=true", async () => {
  // k=4, all 4 correct → all survive, all agree on every probe
  const responses = [
    fence(CORRECT_IMPL),
    fence(CORRECT_IMPL),
    fence(CORRECT_IMPL),
    fence(CORRECT_IMPL),
  ];
  const client = scriptedClient(responses);
  const { agent } = makeAgent(client);

  const verdict = await convergenceProbe({
    agent,
    contract: durationContract,
    prompt: "Implement parseDuration.",
    probes: durationProbes,
    k: 4,
  });

  assert.equal(verdict.survivors, 4);
  assert.equal(verdict.survivorRate, 1);
  assert.equal(verdict.modalShare, 1);
  assert.equal(verdict.ready, true);
  assert.deepEqual(verdict.disagreements, []);
});

// ── AC6: convergenceProbe — disagreement reporting ───────────────────────────

test("AC6 probe disagreement reporting", async () => {
  // k=4, all survive contract, but 2 return wrong value for probe[0] and 2 correct.
  // We need an impl that passes the contract but fails one probe.
  //
  // The contract requires parseDuration("1h30m")===5400, parseDuration("90m")===5400, etc.
  // Probe[0]: input=["30m"], expected=1800
  // Probe[1]: input=["1h"], expected=3600
  //
  // PASSING_PROBE_WRONG_30M: passes contract but returns wrong value for "30m"
  const PASSING_CONTRACT_WRONG_PROBE = `
function parseDuration(s) {
  s = s.trim();
  if (s === "30m") return 9999; // wrong probe answer
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
}`.trim();

  // k=4: 2 correct (pass all probes), 2 wrong on probe[0]
  const responses = [
    fence(CORRECT_IMPL),
    fence(CORRECT_IMPL),
    fence(PASSING_CONTRACT_WRONG_PROBE),
    fence(PASSING_CONTRACT_WRONG_PROBE),
  ];
  const client = scriptedClient(responses);
  const { agent } = makeAgent(client);

  const verdict = await convergenceProbe({
    agent,
    contract: durationContract,
    prompt: "Implement parseDuration.",
    probes: durationProbes,
    k: 4,
  });

  assert.equal(verdict.survivors, 4);
  // modalShare: largest cluster is 2/4 = 0.5 (2 correct, 2 wrong-probe)
  assert.equal(verdict.modalShare, 0.5);
  assert.equal(verdict.ready, false);

  // Disagreement on probe[0] ("30m")
  assert.equal(verdict.disagreements.length, 1);
  const d = verdict.disagreements[0]!;
  assert.equal(d.probeIndex, 0);
  assert.equal(d.name, "30m");
  assert.equal(d.split["pass"], 2);
  assert.equal(d.split["fail"], 2);
});

// ── AC7: convergenceProbe — zero survivors ────────────────────────────────────

test("AC7 probe zero survivors", async () => {
  // All k impls fail contract
  const responses = Array.from({ length: 4 }, () => fence(WRONG_IMPL));
  const client = scriptedClient(responses);
  const { agent } = makeAgent(client);

  const verdict = await convergenceProbe({
    agent,
    contract: durationContract,
    prompt: "Implement parseDuration.",
    probes: durationProbes,
    k: 4,
  });

  assert.equal(verdict.ready, false);
  assert.equal(verdict.survivors, 0);
  assert.equal(verdict.modalShare, 0);
  assert.equal(verdict.survivorRate, 0);
  // No throws
});

// ── AC8: convergenceProbe — empty probes throws before any model call ─────────

test("AC8 empty probes throws before any model call", async () => {
  let callCount = 0;
  const client: MessagesClient = {
    messages: {
      create: async () => {
        callCount++;
        throw new Error("should not reach here");
      },
    },
  };
  const { agent } = makeAgent(client);

  await assert.rejects(
    () =>
      convergenceProbe({
        agent,
        contract: durationContract,
        prompt: "Implement parseDuration.",
        probes: [],
        k: 2,
      }),
    (err: Error) => {
      assert.ok(
        err.message.includes("probes"),
        `error should name the field: "${err.message}"`,
      );
      return true;
    },
  );

  assert.equal(callCount, 0, "no model call should be made");
});

// ── AC9: convergenceProbe — contamination audit ───────────────────────────────

test("AC9 probe contamination audit — prompt containing probe input throws before any call", async () => {
  let callCount = 0;
  const client: MessagesClient = {
    messages: {
      create: async () => {
        callCount++;
        throw new Error("should not reach here");
      },
    },
  };
  const { agent } = makeAgent(client);

  // The probe input is ["30m"]; JSON.stringify("30m") === '"30m"'
  // Embed it in the prompt
  const contaminatedPrompt = `Implement parseDuration. Note: "30m" is an example.`;

  await assert.rejects(
    () =>
      convergenceProbe({
        agent,
        contract: durationContract,
        prompt: contaminatedPrompt,
        probes: durationProbes,
        k: 2,
      }),
    (err: Error) => {
      assert.ok(
        err.message.toLowerCase().includes("contamination") ||
          err.message.includes("probe"),
        `error should mention contamination or probe: "${err.message}"`,
      );
      return true;
    },
  );

  assert.equal(callCount, 0, "no model call should be made");
});

// ── AC10: metering + freeze ───────────────────────────────────────────────────

test("AC10 metering: ledger has k entries kind 'gate.probe'; costUsd equals sum", async () => {
  const k = 4;
  const responses = Array.from({ length: k }, () => fence(CORRECT_IMPL));
  const client = scriptedClient(responses);
  const { agent, ledger } = makeAgent(client);

  const verdict = await convergenceProbe({
    agent,
    contract: durationContract,
    prompt: "Implement parseDuration.",
    probes: durationProbes,
    k,
    kind: "gate.probe",
  });

  const entries = ledger.all();
  const probeEntries = entries.filter((e) => e.kind === "gate.probe");
  assert.equal(probeEntries.length, k, `expected ${k} ledger entries`);

  const ledgerSum = probeEntries.reduce((s, e) => s + e.costUsd, 0);
  assert.ok(
    Math.abs(verdict.costUsd - ledgerSum) < 1e-9,
    `verdict.costUsd (${verdict.costUsd}) should equal ledger sum (${ledgerSum})`,
  );
});

test("AC10 tampered contract — ContractHashMismatch propagates", async () => {
  const k = 2;
  const responses = Array.from({ length: k }, () => fence(CORRECT_IMPL));
  const client = scriptedClient(responses);
  const { agent } = makeAgent(client);

  // Build a contract, then tamper with it by constructing a fresh contract
  // with different content but passing the original hash to expectedHash.
  // Actually, the contract.hash is computed from its content, so we pass a
  // wrong expectedHash by building a second contract and using its hash.
  const otherContract = Contract.freeze({
    requirement: "different requirement",
    entry: "parseDuration",
    version: "999",
    examples: [{ name: "x", input: ["x"], expected: 0 }],
  });

  // Use durationContract but pass otherContract.hash as the expectedHash.
  // We do this by building a fake contract object that has a mismatched hash.
  // The cleanest way: pass a contract whose .hash !== its actual content hash.
  // The runner checks: contract.verify(opts.expectedHash) which is contract.hash === expectedHash.
  // So: use a contract whose hash we can force to mismatch.
  //
  // Approach: build a wrapper contract that claims to be durationContract but
  // has a different hash. We can't tamper Contract directly (it's frozen), but
  // we can pass `expectedHash: otherContract.hash` to the judge call.
  //
  // The convergenceProbe calls judge(contract, code, { expectedHash: contract.hash }).
  // To trigger ContractHashMismatch, we need to pass in a contract whose
  // .hash !== the hash we expect it to match. But the contract hashes itself.
  //
  // Simplest: use a different contract (one built from modified content) as the
  // contract arg, but give it a probes set. Then the real hash won't match the
  // frozen hash we expect... Actually the convergenceProbe uses contract.hash
  // as the expected hash internally (expectedHash: contract.hash). So it will
  // always match unless the contract object is externally mutated.
  //
  // The spec says: "tampered contract → ContractHashMismatch propagates"
  // We need to simulate a tampered contract. We can do this by creating a
  // Proxy or by overriding the hash property after construction. Since Contract
  // uses Object.freeze(), we need another approach.
  //
  // Simplest approach: build a modified contract that wraps the judge call with
  // a mismatched hash. But convergenceProbe uses contract.hash as expectedHash.
  //
  // Alternative: pass a fake contract object (cast as Contract) where .hash is
  // wrong compared to what judge would compute. The runner's judge() checks:
  //   if (opts.expectedHash !== undefined && !contract.verify(opts.expectedHash))
  // Since verify checks: this.hash === expectedHash, if we set expectedHash=contract.hash
  // and contract.hash is correct, it won't throw.
  //
  // The only way to trigger ContractHashMismatch is if contract.verify() returns false.
  // That means we need a contract where contract.hash != contract.hash... impossible.
  //
  // Re-reading the spec: "tampered contract → ContractHashMismatch propagates"
  // This means: if someone passes a contract whose hash doesn't match (e.g., an
  // old frozen hash stored elsewhere is compared against a re-frozen contract).
  //
  // We can simulate this by creating a fake Contract-like object where .hash is
  // set to an incorrect value (different from what computeHash would return for it).
  // Then convergenceProbe passes fake.hash as expectedHash to judge, and judge
  // checks contract.verify(expectedHash) which is contract.hash === fake.hash → false.
  //
  // Simulate a tampered contract: the stored .hash field (which convergenceProbe
  // passes as expectedHash to judge) does NOT match the value that verify() would
  // return for. We do this by:
  //   - setting .hash to the real contract's hash (the "expected" hash)
  //   - making verify() always return false (simulating the actual content hash
  //     having been changed after freezing)
  const EXPECTED_HASH = durationContract.hash; // what convergenceProbe will pass in
  const tamperedContract = {
    requirement: durationContract.requirement,
    entry: durationContract.entry,
    examples: durationContract.examples,
    version: durationContract.version,
    hash: EXPECTED_HASH,
    // verify() returns false — simulates content having changed after registration
    verify(_h: string) {
      return false;
    },
  } as unknown as Contract;

  await assert.rejects(
    () =>
      convergenceProbe({
        agent,
        contract: tamperedContract,
        prompt: "Implement parseDuration.",
        probes: durationProbes,
        k,
      }),
    ContractHashMismatch,
  );
});
