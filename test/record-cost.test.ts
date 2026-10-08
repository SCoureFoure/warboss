/** Dev-loop cost hook entry point — see src/hooks/record-cost.ts */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const tmpDirs: string[] = [];
after(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), "record-cost-"));
  tmpDirs.push(d);
  return d;
}

// One priceable assistant record (mirrors test/hooks.test.ts fixtures).
function assistantRecord(uuid: string): string {
  return JSON.stringify({
    type: "assistant",
    uuid,
    requestId: `req_${uuid}`,
    timestamp: "2026-06-10T00:00:00Z",
    message: {
      id: `msg_${uuid}`,
      role: "assistant",
      model: "claude-sonnet-4-6",
      usage: { input_tokens: 1000, output_tokens: 500 },
    },
  });
}

function writeTranscript(dir: string, lines: string[]): string {
  const path = join(dir, "transcript.jsonl");
  writeFileSync(path, lines.join("\n") + "\n");
  return path;
}

function hookEnv(projectDir?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (projectDir !== undefined) env["CLAUDE_PROJECT_DIR"] = projectDir;
  else delete env["CLAUDE_PROJECT_DIR"];
  return env;
}

function runHook(args: string[], stdin: string, env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ["--import", "tsx", "src/hooks/record-cost.ts", ...args], {
    input: stdin,
    cwd: REPO_ROOT,
    env,
    encoding: "utf8",
  });
}

function payload(transcriptPath: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ transcript_path: transcriptPath, session_id: "s1", ...extra });
}

function ledgerPath(projectDir: string): string {
  return join(projectDir, "runs", "dev-cost-ledger.jsonl");
}

function ledgerLines(projectDir: string): string[] {
  return readFileSync(ledgerPath(projectDir), "utf8")
    .split("\n")
    .filter((l) => l.length > 0);
}

function ledgerRows(projectDir: string): Array<Record<string, unknown>> {
  return ledgerLines(projectDir).map((l) => JSON.parse(l) as Record<string, unknown>);
}

test("record-cost: 2-message transcript writes 2 rows with uuid, kind and session id", () => {
  const dir = tmpDir();
  const transcript = writeTranscript(dir, [assistantRecord("a1"), assistantRecord("a2")]);
  const res = runHook(["--kind", "claudecode.main"], payload(transcript), hookEnv(dir));
  assert.equal(res.status, 0);

  const lines = ledgerLines(dir);
  assert.equal(lines.length, 2);
  const rows = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
  assert.equal(rows[0]!["uuid"], "a1");
  assert.equal(rows[1]!["uuid"], "a2");
  for (const r of rows) {
    assert.equal(r["kind"], "claudecode.main");
    assert.equal(r["sessionId"], "s1");
  }
});

test("record-cost: idempotent re-fire leaves the ledger at 2 lines", () => {
  const dir = tmpDir();
  const transcript = writeTranscript(dir, [assistantRecord("a1"), assistantRecord("a2")]);
  const args = ["--kind", "claudecode.main"];
  assert.equal(runHook(args, payload(transcript), hookEnv(dir)).status, 0);
  assert.equal(runHook(args, payload(transcript), hookEnv(dir)).status, 0);
  assert.equal(ledgerLines(dir).length, 2);
});

test("record-cost: growth appends only the new message", () => {
  const dir = tmpDir();
  const transcript = writeTranscript(dir, [assistantRecord("a1"), assistantRecord("a2")]);
  assert.equal(runHook(["--kind", "claudecode.main"], payload(transcript), hookEnv(dir)).status, 0);

  appendFileSync(transcript, assistantRecord("a3") + "\n");
  assert.equal(runHook(["--kind", "claudecode.main"], payload(transcript), hookEnv(dir)).status, 0);

  const lines = ledgerLines(dir);
  assert.equal(lines.length, 3);
  assert.equal((JSON.parse(lines[2]!) as Record<string, unknown>)["uuid"], "a3");
});

test("record-cost: no --kind argument defaults rows to claudecode.subagent", () => {
  const dir = tmpDir();
  const transcript = writeTranscript(dir, [assistantRecord("a1"), assistantRecord("a2")]);
  assert.equal(runHook([], payload(transcript), hookEnv(dir)).status, 0);
  const rows = ledgerRows(dir);
  assert.equal(rows.length, 2);
  for (const r of rows) assert.equal(r["kind"], "claudecode.subagent");
});

