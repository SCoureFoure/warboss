/** AC5–AC7 — see specs/membrane-core.spec.md */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runImpl, stripImports } from "../src/sandbox.ts";

test("AC5 runImpl returns the value for a correct pure function", () => {
  const r = runImpl("function add(a, b) { return a + b; }", "add", [2, 3]);
  assert.deepEqual(r, { ok: true, value: 5 });
});

test("AC5 runImpl captures a thrown error instead of propagating", () => {
  const r = runImpl("function f() { throw new Error('boom'); }", "f", []);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /boom/);
});

test("AC5 runImpl reports a missing entry without throwing", () => {
  const r = runImpl("const x = 1;", "add", [1]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /add/);
});

test("AC6 runImpl bounds an infinite loop by timeout", () => {
  const r = runImpl("function f() { while (true) {} }", "f", [], { timeoutMs: 100 });
  assert.equal(r.ok, false);
});

test("AC7 stripImports removes import/export/require so a body runs bare", () => {
  const stripped = stripImports("import x from 'y';\nexport function f() { return 1; }");
  assert.ok(!/\bimport\b/.test(stripped));
  const r = runImpl("import fs from 'fs';\nexport function f() { return 42; }", "f", []);
  assert.deepEqual(r, { ok: true, value: 42 });
});
