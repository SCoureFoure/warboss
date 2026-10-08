/** AC8–AC12 — see specs/membrane-core.spec.md */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Contract } from "../src/contract.ts";
import { judge, judgeAsync, deepEqual, ContractHashMismatch, type ImplRunner } from "../src/runner.ts";

const contract = Contract.freeze({
  requirement: "add a and b",
  entry: "add",
  version: "1",
  examples: [
    { name: "a", input: [1, 2], expected: 3 },
    { name: "b", input: [2, 2], expected: 4 },
  ],
});
const good = "function add(a, b) { return a + b; }";
const bad = "function add(a, b) { return a - b; }"; // fails both examples
const half = "function add(a, b) { return a === 1 ? a + b : 0; }"; // passes [1,2], fails [2,2]

test("AC8 all cases pass → pass/score/feedback", () => {
  const v = judge(contract, good);
  assert.ok(v.pass);
  assert.equal(v.score, 1);
  assert.equal(v.feedback, "");
  assert.deepEqual(v.vector, [true, true]);
});

test("AC8 a mix → vector mirrors results, score is the passing fraction", () => {
  const v = judge(contract, half);
  assert.ok(!v.pass);
  assert.deepEqual(v.vector, [true, false]);
  assert.equal(v.score, 0.5);
});

test("AC9 feedback granularity: passfail / input / full", () => {
  const pf = judge(contract, bad, { granularity: "passfail" }).feedback;
  assert.match(pf, /2 case/);
  assert.ok(!/expected/.test(pf) && !/got/.test(pf));

  const inp = judge(contract, bad, { granularity: "input" }).feedback;
  assert.match(inp, /\[1,2\]/);
  assert.ok(!/expected/.test(inp) && !/got/.test(inp));

  const full = judge(contract, bad, { granularity: "full" }).feedback;
  assert.match(full, /got/);
  assert.match(full, /expected/);
});

test("AC10 hidden battery never leaks specifics into feedback", () => {
  const v = judge(contract, bad, {
    battery: [{ input: [5, 5], expected: 10 }],
    granularity: "full",
  });
  assert.ok(!v.pass);
  assert.match(v.feedback, /hidden/);
  assert.ok(!/5,5/.test(v.feedback), "must not reveal the hidden input");
  assert.ok(!/expected/.test(v.feedback) && !/10/.test(v.feedback));
});

test("AC11 mechanical freeze: wrong hash throws, own hash executes", () => {
  assert.throws(
    () => judge(contract, good, { expectedHash: "deadbeef" }),
    ContractHashMismatch,
  );
  const v = judge(contract, good, { expectedHash: contract.hash });
  assert.ok(v.pass);
});

test("AC16 throws case: passes when impl throws, fails when impl returns a value", () => {
  const throwsContract = Contract.freeze({
    requirement: "noNeg throws on negative input",
    entry: "noNeg",
    version: "1",
    examples: [{ name: "ok", input: [1], expected: 1 }],
  });
  const battery = [
    { name: "neg", input: [-1], expected: "<throws>" as unknown, throws: true as const },
  ];

  const throwingImpl = "function noNeg(x) { if (x < 0) throw new Error('neg'); return x; }";
  const v1 = judge(throwsContract, throwingImpl, { battery, revealInFeedback: true });
  assert.ok(v1.pass);
  assert.deepEqual(v1.vector, [true]);

  const notThrowingImpl = "function noNeg(x) { return x; }";
  const v2 = judge(throwsContract, notThrowingImpl, { battery, revealInFeedback: true });
  assert.ok(!v2.pass);
  assert.deepEqual(v2.vector, [false]);
});

const durationContract = Contract.freeze({
  requirement: "validateDuration throws with message on invalid input",
  entry: "validateDuration",
  version: "1",
  examples: [{ name: "ok", input: [5], expected: 5 }],
});
const durationBattery = [
  {
    name: "bad",
    input: [-1],
    expected: "<throws>" as unknown,
    throws: true as const,
    throwsMatch: "^Invalid duration",
  },
];

test("throws + throwsMatch pass", () => {
  const impl =
    "function validateDuration(x) { if (x < 0) throw new Error('Invalid duration: ' + x); return x; }";
  const v = judge(durationContract, impl, { battery: durationBattery, revealInFeedback: true });
  assert.ok(v.pass);
  assert.deepEqual(v.vector, [true]);
});

test("throws + throwsMatch mismatch fails", () => {
  const impl =
    "function validateDuration(x) { if (x < 0) throw new TypeError('x is not a function'); return x; }";
  const full = judge(durationContract, impl, {
    battery: durationBattery,
    revealInFeedback: true,
    granularity: "full",
  });
  assert.ok(!full.pass);
  assert.match(full.feedback, /did not match/);
  assert.match(full.feedback, /\^Invalid duration/);

  const passfail = judge(durationContract, impl, {
    battery: durationBattery,
    revealInFeedback: true,
    granularity: "passfail",
  });
  assert.match(passfail.feedback, /1 case/);
  assert.ok(!/did not match/.test(passfail.feedback));
});

