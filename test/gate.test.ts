/** AC1–AC16 — gate instruments: gruntJudge, convergenceProbe, intentProbe */
import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import type { MessagesClient } from "../src/agent.ts";
import { Agent } from "../src/agent.ts";
import { Ledger } from "../src/cost.ts";
import { Contract, type ContractCase } from "../src/contract.ts";
import { ContractHashMismatch } from "../src/runner.ts";
import { TIERS } from "../src/models.ts";
import { gruntJudge, convergenceProbe, deriveCheck, intentProbe } from "../src/gate.ts";

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

// ── gate-judge-derive AC1–AC4 — see specs/gate-judge-derive.spec.md (rev 1) ───

const DERIVE_SYSTEM =
  "You are the implementer who will receive this task. Do NOT rate your confidence. Mechanically enumerate the concrete inputs whose exact required output you cannot derive from the task text alone. First line of your reply: exactly DECIDED if you can derive the output for every input, or exactly UNDECIDED otherwise. If UNDECIDED, list each underivable input as a \"- \" bullet — the concrete input value followed by the one behavior the task leaves open — one per line, nothing else.";

// ── AC1: deriveCheck — DECIDED parse ─────────────────────────────────────────

test("derive AC1 deriveCheck DECIDED parse", async () => {
  const captured: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client = scriptedClient(["DECIDED"], (body) => captured.push(body));
  const { agent } = makeAgent(client);

  const verdict = await deriveCheck({
    agent,
    prompt: "Write a function that adds two numbers.",
  });

  assert.equal(verdict.ready, true);
  assert.deepEqual(verdict.undecided, []);
  assert.equal(verdict.malformed, false);

  // Pinned system string, user === prompt verbatim, max_tokens 1024, no thinking.
  assert.equal(captured.length, 1);
  const body = captured[0]!;
  assert.equal(body.system, DERIVE_SYSTEM);
  assert.equal(
    body.messages[0]!.content as string,
    "Write a function that adds two numbers.",
  );
  assert.equal(body.max_tokens, 1024);
  assert.ok(!("thinking" in body), "no thinking key");
});

// ── AC2: deriveCheck — UNDECIDED parse ───────────────────────────────────────

test("derive AC2 deriveCheck UNDECIDED parse", async () => {
  const response =
    'UNDECIDED\n- "90": is a bare number seconds or minutes?\n- empty string behavior?';
  const client = scriptedClient([response]);
  const { agent } = makeAgent(client);

  const verdict = await deriveCheck({ agent, prompt: "Parse duration strings." });

  assert.equal(verdict.ready, false);
  assert.equal(verdict.malformed, false);
  assert.deepEqual(verdict.undecided, [
    '"90": is a bare number seconds or minutes?',
    "empty string behavior?",
  ]);
});

// ── AC3: deriveCheck — fails closed ──────────────────────────────────────────

test("derive AC3a deriveCheck malformed response — fails closed", async () => {
  const client = scriptedClient(["I think I can mostly do this."]);
  const { agent } = makeAgent(client);

  const verdict = await deriveCheck({ agent, prompt: "some task" });

  assert.equal(verdict.ready, false);
  assert.equal(verdict.malformed, true);
  assert.deepEqual(verdict.undecided, []);
});

test("derive AC3b deriveCheck always-throws client — malformed shape, costUsd:0, raw empty", async () => {
  const { agent } = makeAgent(alwaysThrowsClient());

  const verdict = await deriveCheck({ agent, prompt: "some task" });

  assert.equal(verdict.ready, false);
  assert.equal(verdict.malformed, true);
  assert.deepEqual(verdict.undecided, []);
  assert.equal(verdict.costUsd, 0);
  assert.equal(verdict.raw, "");
});

// ── AC4: deriveCheck — DECIDED with stray bullets stays decided-empty ─────────

test("derive AC4 deriveCheck DECIDED with stray bullets stays decided-empty", async () => {
  const client = scriptedClient(["DECIDED\n- ignored bullet"]);
  const { agent } = makeAgent(client);

  const verdict = await deriveCheck({ agent, prompt: "some task" });

  assert.equal(verdict.ready, true);
  assert.deepEqual(verdict.undecided, []);
  assert.equal(verdict.malformed, false);
});

// ── AC11–AC16: intentProbe (rev 2) ──────────────────────────────────────────