test("record-cost: --kind as the last argument with no value defaults to claudecode.subagent", () => {
  const dir = tmpDir();
  const transcript = writeTranscript(dir, [assistantRecord("a1"), assistantRecord("a2")]);
  assert.equal(runHook(["--kind"], payload(transcript), hookEnv(dir)).status, 0);
  const rows = ledgerRows(dir);
  assert.equal(rows.length, 2);
  for (const r of rows) assert.equal(r["kind"], "claudecode.subagent");
});

test("record-cost: leading BOM on stdin is tolerated", () => {
  const dir = tmpDir();
  const transcript = writeTranscript(dir, [assistantRecord("a1"), assistantRecord("a2")]);
  const res = runHook(["--kind", "claudecode.main"], "﻿" + payload(transcript), hookEnv(dir));
  assert.equal(res.status, 0);
  const rows = ledgerRows(dir);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!["uuid"], "a1");
  assert.equal(rows[1]!["uuid"], "a2");
});

test("record-cost: garbled stdin creates no runs directory", () => {
  const dir = tmpDir();
  const res = runHook([], "not json", hookEnv(dir));
  assert.equal(res.status, 0);
  assert.equal(existsSync(join(dir, "runs")), false);
});

test("record-cost: empty stdin creates no runs directory", () => {
  const dir = tmpDir();
  const res = runHook([], "", hookEnv(dir));
  assert.equal(res.status, 0);
  assert.equal(existsSync(join(dir, "runs")), false);
});

test("record-cost: transcript_path pointing at a missing file creates no runs directory", () => {
  const dir = tmpDir();
  const res = runHook([], payload(join(dir, "does-not-exist.jsonl")), hookEnv(dir));
  assert.equal(res.status, 0);
  assert.equal(existsSync(join(dir, "runs")), false);
});

test("record-cost: payload without transcript_path creates no runs directory", () => {
  const dir = tmpDir();
  writeTranscript(dir, [assistantRecord("a1"), assistantRecord("a2")]);
  const res = runHook([], JSON.stringify({ session_id: "s1" }), hookEnv(dir));
  assert.equal(res.status, 0);
  assert.equal(existsSync(join(dir, "runs")), false);
});

test("record-cost: transcript with zero priceable records creates no runs directory", () => {
  const dir = tmpDir();
  const transcript = writeTranscript(dir, [
    JSON.stringify({ type: "user", uuid: "u1", message: { role: "user", content: "hi" } }),
  ]);
  const res = runHook([], payload(transcript), hookEnv(dir));
  assert.equal(res.status, 0);
  assert.equal(existsSync(join(dir, "runs")), false);
});

test("record-cost: hand-damaged ledger line is tolerated and only the new message is appended", () => {
  const dir = tmpDir();
  mkdirSync(join(dir, "runs"), { recursive: true });
  writeFileSync(ledgerPath(dir), '{"uuid":\n{"uuid":"a1"}\n');
  const transcript = writeTranscript(dir, [assistantRecord("a1"), assistantRecord("a2")]);

  const res = runHook([], payload(transcript), hookEnv(dir));
  assert.equal(res.status, 0);

  const lines = ledgerLines(dir);
  assert.equal(lines.length, 3);
  assert.equal((JSON.parse(lines[2]!) as Record<string, unknown>)["uuid"], "a2");
});

test("record-cost: project dir falls back to payload cwd when CLAUDE_PROJECT_DIR is unset", () => {
  const dir = tmpDir();
  const transcript = writeTranscript(dir, [assistantRecord("a1"), assistantRecord("a2")]);
  const res = runHook([], payload(transcript, { cwd: dir }), hookEnv(undefined));
  assert.equal(res.status, 0);
  assert.equal(ledgerLines(dir).length, 2);
});

test("record-cost: CLAUDE_PROJECT_DIR wins over payload cwd", () => {
  const dirA = tmpDir();
  const dirB = tmpDir();
  const transcript = writeTranscript(dirA, [assistantRecord("a1"), assistantRecord("a2")]);
  const res = runHook([], payload(transcript, { cwd: dirB }), hookEnv(dirA));
  assert.equal(res.status, 0);
  assert.equal(existsSync(ledgerPath(dirA)), true);
  assert.equal(existsSync(join(dirB, "runs")), false);
});
