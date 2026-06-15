/** AC1–AC4 — see specs/kickback-pipeline.spec.md rev 1. Pure/offline. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  renderDecisionBlock,
  buildAnswerQueue,
  loadOwnerAnswers,
  type OwnerAnswer,
  type AnswerQueue,
} from "../src/kickback.ts";
import { renderOwnerDecisions } from "../src/experiment/e4.ts";
import type { GodRuling } from "../src/experiment/e4.ts";

// ── AC1: renderDecisionBlock format + E4 parity ───────────────────────────────

test("AC1 renderDecisionBlock — two decisions produce header + two bullets in order, verbatim", () => {
  const result = renderDecisionBlock(["A.", "B."]);

  // Three pinned header lines
  assert.ok(
    result.includes("The owner has DECIDED the following behaviors. Treat each as fixed intent —"),
    `header line 1 present: ${result}`,
  );
  assert.ok(
    result.includes("they are not open choices; author examples (choosing your own representative"),
    `header line 2 present: ${result}`,
  );
  assert.ok(
    result.includes("inputs) that pin exactly these:"),
    `header line 3 present: ${result}`,
  );

  // Two bullets, verbatim, in order
  const lines = result.split("\n");
  const bullets = lines.filter((l) => l.startsWith("- "));
  assert.equal(bullets.length, 2, "exactly two bullets");
  assert.equal(bullets[0], "- A.", "first bullet is '- A.'");
  assert.equal(bullets[1], "- B.", "second bullet is '- B.'");
});

test("AC1 renderDecisionBlock([]) — header lines only, no bullet", () => {
  const result = renderDecisionBlock([]);

  // Header must be present
  assert.ok(result.includes("The owner has DECIDED"), "header present");
  assert.ok(result.includes("inputs) that pin exactly these:"), "third header line present");

  // No bullet lines
  const bullets = result.split("\n").filter((l) => l.startsWith("- "));
  assert.equal(bullets.length, 0, "no bullets for empty decision list");
});

test("AC1 E4 parity — renderDecisionBlock output equals renderOwnerDecisions for same three decisions", () => {
  // Three rulings whose decision strings match what E4 tests use
  const rulings: GodRuling[] = [
    {
      input: ["120"],
      expected: "<throws>",
      throws: true,
      decision: "A bare integer with no time unit is invalid input and must throw.",
    },
    {
      input: [" 1h 30m "],
      expected: 5400,
      decision: "A duration string with leading or trailing whitespace must be accepted.",
    },
    {
      input: ["1.5h"],
      expected: 5400,
      decision: "A fractional quantity before a unit is accepted and scaled by that unit.",
    },
  ];

  const e4Result = renderOwnerDecisions(rulings);
  const kickbackResult = renderDecisionBlock(rulings.map((r) => r.decision));

  assert.equal(
    kickbackResult,
    e4Result,
    "renderDecisionBlock and renderOwnerDecisions produce byte-identical output for same decisions",
  );
});

// ── AC2: buildAnswerQueue stubbing + id parse ────────────────────────────────

test("AC2 buildAnswerQueue — three escalations produce three OwnerAnswers with blank decisions, parsed ids", () => {
  const escalations = [
    "bare-number: fiat — … → throws",
    "no colon here",
    "Bad Id: intent-undecided — …",
  ];

  const queue = buildAnswerQueue({
    intent: "test intent",
    context: "test context",
    artifactPath: "runs/decompose-20260614T120000Z.json",
    escalations,
  });

  // intent, context, artifact echoed
  assert.equal(queue.intent, "test intent");
  assert.equal(queue.context, "test context");
  assert.equal(queue.artifact, "runs/decompose-20260614T120000Z.json");

  // Three answers, in escalation order
  assert.equal(queue.answers.length, 3, "three answers");

  // Answer 0: "bare-number" matches id grammar → requirementId = "bare-number"
  const a0 = queue.answers[0]!;
  assert.equal(a0.escalation, escalations[0], "answer 0 escalation verbatim");
  assert.equal(a0.decision, "", "answer 0 decision is blank stub");
  assert.equal(a0.requirementId, "bare-number", "answer 0 requirementId = 'bare-number'");

  // Answer 1: "no colon here" → no ": " separator → requirementId = ""
  const a1 = queue.answers[1]!;
  assert.equal(a1.escalation, escalations[1], "answer 1 escalation verbatim");
  assert.equal(a1.decision, "", "answer 1 decision is blank stub");
  assert.equal(a1.requirementId, "", "answer 1 requirementId = '' (no colon)");

  // Answer 2: "Bad Id" fails id grammar (uppercase) → requirementId = ""
  const a2 = queue.answers[2]!;
  assert.equal(a2.escalation, escalations[2], "answer 2 escalation verbatim");
  assert.equal(a2.decision, "", "answer 2 decision is blank stub");
  assert.equal(a2.requirementId, "", "answer 2 requirementId = '' (Bad Id fails grammar)");
});

test("AC2 buildAnswerQueue — null context echoed as null", () => {
  const queue = buildAnswerQueue({
    intent: "I",
    context: null,
    artifactPath: "runs/decompose-X.json",
    escalations: ["req-id: fiat — behavior"],
  });
  assert.equal(queue.context, null, "null context preserved");
  assert.equal(queue.answers[0]!.requirementId, "req-id", "valid id grammar parsed");
});

test("AC2 buildAnswerQueue — id grammar edge cases", () => {
  // Valid: starts with lowercase letter, contains lowercase letters + digits + hyphens
  const valid = buildAnswerQueue({
    intent: "I",
    context: null,
    artifactPath: "runs/x.json",
    escalations: ["abc123-xyz: fiat — …"],
  });
  assert.equal(valid.answers[0]!.requirementId, "abc123-xyz", "valid id: abc123-xyz");

  // Invalid: starts with digit
  const startsDigit = buildAnswerQueue({
    intent: "I",
    context: null,
    artifactPath: "runs/x.json",
    escalations: ["1abc: fiat — …"],
  });
  assert.equal(startsDigit.answers[0]!.requirementId, "", "id starting with digit → ''");

  // Invalid: contains uppercase
  const hasUpper = buildAnswerQueue({
    intent: "I",
    context: null,
    artifactPath: "runs/x.json",
    escalations: ["AbcDef: fiat — …"],
  });
  assert.equal(hasUpper.answers[0]!.requirementId, "", "id with uppercase → ''");

  // Invalid: empty prefix (leading ": ")
  const emptyPrefix = buildAnswerQueue({
    intent: "I",
    context: null,
    artifactPath: "runs/x.json",
    escalations: [": fiat — …"],
  });
  assert.equal(emptyPrefix.answers[0]!.requirementId, "", "empty prefix → ''");
});

// ── AC3: loadOwnerAnswers happy path ─────────────────────────────────────────

test("AC3 loadOwnerAnswers — valid filled queue returns parsed AnswerQueue verbatim", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kickback-ac3-"));
  const path = join(dir, "answers-needed.json");

  const queueData: AnswerQueue = {
    intent: "Parse a duration string",
    context: "Some context",
    artifact: "runs/decompose-20260614T120000Z.json",
    answers: [
      {
        escalation: "parse-duration: fiat — bare integer throws",
        requirementId: "parse-duration",
        decision: "A bare integer with no time unit is invalid and must throw.",
      },
      {
        escalation: "parse-duration: intent-undecided — fractional hours",
        requirementId: "parse-duration",
        decision: "A fractional quantity before a unit is accepted and scaled.",
      },
    ],
  };

  await writeFile(path, JSON.stringify(queueData, null, 2));

  const result = await loadOwnerAnswers(path);

  // Returns verbatim
  assert.equal(result.intent, queueData.intent, "intent preserved");
  assert.equal(result.context, queueData.context, "context preserved");
  assert.equal(result.artifact, queueData.artifact, "artifact preserved");
  assert.equal(result.answers.length, 2, "two answers preserved");
  assert.equal(result.answers[0]!.escalation, queueData.answers[0]!.escalation);
  assert.equal(result.answers[0]!.requirementId, queueData.answers[0]!.requirementId);
  assert.equal(result.answers[0]!.decision, queueData.answers[0]!.decision);
  assert.equal(result.answers[1]!.escalation, queueData.answers[1]!.escalation);
  assert.equal(result.answers[1]!.decision, queueData.answers[1]!.decision);
});

test("AC3 loadOwnerAnswers — null context preserved", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kickback-ac3b-"));
  const path = join(dir, "answers-needed.json");

  const queueData = {
    intent: "Parse durations",
    context: null,
    artifact: "runs/decompose-X.json",
    answers: [
      {
        escalation: "req: fiat — …",
        requirementId: "req",
        decision: "Some decision prose here.",
      },
    ],
  };

  await writeFile(path, JSON.stringify(queueData));
  const result = await loadOwnerAnswers(path);
  assert.equal(result.context, null, "null context preserved verbatim");
});

// ── AC4: loadOwnerAnswers guards ─────────────────────────────────────────────

test("AC4a loadOwnerAnswers — unreadable path throws descriptively", async () => {
  await assert.rejects(
    loadOwnerAnswers("/no/such/path/answers.json"),
    (err: Error) => {
      assert.ok(
        err.message.includes("cannot read") || err.message.includes("unreadable"),
        `error describes read failure: ${err.message}`,
      );
      return true;
    },
  );
});

test("AC4b loadOwnerAnswers — invalid JSON throws descriptively", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kickback-ac4b-"));
  const path = join(dir, "answers-needed.json");
  await writeFile(path, "not valid { json");

  await assert.rejects(
    loadOwnerAnswers(path),
    (err: Error) => {
      assert.ok(
        err.message.toLowerCase().includes("invalid json") || err.message.includes("JSON"),
        `error names invalid JSON: ${err.message}`,
      );
      return true;
    },
  );
});

test("AC4c loadOwnerAnswers — answers missing → throws", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kickback-ac4c-missing-"));
  const path = join(dir, "answers-needed.json");
  await writeFile(path, JSON.stringify({ intent: "I", context: null, artifact: "x.json" }));

  await assert.rejects(
    loadOwnerAnswers(path),
    /answers/i,
  );
});

test("AC4c loadOwnerAnswers — answers not array → throws", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kickback-ac4c-notarray-"));
  const path = join(dir, "answers-needed.json");
  await writeFile(path, JSON.stringify({ intent: "I", context: null, artifact: "x.json", answers: "not an array" }));

  await assert.rejects(
    loadOwnerAnswers(path),
    /answers/i,
  );
});

test("AC4c loadOwnerAnswers — answers empty array → throws", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kickback-ac4c-empty-"));
  const path = join(dir, "answers-needed.json");
  await writeFile(path, JSON.stringify({ intent: "I", context: null, artifact: "x.json", answers: [] }));

  await assert.rejects(
    loadOwnerAnswers(path),
    /empty|answers/i,
  );
});

test("AC4d loadOwnerAnswers — blank decision '' → throws, names offending escalation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kickback-ac4d-blank-"));
  const path = join(dir, "answers-needed.json");

  const offendingEscalation = "parse-duration: fiat — blank decision here";
  await writeFile(
    path,
    JSON.stringify({
      intent: "I",
      context: null,
      artifact: "x.json",
      answers: [
        {
          escalation: offendingEscalation,
          requirementId: "parse-duration",
          decision: "",
        },
      ],
    }),
  );

  await assert.rejects(
    loadOwnerAnswers(path),
    (err: Error) => {
      assert.ok(
        err.message.includes(offendingEscalation),
        `error names the offending escalation: ${err.message}`,
      );
      return true;
    },
  );
});

test("AC4e loadOwnerAnswers — whitespace-only decision → throws, names offending escalation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kickback-ac4e-whitespace-"));
  const path = join(dir, "answers-needed.json");

  const offendingEscalation = "format-duration: intent-undecided — whitespace only";
  await writeFile(
    path,
    JSON.stringify({
      intent: "I",
      context: null,
      artifact: "x.json",
      answers: [
        {
          escalation: offendingEscalation,
          requirementId: "format-duration",
          decision: "   ",
        },
      ],
    }),
  );

  await assert.rejects(
    loadOwnerAnswers(path),
    (err: Error) => {
      assert.ok(
        err.message.includes(offendingEscalation),
        `error names the offending escalation: ${err.message}`,
      );
      return true;
    },
  );
});

test("AC4f loadOwnerAnswers — duplicate escalation string → throws", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kickback-ac4f-dup-"));
  const path = join(dir, "answers-needed.json");

  const dupEscalation = "parse-duration: fiat — same escalation twice";
  await writeFile(
    path,
    JSON.stringify({
      intent: "I",
      context: null,
      artifact: "x.json",
      answers: [
        {
          escalation: dupEscalation,
          requirementId: "parse-duration",
          decision: "First decision prose.",
        },
        {
          escalation: dupEscalation, // duplicate!
          requirementId: "parse-duration",
          decision: "Second decision prose.",
        },
      ],
    }),
  );

  await assert.rejects(
    loadOwnerAnswers(path),
    /duplicate/i,
  );
});

// ── AC10 (rev 2): renderDecisionBlock authoring-diversity hint ────────────────

const DIVERSITY_HINT =
  "When you author an example to pin one of these behaviors, prefer a " +
  "distinctive, non-trivial representative input over the single smallest or " +
  "most obvious case — a varied example pins the behavior just as well.";

test("AC10 renderDecisionBlock — diversity hint appended after the bullets when decisions present", () => {
  const result = renderDecisionBlock(["A.", "B."]);

  // Hint present, verbatim
  assert.ok(result.includes(DIVERSITY_HINT), `diversity hint present: ${result}`);

  // Hint comes AFTER the last bullet (it is a trailing authoring note)
  assert.ok(
    result.indexOf(DIVERSITY_HINT) > result.lastIndexOf("- B."),
    "diversity hint appears after the last bullet",
  );

  // Bullet count is UNCHANGED — the hint is not itself a bullet (no leading "- ")
  const bullets = result.split("\n").filter((l) => l.startsWith("- "));
  assert.equal(bullets.length, 2, "still exactly two bullets — hint is not a bullet");

  // Header lines still verbatim (the rev-1 invariants hold)
  assert.ok(
    result.includes("inputs) that pin exactly these:"),
    "third header line still present verbatim",
  );

  // Hint is literal-free: no entry(args) form, no === membrane syntax
  assert.ok(!result.includes("parseDuration("), "hint contains no entry(args) form");
  assert.ok(!result.includes("==="), "hint contains no === membrane syntax");
});

test("AC10 renderDecisionBlock([]) — NO diversity hint when decision list is empty (header only)", () => {
  const result = renderDecisionBlock([]);
  assert.ok(!result.includes(DIVERSITY_HINT), "no hint for empty decision list");
  // Empty case is byte-unchanged from rev 1: header lines, no bullet, no hint
  const lines = result.split("\n").filter((l) => l.startsWith("- "));
  assert.equal(lines.length, 0, "no bullets for empty decision list");
});
