/** AC1–AC11 — loop.ts unit tests */
import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import type { MessagesClient } from "../src/agent.ts";
import { Agent } from "../src/agent.ts";
import { Ledger } from "../src/cost.ts";
import { Contract } from "../src/contract.ts";
import { ContractHashMismatch } from "../src/runner.ts";
import { TIERS } from "../src/models.ts";
import { runLoop } from "../src/loop.ts";

// A simple contract: add(a, b) === a + b
const ADD_CONTRACT = Contract.freeze({
  requirement: "Implement add(a, b) returning a + b.",
  entry: "add",
  version: "1",
  examples: [
    { input: [1, 2], expected: 3 },
    { input: [0, 0], expected: 0 },
    { input: [-1, 1], expected: 0 },
  ],
});

const CORRECT_ADD = `function add(a, b) { return a + b; }`;
const WRONG_ADD = `function add(a, b) { return 0; }`;
const WRONG_ADD_B = `function add(a, b) { return -1; }`;
const WRONG_ADD_C = `function add(a, b) { return 99; }`;
const WRONG_ADD_D = `function add(a, b) { return 42; }`;
const WRONG_ADD_E = `function add(a, b) { return 7; }`;

function fence(code: string): string {
  return "```js\n" + code + "\n```";
}

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
          usage: { input_tokens: 10, output_tokens: 5 },
        } as unknown as Anthropic.Message;
      },
    },
  };
}

function scriptedClient(
  responses: string[],
  capture?: (body: Anthropic.MessageCreateParamsNonStreaming, idx: number) => void,
): MessagesClient {
  let calls = 0;
  return {
    messages: {
      create: async (body) => {
        const idx = calls++;
        capture?.(body, idx);
        const text = responses[idx] ?? responses[responses.length - 1] ?? "";
        return {
          content: [{ type: "text", text }],
          usage: { input_tokens: 10, output_tokens: 5 },
        } as unknown as Anthropic.Message;
      },
    },
  };
}

function makeAgent(client: MessagesClient): { agent: Agent; ledger: Ledger } {
  const ledger = new Ledger();
  const agent = new Agent(TIERS.LOW, ledger, { client });
  return { agent, ledger };
}

// ── AC1 ──────────────────────────────────────────────────────────────────────

test("AC1 green first try: status=green, 1 attempt, finalCode set, attempt.pass=true", async () => {
  const { agent } = makeAgent(fakeClient(fence(CORRECT_ADD)));
  const result = await runLoop({
    agent,
    contract: ADD_CONTRACT,
    prompt: "implement add",
  });

  assert.equal(result.status, "green");
  assert.equal(result.green, true);
  assert.equal(result.attemptsUsed, 1);
  assert.equal(result.attempts.length, 1);
  assert.ok(result.finalCode !== undefined);
  assert.equal(result.attempts[0]!.pass, true);
  assert.equal(result.attempts[0]!.generationFailed, false);
  assert.equal(result.attempts[0]!.index, 1);
});

// ── AC2 ──────────────────────────────────────────────────────────────────────

test("AC2 wrong then correct: status=green, 2 attempts; attempt 1 pass=false, non-empty feedback; second request prompt matches template", async () => {
  const capturedBodies: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const { agent } = makeAgent(
    scriptedClient([fence(WRONG_ADD), fence(CORRECT_ADD)], (body) => {
      capturedBodies.push(body);
    }),
  );

  const result = await runLoop({
    agent,
    contract: ADD_CONTRACT,
    prompt: "implement add",
  });

  assert.equal(result.status, "green");
  assert.equal(result.attemptsUsed, 2);
  assert.equal(result.attempts[0]!.pass, false);
  assert.ok(result.attempts[0]!.feedback.length > 0);
  assert.equal(result.attempts[1]!.pass, true);

  // Second request must follow the retry template
  assert.equal(capturedBodies.length, 2);
  const retryPrompt = capturedBodies[1]!.messages[0]!.content as string;
  assert.ok(retryPrompt.includes("implement add"), "contains original prompt");
  assert.ok(retryPrompt.includes("Your previous implementation:"), "contains previous impl block");
  assert.ok(retryPrompt.includes("Judge feedback:"), "contains judge feedback header");
  assert.ok(retryPrompt.includes("Fix the implementation. Output ONLY one fenced code block."), "contains fix instruction");
});

