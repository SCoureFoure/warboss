/** AC1–AC2, AC17–AC18 — see specs/membrane-core.spec.md */
import { test } from "node:test";
import assert from "node:assert/strict";
import { costOf, costBreakdown, Ledger, type LedgerEntry } from "../src/cost.ts";
import type { ModelSpec } from "../src/models.ts";

const M: ModelSpec = { id: "x", label: "x-label", inputPerMTok: 1, outputPerMTok: 5 };

test("AC1 costOf: fresh input + output at full rate", () => {
  const c = costOf(M, { inputTokens: 1_000_000, outputTokens: 1_000_000 });
  assert.equal(c, 1 + 5);
});

test("AC1 costOf: cache read 0.1x, cache write 1.25x input rate", () => {
  const c = costOf(M, {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 1_000_000,
    cacheCreationInputTokens: 1_000_000,
  });
  assert.ok(Math.abs(c - (0.1 + 1.25)) < 1e-9, `got ${c}`);
});

test("AC2 ledger: record accumulates, totals sum, tag filter restricts", () => {
  const l = new Ledger();
  l.record({ kind: "a", model: M, usage: { inputTokens: 1_000_000, outputTokens: 0 }, wallMs: 10, tags: { arm: "A" } });
  l.record({ kind: "b", model: M, usage: { inputTokens: 2_000_000, outputTokens: 0 }, wallMs: 20, tags: { arm: "B" } });

  const all = l.totals();
  assert.equal(all.calls, 2);
  assert.equal(all.inputTokens, 3_000_000);
  assert.equal(all.wallMs, 30);
  assert.ok(Math.abs(all.costUsd - 3) < 1e-9);

  const a = l.totals({ arm: "A" });
  assert.equal(a.calls, 1);
  assert.ok(Math.abs(a.costUsd - 1) < 1e-9);
});

test("AC17 costBreakdown itemizes components + rates; totalCost equals costOf", () => {
  const usage = {
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    cacheReadInputTokens: 1_000_000,
    cacheCreationInputTokens: 1_000_000,
  };
  const b = costBreakdown(M, usage);
  assert.ok(Math.abs(b.inputCost - 1) < 1e-9);
  assert.ok(Math.abs(b.outputCost - 5) < 1e-9);
  assert.ok(Math.abs(b.cacheReadCost - 0.1) < 1e-9);
  assert.ok(Math.abs(b.cacheWriteCost - 1.25) < 1e-9);
  assert.equal(b.inputPerMTok, 1);
  assert.equal(b.outputPerMTok, 5);
  assert.ok(Math.abs(b.totalCost - (1 + 5 + 0.1 + 1.25)) < 1e-9);
  assert.equal(b.totalCost, costOf(M, usage));
});

test("AC18 ledger entry carries modelLabel/cost/requestId; sink fires once per record", () => {
  const seen: LedgerEntry[] = [];
  const l = new Ledger((e) => seen.push(e));

  const e1 = l.record({
    kind: "a",
    model: M,
    usage: { inputTokens: 1_000_000, outputTokens: 0 },
    wallMs: 10,
    requestId: "req_123",
    tags: { arm: "A" },
  });
  assert.equal(e1.modelLabel, "x-label");
  assert.equal(e1.requestId, "req_123");
  assert.equal(e1.costUsd, e1.cost.totalCost);
  assert.ok(Math.abs(e1.cost.inputCost - 1) < 1e-9);

  // No requestId supplied → field absent (exactOptionalPropertyTypes).
  const e2 = l.record({ kind: "b", model: M, usage: { inputTokens: 0, outputTokens: 0 }, wallMs: 1 });
  assert.equal(e2.requestId, undefined);
  assert.ok(!("requestId" in e2));

  // Sink fired exactly once per record, with the stored entries in order.
  assert.equal(seen.length, 2);
  assert.equal(seen[0], e1);
  assert.equal(seen[1], e2);
});
