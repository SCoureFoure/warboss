/** AC3–AC4 — see specs/membrane-core.spec.md */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Contract, type ContractCase, type ContractInput } from "../src/contract.ts";

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

const mk = (examples: ContractCase[]) =>
  ({ requirement: "r", entry: "f", version: "1", examples }) as ContractInput;
const nested = (): ContractCase[] => [{ input: [{ a: 1 }], expected: { b: 2 } }];

test("AC23 nested mutation of a frozen contract throws TypeError", () => {
  const c = Contract.freeze(mk(nested()));
  assert.throws(() => {
    (c.examples[0]!.expected as any).b = 3;
  }, TypeError);
  assert.throws(() => {
    (c.examples[0]!.input[0] as any).a = 9;
  }, TypeError);
  assert.throws(() => {
    (c.examples[0] as any).expected = 0;
  }, TypeError);
});

test("AC24 caller mutation of nested example is isolated", () => {
  const examples = nested();
  const c = Contract.freeze(mk(examples));
  (examples[0]!.expected as any).b = 3;
  assert.deepEqual(c.examples[0]!.expected, { b: 2 });
  assert.ok(c.verify(Contract.computeHash(mk(nested()))));
});

test("AC25 caller examples array is isolated", () => {
  const examples = nested();
  const c = Contract.freeze(mk(examples));
  examples.push({ input: [], expected: 1 });
  assert.equal(c.examples.length, 1);
});

test("AC26 hash distinguishes values JSON.stringify makes lossy", () => {
  const h = (inp: unknown[]) =>
    Contract.computeHash(mk([{ input: inp, expected: 0 }]));
  assert.notEqual(h([NaN]), h([null]));
  assert.notEqual(h([Infinity]), h([null]));
  assert.notEqual(h([-0]), h([0]));
  assert.notEqual(h([[undefined]]), h([[null]]));
  assert.notEqual(h([{ a: undefined }]), h([{}]));
});

test("AC27 JSON-safe canonical hash is unchanged", () => {
  const c = Contract.freeze(
    mk([
      { input: [1, "x", [true, null], { k: 2 }], expected: [3] },
      { input: [], expected: undefined, throws: true, throwsMatch: "bad" },
    ]),
  );
  const canonical = JSON.stringify({
    requirement: "r",
    entry: "f",
    version: "1",
    examples: [
      { input: [1, "x", [true, null], { k: 2 }], expected: [3] },
      { input: [], throws: true, throwsMatch: "bad" },
    ],
  });
  assert.equal(c.hash, createHash("sha256").update(canonical).digest("hex"));
});

test("AC28 freeze rejects unsupported example values", () => {
  const bad: ContractCase[] = [
    { input: [new Date(0)], expected: 0 },
    { input: [new Map()], expected: 0 },
    { input: [() => 1], expected: 0 },
    { input: [], expected: { $nonjson: "NaN" } },
  ];
  for (const b of bad) {
    assert.throws(() => Contract.freeze(mk([b])), /unsupported value/);
  }
});

test("AC29 non-finite values are accepted and preserved", () => {
  const c = Contract.freeze(mk([{ input: [NaN], expected: Infinity }]));
  assert.ok(Number.isNaN(c.examples[0]!.input[0]));
  assert.equal(c.examples[0]!.expected, Infinity);
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
