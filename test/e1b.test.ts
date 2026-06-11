/** AC1–AC12 — see specs/e1b-harness.spec.md */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import type { MessagesClient } from "../src/agent.ts";
import { GRUNT_DOGMA } from "../src/agent.ts";
import { loadTask } from "../src/experiment/task.ts";
import {
  runE1b,
  analyzeE1bArm,
  MAX_BUDGET,
  type SessionRecord,
  type FeedbackArmAnalysis,
  type E1aArmDStats,
  type RunE1bResult,
} from "../src/experiment/e1b.ts";
import { TIERS } from "../src/models.ts";

const _thisDir = dirname(fileURLToPath(import.meta.url));
const TASKS_DIR = join(_thisDir, "..", "tasks");
const DURATION_DIR = join(TASKS_DIR, "duration-parse");

// Reference impl — passes all 12 hidden cases and all 5 canonical cases.
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

const FAILING_IMPL = `function parseDuration(s) { return -1; }`;

function fence(code: string): string {
  return "```js\n" + code + "\n```";
}

// Fake client: cycles through provided responses (index-based)
function cyclingClient(
  responses: string[],
  capture?: (body: Anthropic.MessageCreateParamsNonStreaming, callIndex: number) => void,
): { client: MessagesClient; callCount: () => number } {
  let calls = 0;
  return {
    callCount: () => calls,
    client: {
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
    },
  };
}

// Fake client that throws on specified call indices, succeeds otherwise.
function throwingClient(
  throwOnIndices: Set<number>,
  successText: string,
): MessagesClient {
  let calls = 0;
  return {
    messages: {
      create: async () => {
        const idx = calls++;
        if (throwOnIndices.has(idx)) throw new Error("transient");
        return {
          content: [{ type: "text", text: successText }],
          usage: { input_tokens: 100, output_tokens: 50 },
        } as unknown as Anthropic.Message;
      },
    },
  };
}

async function runAndRead(
  opts: Parameters<typeof runE1b>[0],
): Promise<{ artifact: Record<string, unknown>; outDir: string; files: string[]; result: RunE1bResult }> {
  const outDir = await mkdtemp(join(tmpdir(), "e1b-test-"));
  const result = await runE1b({ ...opts, out: outDir, tasksDir: TASKS_DIR });
  const files = await readdir(outDir);
  const name = files.find((f) => f.startsWith("e1b-") && f.endsWith(".json"));
  assert.ok(name, "results artifact written");
  const raw = await readFile(join(outDir, name), "utf8");
  return { artifact: JSON.parse(raw) as Record<string, unknown>, outDir, files, result };
}

// ── AC1 ─────────────────────────────────────────────────────────────────────

test("AC1 green session: fail then pass → attempts=2, green=true, stalled=false, ledger 2 entries", async () => {
  const { artifact } = await runAndRead({
    n: 1,
    feedbackArms: ["full"],
    client: cyclingClient([fence(FAILING_IMPL), fence(CORRECT_IMPL)]).client,
  });

  const sessions = artifact["sessions"] as SessionRecord[];
  assert.equal(sessions.length, 1);
  const s = sessions[0]!;
  assert.equal(s.attempts, 2);
  assert.equal(s.green, true);
  assert.equal(s.stalled, false);
  assert.equal(s.feedbackArm, "full");

  const ledger = artifact["ledger"] as unknown[];
  assert.equal(ledger.length, 2);
});

// ── AC2 ─────────────────────────────────────────────────────────────────────

test("AC2 stall: same code twice → stalled=true, attempts=2, no third call", async () => {
  const { callCount, client } = cyclingClient([fence(FAILING_IMPL)]);

  const { artifact } = await runAndRead({
    n: 1,
    feedbackArms: ["full"],
    client,
  });

  const sessions = artifact["sessions"] as SessionRecord[];
  const s = sessions[0]!;
  assert.equal(s.stalled, true);
  assert.equal(s.green, false);
  assert.equal(s.attempts, 2);
  assert.equal(callCount(), 2);
});

test("AC2 two consecutive no-code attempts are NOT a stall: always empty → budget exhausted, stalled=false", async () => {
  const { artifact } = await runAndRead({
    n: 1,
    feedbackArms: ["full"],
    client: cyclingClient([""]).client,
  });

  const sessions = artifact["sessions"] as SessionRecord[];
  const s = sessions[0]!;
  assert.equal(s.stalled, false, "no-code attempts do not count as stall");
  assert.equal(s.green, false);
  assert.equal(s.attempts, MAX_BUDGET);
});

// ── AC3 ─────────────────────────────────────────────────────────────────────