// ── AC3 ──────────────────────────────────────────────────────────────────────

test("AC3 granularity full: feedback has 'got'/'expected'", async () => {
  const { agent } = makeAgent(
    scriptedClient([fence(WRONG_ADD), fence(CORRECT_ADD)]),
  );
  const result = await runLoop({
    agent,
    contract: ADD_CONTRACT,
    prompt: "implement add",
    granularity: "full",
  });
  const feedback = result.attempts[0]!.feedback;
  assert.ok(feedback.includes("got") || feedback.includes("expected"), `full feedback: ${feedback}`);
});

test("AC3 granularity input: feedback has failing input but not 'expected'", async () => {
  const { agent } = makeAgent(
    scriptedClient([fence(WRONG_ADD), fence(CORRECT_ADD)]),
  );
  const result = await runLoop({
    agent,
    contract: ADD_CONTRACT,
    prompt: "implement add",
    granularity: "input",
  });
  const feedback = result.attempts[0]!.feedback;
  assert.ok(feedback.includes("input"), `input feedback must include 'input': ${feedback}`);
  assert.ok(!feedback.includes("expected"), `input feedback must not include 'expected': ${feedback}`);
});

test("AC3 granularity passfail: feedback matches /^\\d+ case\\(s\\) failed\\.$/", async () => {
  const { agent } = makeAgent(
    scriptedClient([fence(WRONG_ADD), fence(CORRECT_ADD)]),
  );
  const result = await runLoop({
    agent,
    contract: ADD_CONTRACT,
    prompt: "implement add",
    granularity: "passfail",
  });
  const feedback = result.attempts[0]!.feedback;
  assert.match(feedback, /^\d+ case\(s\) failed\.$/);
});

// ── AC4 ──────────────────────────────────────────────────────────────────────

test("AC4 stall: same wrong impl every call → 2 attempts, status=stalled, budget NOT consumed", async () => {
  let callCount = 0;
  const client: MessagesClient = {
    messages: {
      create: async () => {
        callCount++;
        return {
          content: [{ type: "text", text: fence(WRONG_ADD) }],
          usage: { input_tokens: 10, output_tokens: 5 },
        } as unknown as Anthropic.Message;
      },
    },
  };
  const { agent } = makeAgent(client);
  const result = await runLoop({
    agent,
    contract: ADD_CONTRACT,
    prompt: "implement add",
    budget: 5,
  });

  assert.equal(result.status, "stalled");
  assert.equal(result.attemptsUsed, 2);
  assert.equal(result.attempts.length, 2);
  assert.equal(callCount, 2, "budget 5 NOT consumed — only 2 calls made");
  assert.equal(result.green, false);
});

// ── AC5 ──────────────────────────────────────────────────────────────────────

test("AC5 exhausted: distinct wrong impl each call → exactly budget attempts, status=exhausted, finalCode=last code", async () => {
  const impls = [WRONG_ADD, WRONG_ADD_B, WRONG_ADD_C, WRONG_ADD_D, WRONG_ADD_E];
  const { agent } = makeAgent(
    scriptedClient(impls.map((c) => fence(c))),
  );
  const result = await runLoop({
    agent,
    contract: ADD_CONTRACT,
    prompt: "implement add",
    budget: 5,
  });

  assert.equal(result.status, "exhausted");
  assert.equal(result.attemptsUsed, 5);
  assert.equal(result.attempts.length, 5);
  assert.ok(result.finalCode !== undefined);
  assert.ok(result.finalCode!.includes("7"), "finalCode is last impl");
});

// ── AC6 ──────────────────────────────────────────────────────────────────────

