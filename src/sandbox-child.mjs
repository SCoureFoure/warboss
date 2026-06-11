import { runInNewContext } from "node:vm";

// Read one JSON line from stdin
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const { code, entry, args, vmTimeoutMs } = JSON.parse(Buffer.concat(chunks).toString("utf8"));

// Replace console methods with no-ops inside the vm context
const noopConsole = { log: ()=>{}, warn: ()=>{}, error: ()=>{}, info: ()=>{} };

// Strip imports (same regex as sandbox.ts stripImports)
const stripped = code
  .replace(/^\s*import\s.*$/gm, "")
  .replace(/^\s*export\s+(?=function|const|let|var|class|async)/gm, "")
  .replace(/^\s*export\s+default\s+/gm, "")
  .replace(/\brequire\s*\([^)]*\)/g, "undefined");

const context = { __args: args, __result: undefined, __error: undefined, console: noopConsole };
const script = `
  ${stripped}
  ;(async function() {
    if (typeof ${entry} !== "function") { __error = "entry function '${entry}' is not defined"; return; }
    try { __result = await ${entry}(...__args); }
    catch (e) { __error = e && e.message ? String(e.message) : String(e); }
  })();
`;

// Keep the event loop alive so the parent wall-clock kill has a chance to fire.
// Without this, an async function that awaits a never-resolving Promise causes
// Node to drain the event loop and exit with code 13 before the parent kills us.
const keepalive = setInterval(() => {}, 100);

try {
  const p = runInNewContext(script, context, { timeout: vmTimeoutMs });
  if (p && typeof p.then === "function") {
    await p;
  }
} catch(e) {
  clearInterval(keepalive);
  const msg = e instanceof Error ? e.message : String(e);
  process.stdout.write("##RESULT##" + JSON.stringify({ ok: false, error: msg }) + "\n");
  process.exit(0);
}
clearInterval(keepalive);

let result;
if (context.__error !== undefined) {
  result = { ok: false, error: String(context.__error) };
} else {
  // Serialize result — handle non-JSON-serializable values.
  // Note: JSON.stringify(function(){}) returns undefined rather than throwing,
  // so we must check the round-trip: serialize then parse and compare.
  try {
    const serialized = JSON.stringify(context.__result);
    if (serialized === undefined) {
      // Non-serializable (e.g. functions, undefined at top level)
      result = { ok: false, error: "unserializable result" };
    } else {
      result = { ok: true, value: JSON.parse(serialized) };
    }
  } catch {
    result = { ok: false, error: "unserializable result" };
  }
}
process.stdout.write("##RESULT##" + JSON.stringify(result) + "\n");
process.exit(0);