// Helpers: small inline impls for intentProbe tests.
// Each impl is a fenced JS snippet that defines a function "fn".

/** Returns the numeric parse of the string, or throws on non-numeric input. */
const INTENT_IMPL_STRICT = fence(`
function fn(s) {
  const n = Number(s);
  if (isNaN(n)) throw new Error('not a number: ' + s);
  return n;
}
`);

/** Returns 0 for everything — viable but trivially wrong. */
const INTENT_IMPL_ZERO = fence(`
function fn(s) { return 0; }
`);

/** Throws on "120" (parses it as "ambiguous"), returns Number(s) otherwise. */
const INTENT_IMPL_THROW_120 = fence(`
function fn(s) {
  if (s === "120") throw new Error('ambiguous');
  return Number(s);
}
`);

/** Returns 120 for "120", otherwise Number(s). */
const INTENT_IMPL_RETURN_120 = fence(`
function fn(s) { return Number(s); }
`);

/** Syntactically broken — every execution throws. */
const INTENT_IMPL_BROKEN = fence(`
function fn(s) {
  !!!syntaxerror!!!
}
`);

/** Returns undefined for everything. */
const INTENT_IMPL_UNDEFINED = fence(`
function fn(s) { return undefined; }
`);

/** Throws with message "error A" for everything. */
const INTENT_IMPL_THROW_A = fence(`
function fn(s) { throw new Error("error A"); }
`);

/** Throws with message "error B" for everything. */
const INTENT_IMPL_THROW_B = fence(`
function fn(s) { throw new Error("error B"); }
`);

// ── AC11: intentProbe — split detection ──────────────────────────────────────

test("AC11 intentProbe split detection", async () => {
  // k=4: 2 impls return 120 for "120", 2 throw on "120";
  // all 4 agree on every other input (say, "60" → 60 for all 4).
  //
  // Impls:
  //   [0] INTENT_IMPL_RETURN_120  → fn("120")=120, fn("60")=60
  //   [1] INTENT_IMPL_RETURN_120  → fn("120")=120, fn("60")=60
  //   [2] INTENT_IMPL_THROW_120   → fn("120")=throw, fn("60")=60
  //   [3] INTENT_IMPL_THROW_120   → fn("120")=throw, fn("60")=60
  //
  // inputs: [["60"], ["120"]]
  // "60" → all 4 viable impls return 60 → no split
  // "120" → 2 return 120, 2 throw → split

  const inputs: readonly (readonly unknown[])[] = [["60"], ["120"]];
  const responses = [
    INTENT_IMPL_RETURN_120,
    INTENT_IMPL_RETURN_120,
    INTENT_IMPL_THROW_120,
    INTENT_IMPL_THROW_120,
  ];
  const client = scriptedClient(responses);
  const { agent } = makeAgent(client);

  const verdict = await intentProbe({
    agent,
    prompt: "Implement fn(s) that parses a numeric string.",
    entry: "fn",
    inputs,
    k: 4,
  });

  // All 4 have code; all 4 produce ≥1 non-throw outcome (fn("60") succeeds for all).
  assert.equal(verdict.generated, 4);
  assert.equal(verdict.viable, 4);
  assert.equal(verdict.nonviable, 0);

  // Only "120" (inputIndex 1) is a split.
  assert.equal(verdict.splits.length, 1);
  const s = verdict.splits[0]!;
  assert.equal(s.inputIndex, 1);
  assert.deepEqual(s.input, ["120"]);
  // outcomes: 2 return 120 → "value:120", 2 throw → "throw"
  assert.equal(s.outcomes["value:120"], 2);
  assert.equal(s.outcomes["throw"], 2);
  assert.equal(Object.keys(s.outcomes).length, 2);

  // "60" is NOT in splits (all agree).
  assert.ok(!verdict.splits.some((sp) => sp.inputIndex === 0));

  // decidedRate = (2 - 1) / 2 = 0.5
  assert.equal(verdict.decidedRate, 0.5);
});

// ── AC12: intentProbe — outcome keys ─────────────────────────────────────────

