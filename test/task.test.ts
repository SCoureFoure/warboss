/** AC1, AC2, AC5 — see specs/probe-signature.spec.md rev 1 (H-23) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { loadTask } from "../src/experiment/task.ts";

const _thisDir = dirname(fileURLToPath(import.meta.url));
const TASKS_DIR = join(_thisDir, "..", "tasks");

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Create a minimal task directory in a temp location for testing.
 * Allows overriding fields in task.json and hidden-battery.json.
 */
async function makeTempTask(opts: {
  taskJson?: Record<string, unknown>;
  hiddenJson?: unknown[];
  requirementMd?: string;
}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "task-test-"));

  const taskJson = opts.taskJson ?? {
    name: "test-task",
    entry: "testFn",
    version: "1",
    examples: [{ name: "basic", input: ["x"], expected: 1 }],
    armCSubset: ["basic"],
  };

  const hiddenJson = opts.hiddenJson ?? [
    { name: "hidden-1", input: ["y"], expected: 2, coveredBy: ["basic"] },
  ];

  const requirementMd = opts.requirementMd ?? "Implement testFn.";

  await writeFile(join(dir, "task.json"), JSON.stringify(taskJson));
  await writeFile(join(dir, "hidden-battery.json"), JSON.stringify(hiddenJson));
  await writeFile(join(dir, "requirement.md"), requirementMd);

  return dir;
}

// ── AC1: loader surfaces signature ────────────────────────────────────────────

test("AC1a loader surfaces signature — task.json with signature string → TaskDef.signature matches", async () => {
  const dir = await makeTempTask({
    taskJson: {
      name: "test-task",
      entry: "testFn",
      version: "1",
      signature: "(input: string) => number",
      examples: [{ name: "basic", input: ["x"], expected: 1 }],
      armCSubset: ["basic"],
    },
  });

  const taskDef = loadTask(dir);
  assert.equal(
    taskDef.signature,
    "(input: string) => number",
    "signature should match the value in task.json",
  );
});

test("AC1b loader back-compat — task.json with no signature key → TaskDef.signature === ''", async () => {
  // task.json without signature field (existing format)
  const dir = await makeTempTask({
    taskJson: {
      name: "test-task",
      entry: "testFn",
      version: "1",
      examples: [{ name: "basic", input: ["x"], expected: 1 }],
      armCSubset: ["basic"],
    },
  });

  const taskDef = loadTask(dir);
  assert.equal(
    taskDef.signature,
    "",
    "missing signature should default to empty string",
  );
  // Other fields should be unchanged
  assert.equal(taskDef.grader.entry, "testFn");
  assert.ok(taskDef.hidden.length > 0);
});

// ── AC2: loader validates type ────────────────────────────────────────────────

test("AC2 loader rejects non-string signature — number → throws descriptive error", async () => {
  const dir = await makeTempTask({
    taskJson: {
      name: "test-task",
      entry: "testFn",
      version: "1",
      signature: 42,  // non-string
      examples: [{ name: "basic", input: ["x"], expected: 1 }],
      armCSubset: ["basic"],
    },
  });

  assert.throws(
    () => loadTask(dir),
    (err: Error) => {
      assert.ok(
        err.message.toLowerCase().includes("signature"),
        `error should name the field 'signature': "${err.message}"`,
      );
      return true;
    },
    "loadTask should throw a descriptive error for non-string signature",
  );
});

test("AC2b loader rejects boolean signature — throws descriptive error", async () => {
  const dir = await makeTempTask({
    taskJson: {
      name: "test-task",
      entry: "testFn",
      version: "1",
      signature: true,  // non-string
      examples: [{ name: "basic", input: ["x"], expected: 1 }],
      armCSubset: ["basic"],
    },
  });

  assert.throws(
    () => loadTask(dir),
    (err: Error) => {
      assert.ok(
        err.message.toLowerCase().includes("signature"),
        `error should name the field 'signature': "${err.message}"`,
      );
      return true;
    },
  );
});

// ── AC5: asset value pinned ───────────────────────────────────────────────────

test("AC5 duration-parse asset has pinned signature — loadTask returns '(input: string) => number'", () => {
  const taskDef = loadTask(join(TASKS_DIR, "duration-parse"));
  assert.equal(
    taskDef.signature,
    "(input: string) => number",
    "duration-parse task.json must contain signature '(input: string) => number'",
  );
});
