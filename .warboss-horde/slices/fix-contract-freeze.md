# fix-contract-freeze

First read `.warboss-horde/slices/_fix-protocol.md` and follow it exactly.

Forks: deep-freeze + clone = `intent` (membrane immutability). Lossless hash = `intent`. Rejecting non-plain
objects and the `$nonjson` key = `fiat` (chosen to keep the canonical form collision-free).

- files: `src/contract.ts`, `test/contract.test.ts`, `specs/membrane-core.spec.md` (append criteria only)
- context: `.warboss-horde/out/review-core.md` findings F1 and F2 describe the defects.

## Behavior

In the `Contract` constructor (`src/contract.ts`):

1. **Clone, then deep-freeze.** `this.examples` MUST be a deep copy of `input.examples` (use `structuredClone`),
   recursively frozen with `Object.freeze` at every level: the array, each case object, each `input` array, and every
   nested array or plain object inside `input` and `expected`. The caller's original objects are never frozen and
   never aliased.
2. **Hash the clone.** `this.hash` is computed from the cloned examples, so later mutation of the caller's objects
   cannot change what was hashed or what is stored.
3. **Validate values before cloning.** Walk every value inside each example's `input` and `expected`. Throw
   `Error("Contract.freeze: example <label> contains unsupported value at <path>")` (label is `c.name ?? index`,
   same as the existing `throwsMatch` errors) when a value is:
   - a function or a symbol,
   - an object that is neither an array nor a plain object (prototype is not `Object.prototype` and not `null`) —
     this covers `Date`, `Map`, `Set`, `RegExp`, class instances,
   - a plain object that has an own key exactly equal to `$nonjson`.
4. **Lossless canonical form** in `computeHash`. Keep the existing shape and key order
   (`requirement, entry, version, examples[{input, expected, throws?, throwsMatch?}]`) and keep `JSON.stringify`.
   Before stringifying, map each example's `input` and `expected` through a recursive encoder that replaces, at any
   depth:
   - `NaN` → `{"$nonjson":"NaN"}`
   - `Infinity` → `{"$nonjson":"Infinity"}`, `-Infinity` → `{"$nonjson":"-Infinity"}`
   - `-0` (use `Object.is(v, -0)`) → `{"$nonjson":"-0"}`
   - `undefined` as an array element or an object property value → `{"$nonjson":"undefined"}`
   - a `bigint` → `{"$nonjson":"bigint:<decimal digits>"}`

   and leaves every other value unchanged.
   **Exception:** when an example's top-level `expected` is exactly `undefined`, the `expected` key stays absent from
   the canonical object, exactly as today. Do not encode it.
5. `computeHash` stays `static` and keeps its signature. It must not throw on the values in item 4.

Do not change `verify`, the `throwsMatch` validation, or any exported type.

## Cases (each is one test in `test/contract.test.ts`)

Use `Contract.freeze({ requirement: "r", entry: "f", version: "1", examples })` unless stated.

1. Nested mutation throws: `examples = [{ input: [{ a: 1 }], expected: { b: 2 } }]`. After freeze,
   `(c.examples[0].expected as any).b = 3` throws `TypeError`, and so does `(c.examples[0].input[0] as any).a = 9`,
   and so does `(c.examples[0] as any).expected = 0`.
2. Caller mutation is isolated: build `examples` as in case 1, freeze, then set `examples[0].expected.b = 3` on the
   caller's original object (this must NOT throw). Assert `c.examples[0].expected` deep-equals `{ b: 2 }` and
   `c.verify(Contract.computeHash({ requirement: "r", entry: "f", version: "1",
   examples: [{ input: [{ a: 1 }], expected: { b: 2 } }] }))` is `true`.
3. Caller array is isolated: push a new case onto the caller's `examples` array after freeze; `c.examples.length`
   is unchanged.
4. Hash distinguishes lossy values. For each pair, the two contracts (identical except the stated `input`) have
   different hashes: `[NaN]` vs `[null]`; `[Infinity]` vs `[null]`; `[-0]` vs `[0]`; `[[undefined]]` vs `[[null]]`;
   `[{ a: undefined }]` vs `[{}]`.
5. JSON-safe hash is unchanged: for `examples = [{ input: [1, "x", [true, null], { k: 2 }], expected: [3] },
   { input: [], expected: undefined, throws: true, throwsMatch: "bad" }]`, `c.hash` equals the sha256 hex of
   `JSON.stringify({ requirement: "r", entry: "f", version: "1", examples: [{ input: [1, "x", [true, null],
   { k: 2 }], expected: [3] }, { input: [], throws: true, throwsMatch: "bad" }] })`. Compute that in the test with
   `node:crypto`.
6. Unsupported values throw at freeze, message matching `/unsupported value/`: `input: [new Date(0)]`;
   `input: [new Map()]`; `input: [() => 1]`; `expected: { $nonjson: "NaN" }`.
7. Non-finite values are accepted and preserved: `examples = [{ input: [NaN], expected: Infinity }]` freezes without
   throwing; `Number.isNaN(c.examples[0].input[0])` is `true`; `c.examples[0].expected === Infinity`.

Before finishing, Grep `test/` and `src/` for code that relies on `contract.examples` being the same object
identity as the input array (`===`, `assert.equal(c.examples, ...)`, `assert.strictEqual`). If you find any, report
it in your reply; do not edit files outside your list.