test("AC12 intentProbe outcome keys — undefined and throw clustering", async () => {
  // Two impls:
  //   [0] returns undefined → key "value:undefined"
  //   [1] also returns undefined → key "value:undefined"
  // inputs: [["x"]]
  // Both agree → no split; but we can check the outcome key is "value:undefined".
  //
  // To verify "throw" clustering (different error messages → same key):
  //   [2] throws "error A" → key "throw"
  //   [3] throws "error B" → key "throw"
  // inputs: [["x"]]  — both throw → both nonviable → excluded from split, no throw raised.
  //
  // Combined test: 4 impls, inputs [["x"]]:
  //   impls [0,1]: return undefined → viable, key "value:undefined"
  //   impls [2,3]: throw on every input → nonviable (excluded from clustering)
  // Splits: [0] undefined-only → only 1 distinct key among viable → no split.
  // decidedRate: (1 - 0) / 1 = 1.

  const inputs: readonly (readonly unknown[])[] = [["x"]];
  const responses = [
    INTENT_IMPL_UNDEFINED,
    INTENT_IMPL_UNDEFINED,
    INTENT_IMPL_THROW_A,
    INTENT_IMPL_THROW_B,
  ];
  const client = scriptedClient(responses);
  const { agent } = makeAgent(client);

  const verdict = await intentProbe({
    agent,
    prompt: "Implement fn(s).",
    entry: "fn",
    inputs,
    k: 4,
  });

  // [0] and [1] produce code; [2] and [3] produce code.
  assert.equal(verdict.generated, 4);
  // [0] and [1] return undefined → viable; [2] and [3] throw on all → nonviable.
  assert.equal(verdict.viable, 2);
  assert.equal(verdict.nonviable, 2);

  // Among viable impls: both return undefined → outcome key "value:undefined".
  // Only 1 distinct key → no split.
  assert.equal(verdict.splits.length, 0);
  assert.equal(verdict.decidedRate, 1);

  // Verify the key "value:undefined" is what gets clustered: add a second impl
  // that returns a real value to force a split and check the key.
  // Use a sub-test fixture instead of a new call.
  {
    const responses2 = [INTENT_IMPL_UNDEFINED, INTENT_IMPL_ZERO];
    const client2 = scriptedClient(responses2);
    const { agent: agent2 } = makeAgent(client2);
    const verdict2 = await intentProbe({
      agent: agent2,
      prompt: "Implement fn(s).",
      entry: "fn",
      inputs,
      k: 2,
    });
    assert.equal(verdict2.splits.length, 1);
    const sp = verdict2.splits[0]!;
    // impl[0] → "value:undefined"; impl[1] → "value:0"
    assert.ok("value:undefined" in sp.outcomes, "key must be value:undefined");
    assert.ok("value:0" in sp.outcomes, "key must be value:0");
  }

  // Verify different error messages → same "throw" key (no message-based clustering):
  // [2] throws "error A", [3] throws "error B" — but both are nonviable in the main run.
  // Create a separate run where only the two throw impls run with a viable third.
  {
    // 3 impls: [0] returns 0 (viable), [1] throws A (viable-check: throws on ALL inputs),
    // [2] throws B (viable-check: throws on ALL inputs).
    // inputs: [["x"]]
    // [0]: fn("x") = 0 → viable
    // [1]: fn("x") = throw → nonviable
    // [2]: fn("x") = throw → nonviable
    // So no split, but both throw impls are counted nonviable.
    // To see throw clustering: need [0] throw-A, [1] throw-B, plus [2] viable-return.
    // Then [0] and [1] are nonviable, [2] is viable with outcome "value:0" — no split.
    // Let's use a scenario where all three are viable but some throw on one input.
    // inputs: [["x"], ["y"]]
    // [0] INTENT_IMPL_ZERO: fn("x")=0, fn("y")=0 → viable
    // [1] INTENT_IMPL_THROW_A: fn("x")=throw, fn("y")=throw → nonviable
    // [2] INTENT_IMPL_THROW_B: fn("x")=throw, fn("y")=throw → nonviable
    // → nonviable=2, viable=1, splits=[] (only 1 viable impl, no disagreement).
    //
    // Better: use 2 inputs where impl throws only on one.
    // Build a "throws only on x" impl inline via scriptedClient with custom code.
    const THROW_ON_X_A = fence(`
function fn(s) {
  if (s === "x") throw new Error("error A");
  return 0;
}
`);
    const THROW_ON_X_B = fence(`
function fn(s) {
  if (s === "x") throw new Error("error B");
  return 0;
}
`);
    const inputs3: readonly (readonly unknown[])[] = [["x"], ["y"]];
    const responses3 = [THROW_ON_X_A, THROW_ON_X_B, INTENT_IMPL_ZERO];
    const client3 = scriptedClient(responses3);
    const { agent: agent3 } = makeAgent(client3);
    const verdict3 = await intentProbe({
      agent: agent3,
      prompt: "Implement fn(s).",
      entry: "fn",
      inputs: inputs3,
      k: 3,
    });
    // All 3 viable (fn("y")=0 for all).
    assert.equal(verdict3.viable, 3);
    // Split on "x": [0] → "throw", [1] → "throw", [2] → "value:0"
    // Both throw impls cluster under same "throw" key (not by message).
    const xSplit = verdict3.splits.find((sp) => sp.inputIndex === 0);
    assert.ok(xSplit !== undefined, "split on inputIndex 0 expected");
    assert.equal(xSplit!.outcomes["throw"], 2, "both error-A and error-B count under 'throw'");
    assert.equal(xSplit!.outcomes["value:0"], 1);
    assert.equal(Object.keys(xSplit!.outcomes).length, 2);
    // No split on "y" (all return 0).
    assert.ok(!verdict3.splits.some((sp) => sp.inputIndex === 1));
  }
});