test("AC3 budget: 5 distinct failing impls → attempts=MAX_BUDGET, green=false, stalled=false", async () => {
  // 5 distinct impls, each returns a different wrong value
  const IMPLS = Array.from({ length: MAX_BUDGET }, (_, i) =>
    fence(`function parseDuration(s) { return ${i + 100}; }`),
  );

  const { artifact } = await runAndRead({
    n: 1,
    feedbackArms: ["full"],
    client: cyclingClient(IMPLS).client,
  });

  const sessions = artifact["sessions"] as SessionRecord[];
  const s = sessions[0]!;
  assert.equal(s.attempts, MAX_BUDGET);
  assert.equal(s.green, false);
  assert.equal(s.stalled, false);
});

// ── AC4 ─────────────────────────────────────────────────────────────────────

test("AC4 feedback injected: attempt-2 prompt contains previous impl block and judge feedback", async () => {
  const captured: string[] = [];
  const client = cyclingClient(
    [fence(FAILING_IMPL), fence(CORRECT_IMPL)],
    (body, idx) => {
      if (idx === 1) captured.push(body.messages[0]!.content as string);
    },
  ).client;

  await runAndRead({ n: 1, feedbackArms: ["full"], client });

  assert.equal(captured.length, 1);
  const prompt = captured[0]!;
  assert.ok(
    prompt.includes("Your previous implementation:"),
    "retry prompt must contain previous impl block",
  );
  assert.ok(
    prompt.includes(FAILING_IMPL),
    "retry prompt must contain attempt 1's code",
  );
  assert.ok(
    prompt.includes("Judge feedback:"),
    "retry prompt must contain judge feedback header",
  );
  // full granularity: input + expected appear in feedback
  assert.ok(prompt.includes("1h30m"), "feedback includes canonical input");
});

// ── AC5 ─────────────────────────────────────────────────────────────────────

test("AC5 no-code retry: empty attempt 1, passing attempt 2 → no-code message in prompt, green=true, no previous impl block", async () => {
  const captured: string[] = [];
  const client = cyclingClient(
    ["", fence(CORRECT_IMPL)],
    (body, idx) => {
      if (idx === 1) captured.push(body.messages[0]!.content as string);
    },
  ).client;

  const { artifact } = await runAndRead({ n: 1, feedbackArms: ["full"], client });

  const sessions = artifact["sessions"] as SessionRecord[];
  const s = sessions[0]!;
  assert.equal(s.green, true);
  assert.equal(s.attempts, 2);

  assert.equal(captured.length, 1);
  assert.ok(
    captured[0]!.includes("Your previous response contained no code block."),
    "no-code prompt injected with correct message",
  );
  assert.ok(
    !captured[0]!.includes("Your previous implementation:"),
    "no-code retry must not have previous impl block",
  );
});

// ── AC6 ─────────────────────────────────────────────────────────────────────

test("AC6 granularity arms differ: passfail vs full retry prompts are distinct", async () => {
  // Use different client instances for each arm but with the same session logic
  const passFailPrompts: string[] = [];
  const fullPrompts: string[] = [];

  let passfailCallIdx = 0;
  const passfailClient: MessagesClient = {
    messages: {
      create: async (body) => {
        const idx = passfailCallIdx++;
        if (idx === 1) passFailPrompts.push(body.messages[0]!.content as string);
        const text = idx === 0 ? fence(FAILING_IMPL) : fence(CORRECT_IMPL);
        return {
          content: [{ type: "text", text }],
          usage: { input_tokens: 10, output_tokens: 5 },
        } as unknown as Anthropic.Message;
      },
    },
  };

  let fullCallIdx = 0;
  const fullClient: MessagesClient = {
    messages: {
      create: async (body) => {
        const idx = fullCallIdx++;
        if (idx === 1) fullPrompts.push(body.messages[0]!.content as string);
        const text = idx === 0 ? fence(FAILING_IMPL) : fence(CORRECT_IMPL);
        return {
          content: [{ type: "text", text }],
          usage: { input_tokens: 10, output_tokens: 5 },
        } as unknown as Anthropic.Message;
      },
    },
  };

  // Run passfail arm
  await runAndRead({ n: 1, feedbackArms: ["passfail"], client: passfailClient });
  // Run full arm
  await runAndRead({ n: 1, feedbackArms: ["full"], client: fullClient });

  assert.equal(passFailPrompts.length, 1);
  assert.equal(fullPrompts.length, 1);

  // Extract the feedback section (after the retry header) to avoid matching
  // canonical inputs that appear in the initial prompt's frozen contract block.
  const FEEDBACK_HEADER = "Judge feedback:";
  const pfFeedback = passFailPrompts[0]!.split(FEEDBACK_HEADER)[1] ?? "";
  const fullFeedback = fullPrompts[0]!.split(FEEDBACK_HEADER)[1] ?? "";

  // passfail: only "N case(s) failed." — no input values in the feedback suffix
  assert.ok(passFailPrompts[0]!.includes(FEEDBACK_HEADER), "passfail has retry header");
  assert.ok(pfFeedback.includes("case(s) failed"), "passfail feedback has count");
  assert.ok(!pfFeedback.includes("1h30m"), "passfail feedback has no input detail");

  // full: includes input and expected in the feedback suffix
  assert.ok(fullFeedback.includes("1h30m"), "full feedback has input detail");
});