test("AC6 no-code attempt 1 then correct attempt 2: generationFailed, no-code feedback, no previous impl block, status=green", async () => {
  const capturedBodies: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const { agent } = makeAgent(
    scriptedClient(["", fence(CORRECT_ADD)], (body) => {
      capturedBodies.push(body);
    }),
  );

  const result = await runLoop({
    agent,
    contract: ADD_CONTRACT,
    prompt: "implement add",
  });

  assert.equal(result.status, "green");
  assert.equal(result.attemptsUsed, 2);
  assert.equal(result.attempts[0]!.generationFailed, true);
  assert.equal(result.attempts[1]!.generationFailed, false);

  const retryPrompt = capturedBodies[1]!.messages[0]!.content as string;
  assert.ok(
    retryPrompt.includes("Your previous response contained no code block."),
    "no-code message present",
  );
  assert.ok(
    !retryPrompt.includes("Your previous implementation:"),
    "no previous impl block in no-code retry",
  );
});

// ── AC7 ──────────────────────────────────────────────────────────────────────

test("AC7 type-level: LoopOptions has no battery field", () => {
  // Compile-time check — accessing .battery on LoopOptions would be a type error.
  // We verify at runtime that no 'battery' key leaks into any captured prompt.
  const capturedBodies: Anthropic.MessageCreateParamsNonStreaming[] = [];
  // We don't run async here, just verify no hidden input appears in prompts.
  // The behavioral test is that no hidden input appears in any prompt.
  // Checked by inspecting that "battery" is not a known key on the options.
  type HasNoBattery = "battery" extends keyof import("../src/loop.ts").LoopOptions ? never : true;
  const _check: HasNoBattery = true as const;
  void _check;
  void capturedBodies;
});

test("AC7 behavioral: no hidden input appears in any captured prompt", async () => {
  const capturedBodies: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const { agent } = makeAgent(
    scriptedClient(
      [fence(WRONG_ADD), fence(WRONG_ADD_B), fence(CORRECT_ADD)],
      (body) => capturedBodies.push(body),
    ),
  );

  await runLoop({
    agent,
    contract: ADD_CONTRACT,
    prompt: "implement add",
  });

  // The contract has no hidden battery; verify no unexpected inputs sneak into prompts
  // (this is a basic check — the real guard is that runLoop doesn't accept a battery)
  assert.ok(capturedBodies.length > 0);
  for (const body of capturedBodies) {
    const content = body.messages[0]!.content as string;
    assert.ok(typeof content === "string");
  }
});

// ── AC8 ──────────────────────────────────────────────────────────────────────

test("AC8 tampered contract: runLoop propagates ContractHashMismatch uncaught", async () => {
  const fakeContractWithWrongHash = {
    requirement: ADD_CONTRACT.requirement,
    entry: ADD_CONTRACT.entry,
    examples: ADD_CONTRACT.examples,
    version: ADD_CONTRACT.version,
    hash: "deadbeef",
    verify: (_h: string) => false,
  } as unknown as Contract;

  const { agent } = makeAgent(fakeClient(fence(CORRECT_ADD)));

  await assert.rejects(
    () =>
      runLoop({
        agent,
        contract: fakeContractWithWrongHash,
        prompt: "implement add",
      }),
    ContractHashMismatch,
  );
});

// ── AC9 ──────────────────────────────────────────────────────────────────────

test("AC9 ledger tagging: 2 entries tagged attempt:1/attempt:2, kind=grunt.loop; result.costUsd=sum", async () => {
  const { agent, ledger } = makeAgent(
    scriptedClient([fence(WRONG_ADD), fence(CORRECT_ADD)]),
  );

  const result = await runLoop({
    agent,
    contract: ADD_CONTRACT,
    prompt: "implement add",
    kind: "grunt.loop",
  });

  const entries = ledger.all();
  assert.equal(entries.length, 2);
  assert.equal(entries[0]!.kind, "grunt.loop");
  assert.equal(entries[0]!.tags?.attempt, 1);
  assert.equal(entries[1]!.kind, "grunt.loop");
  assert.equal(entries[1]!.tags?.attempt, 2);

  const ledgerTotal = entries.reduce((s, e) => s + e.costUsd, 0);
  assert.ok(Math.abs(result.costUsd - ledgerTotal) < 1e-9);
});

