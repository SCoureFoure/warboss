/** AC20 — see specs/membrane-core.spec.md */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { jsonlFileSink } from "../src/ledger-sink.ts";
import type { LedgerEntry } from "../src/cost.ts";

function entry(kind: string, requestId: string): LedgerEntry {
  return {
    kind,
    model: "x",
    modelLabel: "x-label",
    requestId,
    usage: { inputTokens: 1, outputTokens: 1 },
    wallMs: 1,
    costUsd: 0.001,
    cost: {
      inputCost: 0.0005,
      outputCost: 0.0005,
      cacheReadCost: 0,
      cacheWriteCost: 0,
      totalCost: 0.001,
      inputPerMTok: 1,
      outputPerMTok: 5,
    },
    at: new Date().toISOString(),
  };
}

test("AC20 jsonlFileSink appends one JSON.parse-able line per entry, creating the dir", async () => {
  const base = await mkdtemp(join(tmpdir(), "sink-"));
  // Nested path that does not exist yet — sink must create it.
  const filePath = join(base, "nested", "cost-ledger.jsonl");
  const sink = jsonlFileSink(filePath);

  sink(entry("a", "req_1"));
  sink(entry("b", "req_2"));
  sink(entry("c", "req_3"));

  const raw = await readFile(filePath, "utf8");
  const lines = raw.split("\n").filter((l) => l.length > 0);
  assert.equal(lines.length, 3);

  const parsed = lines.map((l) => JSON.parse(l) as LedgerEntry);
  assert.deepEqual(
    parsed.map((p) => p.requestId),
    ["req_1", "req_2", "req_3"],
  );
  assert.equal(parsed[0]!.cost.totalCost, 0.001);
});
