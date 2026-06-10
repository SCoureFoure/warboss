/** AC8–AC12 — see specs/membrane-core.spec.md */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Contract } from "../src/contract.ts";
import { judge, deepEqual, ContractHashMismatch } from "../src/runner.ts";

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

test("AC12 deepEqual is structural and treats NaN as equal", () => {
  assert.ok(deepEqual([1, [2, 3]], [1, [2, 3]]));
  assert.ok(!deepEqual([1, 2], [1, 2, 3]));
  assert.ok(deepEqual({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 }));
  assert.ok(!deepEqual({ a: 1 }, { a: 2 }));
  assert.ok(deepEqual(NaN, NaN));
});
