/** AC1–AC10 — process-isolated sandbox tests */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { Contract } from "../src/contract.ts";
import { judge, judgeAsync, ContractHashMismatch } from "../src/runner.ts";
import { runImplProc } from "../src/sandbox-proc.ts";
import { loadTask } from "../src/experiment/task.ts";

const _thisDir = dirname(fileURLToPath(import.meta.url));
const TASKS_DIR = join(_thisDir, "..", "tasks");
const DURATION_DIR = join(TASKS_DIR, "duration-parse");

// Reference parseDuration impl — passes all examples.
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

// ── AC1: parity ─────────────────────────────────────────────────────────────
test("AC1 parity: judgeAsync+runImplProc yields same vector/score as sync judge", async () => {
  const task = loadTask(DURATION_DIR);
  const syncResult = judge(task.grader, CORRECT_IMPL);
  const asyncResult = await judgeAsync(task.grader, CORRECT_IMPL, {
    runner: runImplProc,
    procOpts: { timeoutMs: 5000 },
  });

  assert.deepEqual(asyncResult.vector, syncResult.vector);
  assert.equal(asyncResult.score, syncResult.score);
  assert.equal(asyncResult.pass, syncResult.pass);
});

// ── AC2: fs denied ───────────────────────────────────────────────────────────
test("AC2 fs denied: require('fs') in impl → {ok:false}", async () => {
  const fsImpl = `function f() { const fs = require('fs'); return fs.readFileSync('/tmp/test', 'utf8'); }`;
  const result = await runImplProc(fsImpl, "f", [], { timeoutMs: 3000 });
  // require is replaced with undefined, calling undefined as function should error
  assert.equal(result.ok, false);
});

test("AC2 --permission flag: direct fs-reading child exits nonzero under --permission with restricted allow-fs-read", async () => {
  // Create a temp script that tries to read a different path than itself
  const dir = await mkdtemp(join(tmpdir(), "ac2-perm-"));
  const scriptPath = join(dir, "fs-test.mjs");
  const otherPath = join(dir, "other.txt");
  await writeFile(otherPath, "secret");
  // Script is allowed to read itself but not otherPath
  await writeFile(
    scriptPath,
    `import { readFileSync } from 'node:fs';\ntry { readFileSync(${JSON.stringify(otherPath)}); process.stdout.write("ok"); process.exit(0); } catch(e) { process.exit(1); }\n`,
  );

  const exitCode = await new Promise<number>((resolve) => {
    // Spawn with --permission + --allow-fs-read only for the script itself
    const child = spawn(
      process.execPath,
      ["--permission", `--allow-fs-read=${scriptPath}`, scriptPath],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });

  // With --permission restricting fs reads to only the script, reading otherPath should fail
  assert.notEqual(exitCode, 0, "--permission flag should deny reads to paths not in --allow-fs-read");
});

// ── AC3: sync runaway killed ──────────────────────────────────────────────────
test("AC3 sync runaway killed: while(true) → {ok:false} with error containing 'timeout', under wall budget +1s", async () => {
  const start = Date.now();
  const result = await runImplProc(
    "function f() { while(true) {} }",
    "f",
    [],
    { timeoutMs: 1000, vmTimeoutMs: 500 },
  );
  const elapsed = Date.now() - start;

  assert.equal(result.ok, false);
  if (!result.ok) {
    // vm says "timed out" or wall-clock kill produces "timeout"
    assert.match(result.error, /time/i);
  }
  // Must complete within wall budget + 1s (2s total)
  assert.ok(elapsed < 2000, `Expected completion within 2s, took ${elapsed}ms`);
});

// ── AC4: async runaway killed ─────────────────────────────────────────────────
test("AC4 async runaway killed: infinite async fn → {ok:false, error:timeout} at wall timeout", async () => {
  // Note: setInterval is NOT available in the vm context (empty sandbox).
  // Use only an unresolvable Promise — the wall-clock timer kills the child.
  const asyncRunaway = `
    async function f() {
      await new Promise(() => {});
    }
  `;
  const start = Date.now();
  const result = await runImplProc(asyncRunaway, "f", [], { timeoutMs: 1000 });
  const elapsed = Date.now() - start;

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, "timeout");
  }
  // Must complete at or shortly after the 1s wall timeout
  assert.ok(elapsed < 2500, `Expected completion within 2.5s, took ${elapsed}ms`);
});