test("throws without throwsMatch: any throw still passes (legacy pinned)", () => {
  const noNegContract = Contract.freeze({
    requirement: "noNeg throws on negative input",
    entry: "noNeg",
    version: "1",
    examples: [{ name: "ok", input: [1], expected: 1 }],
  });
  const battery = [
    { name: "neg", input: [-1], expected: "<throws>" as unknown, throws: true as const },
  ];
  const impl = "function noNeg(x) { if (x < 0) throw new Error('anything at all'); return x; }";
  const v = judge(noNegContract, impl, { battery, revealInFeedback: true });
  assert.ok(v.pass);
  assert.deepEqual(v.vector, [true]);
});

test("judgeAsync: throws + throwsMatch pass (fake runner)", async () => {
  const fakeRunner: ImplRunner = async (_code, _entry, args) => {
    const x = args[0] as number;
    if (x < 0) return { ok: false, error: `Invalid duration: ${x}`, kind: "threw" };
    return { ok: true, value: x };
  };
  const v = await judgeAsync(durationContract, "unused", {
    battery: durationBattery,
    revealInFeedback: true,
    runner: fakeRunner,
  });
  assert.ok(v.pass);
  assert.deepEqual(v.vector, [true]);
});

test("judgeAsync: throws + throwsMatch mismatch fails (fake runner)", async () => {
  const fakeRunner: ImplRunner = async (_code, _entry, args) => {
    const x = args[0] as number;
    if (x < 0) return { ok: false, error: "x is not a function", kind: "threw" };
    return { ok: true, value: x };
  };
  const full = await judgeAsync(durationContract, "unused", {
    battery: durationBattery,
    revealInFeedback: true,
    runner: fakeRunner,
    granularity: "full",
  });
  assert.ok(!full.pass);
  assert.match(full.feedback, /did not match/);
  assert.match(full.feedback, /\^Invalid duration/);

  const passfail = await judgeAsync(durationContract, "unused", {
    battery: durationBattery,
    revealInFeedback: true,
    runner: fakeRunner,
    granularity: "passfail",
  });
  assert.match(passfail.feedback, /1 case/);
  assert.ok(!/did not match/.test(passfail.feedback));
});

const throwsOnly = Contract.freeze({
  requirement: "f throws",
  entry: "f",
  version: "1",
  examples: [{ input: [], expected: undefined, throws: true }],
});
const throwsMatchBad = Contract.freeze({
  requirement: "f throws bad",
  entry: "f",
  version: "1",
  examples: [{ input: [], expected: undefined, throws: true, throwsMatch: "bad" }],
});
const fixedRunner = (r: unknown): ImplRunner => async () => r as Awaited<ReturnType<ImplRunner>>;

test("AC35 throws case: entry throw passes", () => {
  assert.ok(judge(throwsOnly, 'function f(){ throw new Error("bad") }').pass);
});

test("AC36 throws case: timeout fails", () => {
  assert.ok(!judge(throwsOnly, "function f(){ while(true){} }", { timeoutMs: 50 }).pass);
});

test("AC37 throws case: missing entry fails", () => {
  assert.ok(!judge(throwsOnly, "function g(){}").pass);
});

test("AC38 throws case: returned value fails", () => {
  assert.ok(!judge(throwsOnly, "function f(){ return 1 }").pass);
});

test("AC39 judgeAsync throws case: infra failure fails", async () => {
  const v = await judgeAsync(throwsOnly, "unused", {
    runner: fixedRunner({ ok: false, error: "sandbox crashed: spawn", kind: "infra" }),
  });
  assert.ok(!v.pass);
});

test("AC40 judgeAsync throws case: timeout kind fails", async () => {
  const v = await judgeAsync(throwsOnly, "unused", {
    runner: fixedRunner({ ok: false, error: "timeout", kind: "timeout" }),
  });
  assert.ok(!v.pass);
});

test("AC41 judgeAsync throws case: threw kind passes", async () => {
  const v = await judgeAsync(throwsOnly, "unused", {
    runner: fixedRunner({ ok: false, error: "bad", kind: "threw" }),
  });
  assert.ok(v.pass);
});

test("AC42 judgeAsync throws case: missing kind fails", async () => {
  const v = await judgeAsync(throwsOnly, "unused", {
    runner: fixedRunner({ ok: false, error: "bad" }),
  });
  assert.ok(!v.pass);
});

test("AC43 judgeAsync throwsMatch: matching message with non-threw kind fails", async () => {
  const v = await judgeAsync(throwsMatchBad, "unused", {
    runner: fixedRunner({ ok: false, error: "bad timeout", kind: "timeout" }),
  });
  assert.ok(!v.pass);
});

test("AC44 judgeAsync throwsMatch with threw kind: match passes, mismatch fails", async () => {
  const hit = await judgeAsync(throwsMatchBad, "unused", {
    runner: fixedRunner({ ok: false, error: "bad", kind: "threw" }),
  });
  assert.ok(hit.pass);
  const miss = await judgeAsync(throwsMatchBad, "unused", {
    runner: fixedRunner({ ok: false, error: "other", kind: "threw" }),
  });
  assert.ok(!miss.pass);
});

test("AC12 deepEqual is structural and treats NaN as equal", () => {
  assert.ok(deepEqual([1, [2, 3]], [1, [2, 3]]));
  assert.ok(!deepEqual([1, 2], [1, 2, 3]));
  assert.ok(deepEqual({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 }));
  assert.ok(!deepEqual({ a: 1 }, { a: 2 }));
  assert.ok(deepEqual(NaN, NaN));
});