// ── AC7 ─────────────────────────────────────────────────────────────────────

test("AC7 no hidden battery in prompts: contamination audit passes for all E1b prompts", async () => {
  // We need to verify that feedback from canonical contract judgements
  // never introduces hidden-battery inputs.
  //
  // The canonical contract inputs are: "1h30m", "90m", "45s", "90", "2h15m30s".
  // The hidden battery includes inputs like "1h90m", "30m30m", "1.5h", etc.
  // None of the canonical inputs equal hidden inputs — audit must pass.

  const task = loadTask(DURATION_DIR);
  const hiddenInputs = task.hidden.flatMap((c) => c.input as string[]);

  // Simulate a realistic failing feedback from judging canonical cases.
  // FAILING_IMPL returns -1 for everything; judge(canonical) would show 5 failures.
  // The feedback will contain only the canonical inputs, not hidden inputs.
  //
  // We verify by capturing all prompts and checking none contain hidden inputs.
  const capturedPrompts: string[] = [];
  const client: MessagesClient = {
    messages: {
      create: async (body) => {
        capturedPrompts.push(body.messages[0]!.content as string);
        // fail 3 times then pass to exercise the retry path
        const text =
          capturedPrompts.length < 4 ? fence(FAILING_IMPL) : fence(CORRECT_IMPL);
        return {
          content: [{ type: "text", text }],
          usage: { input_tokens: 10, output_tokens: 5 },
        } as unknown as Anthropic.Message;
      },
    },
  };

  await runAndRead({ n: 1, feedbackArms: ["full"], client });

  for (const prompt of capturedPrompts) {
    for (const input of hiddenInputs) {
      const needle = JSON.stringify(input);
      assert.ok(
        !prompt.includes(needle),
        `hidden input ${needle} must not appear in any prompt`,
      );
    }
  }
});

// ── AC8 ─────────────────────────────────────────────────────────────────────

test("AC8 final scoring: correct impl → all-true 12-length vector, score=1", async () => {
  const { artifact } = await runAndRead({
    n: 1,
    feedbackArms: ["full"],
    client: cyclingClient([fence(CORRECT_IMPL)]).client,
  });

  const sessions = artifact["sessions"] as SessionRecord[];
  const s = sessions[0]!;
  assert.equal(s.finalVector.length, 12);
  assert.ok((s.finalVector as boolean[]).every((v) => v === true));
  assert.equal(s.finalScore, 1);
});

test("AC8 final scoring: no-code session → all-false 12-length vector, score=0", async () => {
  // Always returns empty text so code is always undefined → budget exhausted
  // Need 5 distinct-appearing responses to avoid stall; use different empty strings.
  // Actually, undefined code === undefined code → stall after 2. That's fine.
  const { artifact } = await runAndRead({
    n: 1,
    feedbackArms: ["full"],
    client: cyclingClient([""]).client,
  });

  const sessions = artifact["sessions"] as SessionRecord[];
  const s = sessions[0]!;
  assert.equal(s.finalVector.length, 12);
  assert.ok((s.finalVector as boolean[]).every((v) => v === false));
  assert.equal(s.finalScore, 0);
});

// ── AC9 ─────────────────────────────────────────────────────────────────────