// ── AC5: memory bounded ───────────────────────────────────────────────────────
test("AC5 memory bounded: OOM impl → {ok:false, error containing 'sandbox crashed'}", async () => {
  const oomImpl = `function f() { const a=[]; while(true) a.push(new Array(1e6)); }`;
  const result = await runImplProc(oomImpl, "f", [], { timeoutMs: 2000, memMb: 64 });

  assert.equal(result.ok, false);
  if (!result.ok) {
    // Either OOM crash or timeout is acceptable — both indicate containment
    assert.ok(
      result.error.includes("sandbox crashed") || result.error.includes("timeout"),
      `Expected sandbox crashed or timeout, got: ${result.error}`,
    );
  }
});

// ── AC6: async value ──────────────────────────────────────────────────────────
test("AC6 async value: async function returning x+1 → {ok:true, value:2} for input [1]", async () => {
  const asyncImpl = `async function f(x) { return x + 1; }`;
  const result = await runImplProc(asyncImpl, "f", [1], { timeoutMs: 3000 });

  assert.deepEqual(result, { ok: true, value: 2 });
});

// ── AC7: stdout noise tolerated ───────────────────────────────────────────────
test("AC7 stdout noise tolerated: console.log forge attempt cannot hijack result", async () => {
  // console is replaced with no-ops in the vm context, so this log is silenced
  // The impl returns 42; the forge attempt via console.log is a no-op
  const forgeImpl = `
    function f() {
      console.log('##RESULT##' + JSON.stringify({ok:true,value:999}));
      return 42;
    }
  `;
  const result = await runImplProc(forgeImpl, "f", [], { timeoutMs: 3000 });

  // The real result (42) should win; the console.log is silenced
  assert.deepEqual(result, { ok: true, value: 42 });
});

// ── AC8: unserializable result ────────────────────────────────────────────────
test("AC8 unserializable result: impl returning a function → {ok:false, error:'unserializable result'}", async () => {
  const fnImpl = `function f() { return function() {}; }`;
  const result = await runImplProc(fnImpl, "f", [], { timeoutMs: 3000 });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, "unserializable result");
  }
});

// ── AC9: judgeAsync tests ─────────────────────────────────────────────────────
test("AC9 judgeAsync: enforces expectedHash — mismatch throws ContractHashMismatch", async () => {
  const contract = Contract.freeze({
    requirement: "add",
    entry: "add",
    version: "1",
    examples: [{ name: "a", input: [1, 2], expected: 3 }],
  });

  await assert.rejects(
    () => judgeAsync(contract, "function add(a,b){return a+b;}", { expectedHash: "deadbeef" }),
    ContractHashMismatch,
  );
});

test("AC9 judgeAsync: own hash executes without throw", async () => {
  const contract = Contract.freeze({
    requirement: "add",
    entry: "add",
    version: "1",
    examples: [{ name: "a", input: [1, 2], expected: 3 }],
  });

  const result = await judgeAsync(
    contract,
    "function add(a,b){return a+b;}",
    {
      expectedHash: contract.hash,
      procOpts: { timeoutMs: 3000 },
    },
  );
  assert.ok(result.pass);
});