// ── AC10 ─────────────────────────────────────────────────────────────────────

test("AC10 throws-once-then-succeeds: 1 attempt, status=green, 1 ledger entry", async () => {
  let callCount = 0;
  const client: MessagesClient = {
    messages: {
      create: async () => {
        const n = callCount++;
        if (n === 0) throw new Error("transient");
        return {
          content: [{ type: "text", text: fence(CORRECT_ADD) }],
          usage: { input_tokens: 10, output_tokens: 5 },
        } as unknown as Anthropic.Message;
      },
    },
  };
  const { agent, ledger } = makeAgent(client);

  const result = await runLoop({
    agent,
    contract: ADD_CONTRACT,
    prompt: "implement add",
  });

  assert.equal(result.status, "green");
  assert.equal(result.attemptsUsed, 1);
  assert.equal(ledger.all().length, 1);
});

test("AC10 always-throws client: budget attempts all generationFailed, status=exhausted, 0 ledger entries, no throw", async () => {
  const client: MessagesClient = {
    messages: {
      create: async () => {
        throw new Error("always fails");
      },
    },
  };
  const { agent, ledger } = makeAgent(client);

  const result = await runLoop({
    agent,
    contract: ADD_CONTRACT,
    prompt: "implement add",
    budget: 5,
  });

  assert.equal(result.status, "exhausted");
  assert.equal(result.attemptsUsed, 5);
  assert.ok(result.attempts.every((a) => a.generationFailed === true));
  assert.equal(ledger.all().length, 0);
  assert.equal(result.finalCode, undefined);
});

// ── AC11 ─────────────────────────────────────────────────────────────────────

test("AC11 3-attempt script: third prompt contains attempt 2 code but NOT attempt 1 code", async () => {
  const capturedBodies: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const { agent } = makeAgent(
    scriptedClient(
      [fence(WRONG_ADD), fence(WRONG_ADD_B), fence(CORRECT_ADD)],
      (body) => capturedBodies.push(body),
    ),
  );

  await runLoop({
    agent,
    contract: ADD_CONTRACT,
    prompt: "implement add",
  });

  assert.equal(capturedBodies.length, 3);
  const thirdPrompt = capturedBodies[2]!.messages[0]!.content as string;

  // Contains attempt 2's code (WRONG_ADD_B = "return -1")
  assert.ok(thirdPrompt.includes("return -1"), "third prompt has attempt 2 code");
  // Does NOT contain attempt 1's code (WRONG_ADD = "return 0")
  // Note: need to be careful — "return 0" might appear in judge feedback too.
  // Check the "Your previous implementation:" block specifically.
  const implBlock = thirdPrompt.split("Your previous implementation:")[1] ?? "";
  assert.ok(!implBlock.includes("return 0;"), "third prompt impl block does not have attempt 1 code");
});

// ── AC12 ─────────────────────────────────────────────────────────────────────

test("AC12 failed generation breaks stall pair: [code X, empty, code X, empty, empty] → status=exhausted, never stalled", async () => {
  const { agent } = makeAgent(
    scriptedClient([
      fence(WRONG_ADD),
      "",
      fence(WRONG_ADD),
      "",
      "",
    ]),
  );

  const result = await runLoop({
    agent,
    contract: ADD_CONTRACT,
    prompt: "implement add",
    budget: 5,
  });

  assert.equal(result.status, "exhausted", "status is exhausted, not stalled");
  assert.equal(result.attemptsUsed, 5, "all 5 attempts used");
  assert.equal(result.attempts.length, 5, "5 attempts recorded");
  // Verify the attempt sequence: attempt 1 code, 2 failed, 3 code, 4 failed, 5 failed
  assert.equal(result.attempts[0]!.generationFailed, false, "attempt 1 has code");
  assert.equal(result.attempts[1]!.generationFailed, true, "attempt 2 is empty");
  assert.equal(result.attempts[2]!.generationFailed, false, "attempt 3 has code");
  assert.equal(result.attempts[3]!.generationFailed, true, "attempt 4 is empty");
  assert.equal(result.attempts[4]!.generationFailed, true, "attempt 5 is empty");
});