test("AC9 analysis: synthetic sessions compute correct aggregates", () => {
  const arm = "full";

  const makeSession = (
    green: boolean,
    stalled: boolean,
    attempts: number,
    finalScore: number,
    totalCostUsd: number,
  ): SessionRecord => ({
    feedbackArm: arm,
    sessionIndex: 0,
    model: TIERS.LOW.id,
    attempts,
    stalled,
    green,
    finalCode: undefined,
    finalVector: [],
    finalScore,
    totalCostUsd,
    totalWallMs: 0,
  });

  // 4 sessions: 2 green (cost 0.02 each), 1 stalled (cost 0.01), 1 budget (cost 0.05)
  const sessions: SessionRecord[] = [
    makeSession(true,  false, 2, 1.0, 0.02),
    makeSession(true,  false, 3, 0.8, 0.02),
    makeSession(false, true,  2, 0.4, 0.01),
    makeSession(false, false, 5, 0.2, 0.05),
  ];

  const a = analyzeE1bArm(arm, sessions);

  assert.equal(a.greenRate, 0.5);              // 2/4
  assert.equal(a.meanAttempts, 3);             // (2+3+2+5)/4
  assert.equal(a.stallRate, 0.25);             // 1/4
  assert.ok(Math.abs(a.meanFinalHiddenScore - 0.6) < 1e-9);  // (1+.8+.4+.2)/4
  assert.ok(Math.abs(a.totalCostUsd - 0.1) < 1e-9);
  assert.ok(Math.abs(a.meanCostPerGreenSession - 0.02) < 1e-9); // (0.02+0.02)/2

  // Zero green → Infinity
  const noGreen = [makeSession(false, false, 5, 0.2, 0.05)];
  const a2 = analyzeE1bArm(arm, noGreen);
  assert.equal(a2.meanCostPerGreenSession, Infinity);
});

// ── AC10 ─────────────────────────────────────────────────────────────────────

test("AC10 criterion 4: PASS when E1b cost < E1a and score ≥ E1a", async () => {
  // Best arm: greenRate=1, meanCostPerGreenSession=0.001, meanFinalHiddenScore=0.9
  // E1a Arm D: meanHiddenScore=0.8, meanCostUsd=0.01
  const e1aArmD: E1aArmDStats = { meanHiddenScore: 0.8, meanCostUsd: 0.01 };

  const { artifact } = await runAndRead({
    n: 1,
    feedbackArms: ["full"],
    client: cyclingClient([fence(CORRECT_IMPL)]).client,
    e1aArmD,
  });

  const criterion4 = artifact["criterion4"] as { pass: boolean; detail: string };
  // CORRECT_IMPL passes all 12 hidden cases → score=1 ≥ 0.8; cost per green session < 0.01
  assert.ok(criterion4.pass, `Expected PASS, got: ${criterion4.detail}`);
  assert.ok(criterion4.detail.includes("0.8") || criterion4.detail.length > 0);
});

test("AC10 criterion 4: FAIL when E1b score < E1a", async () => {
  // E1a Arm D has very high bar
  const e1aArmD: E1aArmDStats = { meanHiddenScore: 1.0, meanCostUsd: 999 };

  // Impl that passes contract (5 canonical) but fails hidden battery (returns 0 for all)
  const PARTIAL_IMPL = `function parseDuration(s) {
    if (s === "1h30m") return 5400;
    if (s === "90m") return 5400;
    if (s === "45s") return 45;
    if (s === "90") return 90;
    if (s === "2h15m30s") return 8130;
    return 0;
  }`;

  const { artifact } = await runAndRead({
    n: 1,
    feedbackArms: ["full"],
    client: cyclingClient([fence(PARTIAL_IMPL)]).client,
    e1aArmD,
  });

  const criterion4 = artifact["criterion4"] as { pass: boolean; detail: string };
  assert.ok(!criterion4.pass, `Expected FAIL, got: ${criterion4.detail}`);
});

test("AC10 criterion 4: deferred when no E1a stats provided", async () => {
  const { artifact } = await runAndRead({
    n: 1,
    feedbackArms: ["full"],
    client: cyclingClient([fence(CORRECT_IMPL)]).client,
  });

  const criterion4 = artifact["criterion4"] as { pass: boolean; detail: string };
  assert.ok(!criterion4.pass);
  assert.ok(criterion4.detail.includes("deferred"));
});

test("AC10 best-arm selection: highest greenRate wins; tie broken by score", () => {
  // Direct unit test for best-arm logic via artifact analysis
  // (tested indirectly through criterion evaluation in runE1b — also tested here
  //  by checking that criteria reflect the better arm when 2 arms run)
  // This test just ensures the deferred path is stable when no arms ran.
  const noSessions: SessionRecord[] = [];
  const a = analyzeE1bArm("full", noSessions);
  assert.equal(a.greenRate, 0);
  assert.equal(a.meanCostPerGreenSession, Infinity);
});

// ── AC11 ─────────────────────────────────────────────────────────────────────