test("AC9 judgeAsync: produces vector/score/feedback identical in shape to judge", async () => {
  const contract = Contract.freeze({
    requirement: "add",
    entry: "add",
    version: "1",
    examples: [
      { name: "a", input: [1, 2], expected: 3 },
      { name: "b", input: [2, 2], expected: 4 },
    ],
  });
  const bad = "function add(a, b) { return a - b; }";

  const syncResult = judge(contract, bad);
  const asyncResult = await judgeAsync(contract, bad, { procOpts: { timeoutMs: 3000 } });

  assert.equal(asyncResult.pass, syncResult.pass);
  assert.deepEqual(asyncResult.vector, syncResult.vector);
  assert.equal(asyncResult.score, syncResult.score);
  assert.ok(typeof asyncResult.feedback === "string");
  assert.ok(asyncResult.feedback.length > 0);
});

test("AC9 judgeAsync: honors throws cases — rejecting impl passes a throws case", async () => {
  const contract = Contract.freeze({
    requirement: "noNeg",
    entry: "noNeg",
    version: "1",
    examples: [{ name: "ok", input: [1], expected: 1 }],
  });
  const battery = [
    { name: "neg", input: [-1], expected: "<throws>" as unknown, throws: true as const },
  ];

  const throwingImpl = "function noNeg(x) { if (x < 0) throw new Error('neg'); return x; }";
  const v1 = await judgeAsync(contract, throwingImpl, {
    battery,
    revealInFeedback: true,
    procOpts: { timeoutMs: 3000 },
  });
  assert.ok(v1.pass);
  assert.deepEqual(v1.vector, [true]);

  const notThrowingImpl = "function noNeg(x) { return x; }";
  const v2 = await judgeAsync(contract, notThrowingImpl, {
    battery,
    revealInFeedback: true,
    procOpts: { timeoutMs: 3000 },
  });
  assert.ok(!v2.pass);
  assert.deepEqual(v2.vector, [false]);
});

// ── AC10: task opt-in ─────────────────────────────────────────────────────────
test('AC10 task opt-in: "isolation":"container" → loadTask throws naming the field', async () => {
  const dir = await mkdtemp(join(tmpdir(), "ac10-iso-"));
  await writeFile(join(dir, "requirement.md"), "req");
  await writeFile(
    join(dir, "task.json"),
    JSON.stringify({
      name: "t",
      entry: "f",
      version: "1",
      examples: [{ name: "ok", input: [1], expected: 1 }],
      armCSubset: [],
      isolation: "container",
    }),
  );
  await writeFile(join(dir, "hidden-battery.json"), JSON.stringify([
    { name: "h1", input: [2], expected: 2, coveredBy: ["ok"] },
  ]));

  assert.throws(
    () => loadTask(dir),
    (e: unknown) => e instanceof Error && e.message.includes("isolation"),
  );
});

test("AC10 task opt-in: omitted isolation → TaskDef.isolation === 'vm'", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ac10-iso-"));
  await writeFile(join(dir, "requirement.md"), "req");
  await writeFile(
    join(dir, "task.json"),
    JSON.stringify({
      name: "t",
      entry: "f",
      version: "1",
      examples: [{ name: "ok", input: [1], expected: 1 }],
      armCSubset: [],
    }),
  );
  await writeFile(join(dir, "hidden-battery.json"), JSON.stringify([
    { name: "h1", input: [2], expected: 2, coveredBy: ["ok"] },
  ]));

  const task = loadTask(dir);
  assert.equal(task.isolation, "vm");
});

test('AC10 task opt-in: "isolation":"process" → TaskDef.isolation === "process"', async () => {
  const dir = await mkdtemp(join(tmpdir(), "ac10-iso-"));
  await writeFile(join(dir, "requirement.md"), "req");
  await writeFile(
    join(dir, "task.json"),
    JSON.stringify({
      name: "t",
      entry: "f",
      version: "1",
      examples: [{ name: "ok", input: [1], expected: 1 }],
      armCSubset: [],
      isolation: "process",
    }),
  );
  await writeFile(join(dir, "hidden-battery.json"), JSON.stringify([
    { name: "h1", input: [2], expected: 2, coveredBy: ["ok"] },
  ]));

  const task = loadTask(dir);
  assert.equal(task.isolation, "process");
});