// ── AC13: intentProbe — viability screen ─────────────────────────────────────

test("AC13 intentProbe viability screen — broken impl excluded", async () => {
  // k=4: 1 syntactically broken (throws on every input), 3 viable and in full agreement.
  // inputs: [["a"], ["b"]]
  // broken: all throw → nonviable=1
  // viable 3 all return 0 → agree → splits=[], decidedRate=1

  const inputs: readonly (readonly unknown[])[] = [["a"], ["b"]];
  const responses = [
    INTENT_IMPL_BROKEN,
    INTENT_IMPL_ZERO,
    INTENT_IMPL_ZERO,
    INTENT_IMPL_ZERO,
  ];
  const client = scriptedClient(responses);
  const { agent } = makeAgent(client);

  const verdict = await intentProbe({
    agent,
    prompt: "Implement fn(s).",
    entry: "fn",
    inputs,
    k: 4,
  });

  assert.equal(verdict.generated, 4);
  assert.equal(verdict.viable, 3);
  assert.equal(verdict.nonviable, 1);
  assert.equal(verdict.splits.length, 0);
  assert.equal(verdict.decidedRate, 1);
});

test("AC13 intentProbe viability screen — all impls nonviable → viable=0, decidedRate=0", async () => {
  // ALL impls throw on every input → viable=0, decidedRate=0, splits=[], no throw.
  const inputs: readonly (readonly unknown[])[] = [["x"]];
  const responses = [
    INTENT_IMPL_THROW_A,
    INTENT_IMPL_THROW_B,
    INTENT_IMPL_THROW_A,
    INTENT_IMPL_THROW_B,
  ];
  const client = scriptedClient(responses);
  const { agent } = makeAgent(client);

  const verdict = await intentProbe({
    agent,
    prompt: "Implement fn(s).",
    entry: "fn",
    inputs,
    k: 4,
  });

  assert.equal(verdict.viable, 0);
  assert.equal(verdict.decidedRate, 0);
  assert.deepEqual(verdict.splits, []);
  // No throw raised.
});

// ── AC14: intentProbe — empty inputs throws before any model call ─────────────

test("AC14 intentProbe empty inputs throws before any model call", async () => {
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
      intentProbe({
        agent,
        prompt: "Implement fn(s).",
        entry: "fn",
        inputs: [],
        k: 2,
      }),
    (err: Error) => {
      assert.ok(
        err.message.includes("inputs"),
        `error should name the field: "${err.message}"`,
      );
      return true;
    },
  );

  assert.equal(callCount, 0, "no model call should be made");
});

// ── AC15: intentProbe — prompt verbatim, no contract section injected ──────────