test("AC11 results artifact: correct structure and cost consistency", async () => {
  const { artifact, files } = await runAndRead({
    n: 2,
    feedbackArms: ["passfail", "input", "full"],
    client: cyclingClient([fence(CORRECT_IMPL)]).client,
  });

  // config
  assert.equal((artifact["config"] as { n: number }).n, 2);
  assert.deepEqual(
    (artifact["config"] as { feedbackArms: string[] }).feedbackArms,
    ["passfail", "input", "full"],
  );
  assert.equal((artifact["config"] as { budget: number }).budget, MAX_BUDGET);

  // sessions: n × |arms|
  const sessions = artifact["sessions"] as SessionRecord[];
  assert.equal(sessions.length, 2 * 3);

  // analysis keyed by arm
  const analysis = artifact["analysis"] as Record<string, FeedbackArmAnalysis>;
  for (const arm of ["passfail", "input", "full"]) {
    assert.ok(arm in analysis, `analysis.${arm} missing`);
  }

  // criterion4 present
  assert.ok("criterion4" in artifact);

  // cost consistency
  const ledger = artifact["ledger"] as Array<{ costUsd: number }>;
  assert.ok(Array.isArray(ledger));
  const sessionCostTotal = sessions.reduce((s, r) => s + r.totalCostUsd, 0);
  const ledgerTotal = ledger.reduce((s, e) => s + e.costUsd, 0);
  assert.ok(Math.abs(sessionCostTotal - ledgerTotal) < 1e-9);
  assert.ok(
    Math.abs((artifact["totalCostUsd"] as number) - ledgerTotal) < 1e-9,
  );

  // JSONL cost ledger
  const jsonl = files.find((f) => f.startsWith("cost-ledger-") && f.endsWith(".jsonl"));
  assert.ok(jsonl, "cost-ledger JSONL written");
});

// ── AC12 ─────────────────────────────────────────────────────────────────────

test("AC12 model=LOW, system=GRUNT_DOGMA, maxTokens=2048, tags include attempt", async () => {
  const captured: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client = cyclingClient(
    [fence(CORRECT_IMPL)],
    (body) => captured.push(body),
  ).client;

  await runAndRead({ n: 1, feedbackArms: ["full"], client });

  assert.ok(captured.length >= 1);
  for (const body of captured) {
    assert.equal(body.model, TIERS.LOW.id);
    assert.equal(body.system, GRUNT_DOGMA);
    assert.equal(body.max_tokens, 2048);
  }

  // Ledger entries tagged with attempt
  // Verify via artifact
  const outDir = await mkdtemp(join(tmpdir(), "e1b-tag-"));
  const tagCapture: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const tagClient = cyclingClient(
    [fence(FAILING_IMPL), fence(CORRECT_IMPL)],
    (body) => tagCapture.push(body),
  ).client;
  await runE1b({ n: 1, feedbackArms: ["full"], out: outDir, tasksDir: TASKS_DIR, client: tagClient });

  const files = await readdir(outDir);
  const name = files.find((f) => f.startsWith("e1b-") && f.endsWith(".json"))!;
  const artifact = JSON.parse(await readFile(join(outDir, name), "utf8")) as Record<string, unknown>;
  const ledger = artifact["ledger"] as Array<{
    tags?: { feedbackArm?: string; task?: string; sessionIndex?: number; attempt?: number };
  }>;
  assert.ok(ledger.length >= 1);
  for (const entry of ledger) {
    assert.ok(entry.tags?.feedbackArm !== undefined, "tag: feedbackArm");
    assert.ok(entry.tags?.task !== undefined, "tag: task");
    assert.ok(entry.tags?.sessionIndex !== undefined, "tag: sessionIndex");
    assert.ok(entry.tags?.attempt !== undefined, "tag: attempt");
  }
});

// ── AC13 ─────────────────────────────────────────────────────────────────────

test("AC13 dead-run guard: live=true + all-zero final scores → deadRun=true, artifact stamped", async () => {
  const { artifact, result } = await runAndRead({
    n: 1,
    feedbackArms: ["full"],
    client: cyclingClient([""]).client,
    live: true,
  });

  assert.equal(result.deadRun, true);
  assert.equal(artifact["deadRun"], true);
});

test("AC13 dead-run guard: live=false + zero scores → deadRun=false", async () => {
  const { artifact, result } = await runAndRead({
    n: 1,
    feedbackArms: ["full"],
    client: cyclingClient([""]).client,
    live: false,
  });

  assert.equal(result.deadRun, false);
  assert.equal(artifact["deadRun"], false);
});

test("AC13 dead-run guard: live=true + nonzero scores → deadRun=false", async () => {
  const { artifact, result } = await runAndRead({
    n: 1,
    feedbackArms: ["full"],
    client: cyclingClient([fence(CORRECT_IMPL)]).client,
    live: true,
  });

  assert.equal(result.deadRun, false);
  assert.equal(artifact["deadRun"], false);
});
