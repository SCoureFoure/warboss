/** AC3–AC4 — see specs/membrane-core.spec.md */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Contract, type ContractInput } from "../src/contract.ts";

const base: ContractInput = {
  requirement: "add a and b",
  entry: "add",
  version: "1",
  examples: [{ input: [1, 2], expected: 3 }],
};

test("AC3 freeze is deterministic and sensitive to every frozen field", () => {
  const h = Contract.computeHash(base);
  assert.equal(Contract.freeze(base).hash, h);
  assert.notEqual(Contract.computeHash({ ...base, requirement: "different" }), h);
  assert.notEqual(Contract.computeHash({ ...base, entry: "sum" }), h);
  assert.notEqual(Contract.computeHash({ ...base, version: "2" }), h);
  assert.notEqual(
    Contract.computeHash({ ...base, examples: [{ input: [1, 2], expected: 4 }] }),
    h,
  );
});

test("AC4 frozen contract is immutable and verifies only its own hash", () => {
  const c = Contract.freeze(base);
  assert.ok(Object.isFrozen(c));
  assert.ok(Object.isFrozen(c.examples));
  assert.ok(c.verify(c.hash));
  assert.ok(!c.verify("deadbeef"));
});

test("AC16 throws flag participates in hash — adding it changes the hash", () => {
  const withThrows: ContractInput = {
    ...base,
    examples: [{ input: [1, 2], expected: 3, throws: true }],
  };
  assert.notEqual(Contract.computeHash(base), Contract.computeHash(withThrows));
  // Two contracts with throws: true should agree with each other.
  assert.equal(Contract.computeHash(withThrows), Contract.computeHash(withThrows));
});

test("throwsMatch participates in hash", () => {
  const withoutMatch: ContractInput = {
    ...base,
    examples: [{ input: [1, 2], expected: 3, throws: true }],
  };
  const withMatch: ContractInput = {
    ...base,
    examples: [{ input: [1, 2], expected: 3, throws: true, throwsMatch: "^Invalid" }],
  };
  assert.notEqual(Contract.computeHash(withoutMatch), Contract.computeHash(withMatch));
});

test("hash back-compat: no throwsMatch → canonical form unchanged", () => {
  const input: ContractInput = {
    requirement: "add a and b",
    entry: "add",
    version: "1",
    examples: [
      { input: [1, 2], expected: 3 },
      { input: [-1, -1], expected: 0, throws: true },
    ],
  };
  // Today's canonical JSON string, hand-replicated (no throwsMatch key at all).
  const canonical = JSON.stringify({
    requirement: input.requirement,
    entry: input.entry,
    version: input.version,
    examples: input.examples.map((c) => ({
      input: c.input,
      expected: c.expected,
      ...(c.throws ? { throws: true as const } : {}),
    })),
  });
  const expected = createHash("sha256").update(canonical).digest("hex");
  assert.equal(Contract.computeHash(input), expected);
});

test("freeze rejects throwsMatch without throws", () => {
  assert.throws(
    () =>
      Contract.freeze({
        ...base,
        examples: [{ input: [1, 2], expected: 3, throwsMatch: "^x" }],
      }),
    /has throwsMatch without throws: true/,
  );
});

test("freeze rejects invalid regex source", () => {
  assert.throws(
    () =>
      Contract.freeze({
        ...base,
        examples: [{ input: [1, 2], expected: 3, throws: true, throwsMatch: "(" }],
      }),
    /has invalid throwsMatch regex/,
  );
});