test("AC15 intentProbe prompt verbatim and system default", async () => {
  const captured: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const k = 3;
  const responses = Array.from({ length: k }, () => INTENT_IMPL_ZERO);
  const client = scriptedClient(responses, (body, idx) => captured.push(body));
  const { agent } = makeAgent(client);

  const PROSE_PROMPT = "Given a string s, implement fn(s) that returns its length.";
  const inputs: readonly (readonly unknown[])[] = [["hello"]];

  await intentProbe({
    agent,
    prompt: PROSE_PROMPT,
    entry: "fn",
    inputs,
    k,
  });

  // k requests total.
  assert.equal(captured.length, k);

  const EXPECTED_SYSTEM =
    "Implement the requested function in JavaScript. Output ONLY one fenced code block. No prose.";

  for (let i = 0; i < k; i++) {
    const body = captured[i]!;
    // user content === opts.prompt verbatim (no rewrapping, no contract section).
    assert.equal(
      body.messages[0]!.content as string,
      PROSE_PROMPT,
      `request ${i}: user content should be opts.prompt verbatim`,
    );
    // system === pinned neutral default when opts.system is omitted.
    assert.equal(
      body.system,
      EXPECTED_SYSTEM,
      `request ${i}: system should be PROBE_DEFAULT_SYSTEM`,
    );
  }
});

// ── AC16: intentProbe — metering ─────────────────────────────────────────────

test("AC16 intentProbe metering — k ledger entries kind gate.intent; costUsd equals sum", async () => {
  const k = 4;
  const inputs: readonly (readonly unknown[])[] = [["x"]];
  const responses = Array.from({ length: k }, () => INTENT_IMPL_ZERO);
  const client = scriptedClient(responses);
  const { agent, ledger } = makeAgent(client);

  const verdict = await intentProbe({
    agent,
    prompt: "Implement fn(s).",
    entry: "fn",
    inputs,
    k,
    kind: "gate.intent",
  });

  const entries = ledger.all();
  const intentEntries = entries.filter((e) => e.kind === "gate.intent");
  assert.equal(intentEntries.length, k, `expected ${k} ledger entries`);

  const ledgerSum = intentEntries.reduce((s, e) => s + e.costUsd, 0);
  assert.ok(
    Math.abs(verdict.costUsd - ledgerSum) < 1e-9,
    `verdict.costUsd (${verdict.costUsd}) should equal ledger sum (${ledgerSum})`,
  );
});

test("AC16 intentProbe metering — exhausted-retry generation excluded from generated, cost 0", async () => {
  // A generation that fails all retries: code=undefined, costUsd=0.
  // It should not count toward generated; the run should complete.
  // We simulate this by using alwaysThrowsClient for 2 out of k=3 slots.
  // But scriptedClient doesn't support per-slot error injection.
  // Instead: use a client that throws on the 2nd and 3rd call only.

  let callCount = 0;
  const k = 3;
  // Simulate: call 0 succeeds; calls 1-8 (retries for slots 1 and 2) throw.
  // Note: each failing slot retries MAX_API_ATTEMPTS (3) times.
  // So: slot 0 → 1 call (success), slot 1 → 3 calls (all throw), slot 2 → 3 calls (all throw).
  // Total calls: up to 1 + 3 + 3 = 7, but concurrency may interleave.
  // For simplicity: first call returns code, subsequent calls throw.
  const client: MessagesClient = {
    messages: {
      create: async () => {
        const idx = callCount++;
        if (idx === 0) {
          return {
            content: [{ type: "text", text: INTENT_IMPL_ZERO }],
            usage: { input_tokens: 100, output_tokens: 50 },
          } as unknown as Anthropic.Message;
        }
        throw new Error("network failure");
      },
    },
  };
  const { agent, ledger } = makeAgent(client);

  const inputs: readonly (readonly unknown[])[] = [["x"]];
  const verdict = await intentProbe({
    agent,
    prompt: "Implement fn(s).",
    entry: "fn",
    inputs,
    k,
  });

  // Slot 0 succeeds → generated=1, viable=1.
  // Slots 1 and 2 exhaust retries → not generated, cost 0.
  assert.equal(verdict.generated, 1);
  assert.equal(verdict.viable, 1);
  assert.equal(verdict.k, k);
  // costUsd is just the cost of slot 0 (slots 1,2 return costUsd=0).
  const entries = ledger.all();
  const intentEntries = entries.filter((e) => e.kind === "gate.intent");
  // Only 1 successful generation → 1 ledger entry.
  assert.equal(intentEntries.length, 1);
  const ledgerSum = intentEntries.reduce((s, e) => s + e.costUsd, 0);
  assert.ok(
    Math.abs(verdict.costUsd - ledgerSum) < 1e-9,
    `verdict.costUsd (${verdict.costUsd}) should equal ledger sum (${ledgerSum})`,
  );
});
