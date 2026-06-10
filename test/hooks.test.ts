/** Dev-loop cost hook core — see src/hooks/cost-from-transcript.ts */
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractCostRows, priceModel } from "../src/hooks/cost-from-transcript.ts";

// A minimal Claude Code transcript: two assistant turns + a user line + junk.
function transcript(): string {
  return [
    JSON.stringify({ type: "user", uuid: "u0", message: { role: "user", content: "hi" } }),
    JSON.stringify({
      type: "assistant",
      uuid: "a1",
      requestId: "req_1",
      timestamp: "2026-06-10T00:00:00Z",
      message: {
        id: "msg_1",
        role: "assistant",
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
      },
    }),
    "{ not json",
    JSON.stringify({
      type: "assistant",
      uuid: "a2",
      requestId: "req_2",
      timestamp: "2026-06-10T00:01:00Z",
      message: {
        id: "msg_2",
        role: "assistant",
        model: "claude-opus-4-8",
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_read_input_tokens: 1_000_000,
          cache_creation_input_tokens: 0,
        },
      },
    }),
  ].join("\n");
}

test("priceModel: known model gets catalog prices, unknown gets $0 + id label", () => {
  const sonnet = priceModel("claude-sonnet-4-6");
  assert.equal(sonnet.inputPerMTok, 3);
  assert.equal(sonnet.outputPerMTok, 15);
  assert.equal(sonnet.label, "sonnet-4-6");

  const unknown = priceModel("claude-future-9");
  assert.equal(unknown.inputPerMTok, 0);
  assert.equal(unknown.outputPerMTok, 0);
  assert.equal(unknown.label, "claude-future-9");
});

test("extractCostRows: prices assistant turns, skips junk/user, carries requestId", () => {
  const rows = extractCostRows(transcript(), new Set(), { sessionId: "sesh_1" });
  assert.equal(rows.length, 2);

  const [r1, r2] = rows;
  // sonnet: 1M in @ $3 + 1M out @ $15 = $18
  assert.ok(Math.abs(r1!.costUsd - 18) < 1e-9);
  assert.equal(r1!.requestId, "req_1");
  assert.equal(r1!.sessionId, "sesh_1");
  assert.equal(r1!.modelLabel, "sonnet-4-6");
  assert.equal(r1!.kind, "claudecode.subagent");

  // opus: 1M cache-read @ $5 × 0.1 = $0.50
  assert.ok(Math.abs(r2!.cost.cacheReadCost - 0.5) < 1e-9);
  assert.ok(Math.abs(r2!.costUsd - 0.5) < 1e-9);
});

test("extractCostRows: ctx.kind tags rows (role discriminator); defaults to subagent", () => {
  const main = extractCostRows(transcript(), new Set(), { kind: "claudecode.main" });
  assert.ok(main.every((r) => r.kind === "claudecode.main"));

  const def = extractCostRows(transcript(), new Set());
  assert.ok(def.every((r) => r.kind === "claudecode.subagent"));
});

test("extractCostRows: dedup by uuid — already-seen messages are not re-recorded", () => {
  const all = extractCostRows(transcript(), new Set());
  assert.equal(all.length, 2);

  // Second pass with a1 already seen → only a2 emitted.
  const seen = new Set(["a1"]);
  const second = extractCostRows(transcript(), seen);
  assert.equal(second.length, 1);
  assert.equal(second[0]!.uuid, "a2");

  // Both seen → nothing.
  assert.equal(extractCostRows(transcript(), new Set(["a1", "a2"])).length, 0);
});
