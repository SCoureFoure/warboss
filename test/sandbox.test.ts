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

test("AC30 runImpl failure kind: entry throw → threw", () => {
  const r = runImpl('function f(){ throw new Error("bad") }', "f", []);
  assert.deepEqual(r, { ok: false, error: "bad", kind: "threw" });
});

test("AC31 runImpl failure kind: missing entry → no-entry", () => {
  const r = runImpl("function g(){ return 1 }", "f", []);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.kind, "no-entry");
});

test("AC32 runImpl failure kind: infinite loop → timeout", () => {
  const r = runImpl("function f(){ while(true){} }", "f", [], { timeoutMs: 50 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.kind, "timeout");
});

test("AC33 runImpl failure kind: syntax error → infra", () => {
  const r = runImpl("function f( {", "f", []);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.kind, "infra");
});

test("AC34 runImpl failure kind: top-level throw → infra", () => {
  const r = runImpl('throw new Error("top"); function f(){ return 1 }', "f", []);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.kind, "infra");
});

test("AC7 stripImports removes import/export/require so a body runs bare", () => {
  const stripped = stripImports("import x from 'y';\nexport function f() { return 1; }");
  assert.ok(!/\bimport\b/.test(stripped));
  const r = runImpl("import fs from 'fs';\nexport function f() { return 42; }", "f", []);
  assert.deepEqual(r, { ok: true, value: 42 });
});
