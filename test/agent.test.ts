/** AC13–AC15, AC19 — see specs/membrane-core.spec.md */
import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { Agent, extractCode, GRUNT_DOGMA, type MessagesClient } from "../src/agent.ts";
import { Ledger } from "../src/cost.ts";
import { TIERS } from "../src/models.ts";

/** A deterministic fake — records the request body, returns canned content. */
function fakeClient(
  text: string,
  capture?: (body: Anthropic.MessageCreateParamsNonStreaming) => void,
  requestId?: string,
): MessagesClient {
  return {
    messages: {
      create: async (body) => {
        capture?.(body);
        return {
          content: [{ type: "text", text }],
          usage: { input_tokens: 100, output_tokens: 50 },
          ...(requestId !== undefined ? { _request_id: requestId } : {}),
        } as unknown as Anthropic.Message;
      },
    },
  };
}

test("AC13 generate meters exactly one ledger call and returns cost/usage/code", async () => {
  const ledger = new Ledger();
  const agent = new Agent(TIERS.LOW, ledger, {
    client: fakeClient("```js\nfunction add(a, b) { return a + b; }\n```"),
  });

  const gen = await agent.generate({ prompt: "add", kind: "grunt.generate", tags: { arm: "t" } });

  assert.equal(gen.usage.inputTokens, 100);
  assert.equal(gen.usage.outputTokens, 50);
  assert.equal(gen.code, "function add(a, b) { return a + b; }");
  // haiku: $1/Mtok in, $5/Mtok out → 100e-6 + 250e-6
  assert.ok(Math.abs(gen.costUsd - 0.00035) < 1e-9, `cost ${gen.costUsd}`);

  const entries = ledger.all();
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.tags?.["arm"], "t");
  assert.equal(entries[0]?.costUsd, gen.costUsd);
});

test("AC14 extractCode: fenced (tagged/untagged), unfenced fallback, empty", () => {
  assert.equal(extractCode("```ts\nX\n```"), "X");
  assert.equal(extractCode("```\nY\n```"), "Y");
  assert.equal(extractCode("hello"), "hello");
  assert.equal(extractCode(""), undefined);
  assert.equal(extractCode("   "), undefined);
});

test("AC19 generate captures the response _request_id into the ledger entry", async () => {
  const ledger = new Ledger();

  // Response carries a request id → captured.
  const a1 = new Agent(TIERS.LOW, ledger, { client: fakeClient("ok", undefined, "req_abc") });
  await a1.generate({ prompt: "p" });
  assert.equal(ledger.all()[0]?.requestId, "req_abc");

  // Response has none → requestId absent (offline/fake calls).
  const a2 = new Agent(TIERS.LOW, ledger, { client: fakeClient("ok") });
  await a2.generate({ prompt: "p" });
  assert.equal(ledger.all()[1]?.requestId, undefined);
});

test("AC15 system defaults to GRUNT_DOGMA; thinking forwarded only when set", async () => {
  const ledger = new Ledger();

  let body1: Anthropic.MessageCreateParamsNonStreaming | undefined;
  const a1 = new Agent(TIERS.LOW, ledger, { client: fakeClient("ok", (b) => (body1 = b)) });
  await a1.generate({ prompt: "p" });
  assert.equal(body1?.system, GRUNT_DOGMA);
  assert.equal(body1?.thinking, undefined);

  let body2: Anthropic.MessageCreateParamsNonStreaming | undefined;
  const a2 = new Agent(TIERS.HIGH, ledger, { client: fakeClient("ok", (b) => (body2 = b)) });
  await a2.generate({ prompt: "p", thinking: { type: "adaptive" } });
  assert.deepEqual(body2?.thinking, { type: "adaptive" });
});
