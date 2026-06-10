/**
 * End-to-end smoke test of the core layers. Run: `npm run smoke`.
 *
 * Offline (no API key needed): freezes a contract, proves the runner judges a
 * known-good impl, and proves mechanical freeze rejects a hash mismatch.
 *
 * Online (ANTHROPIC_API_KEY set): dispatches one real grunt against the frozen
 * contract, judges its output, and prints the cost ledger — the full
 * generate → judge → meter path in miniature.
 */

import { Contract } from "./contract.ts";
import { judge, ContractHashMismatch } from "./runner.ts";
import { Ledger } from "./cost.ts";
import { Agent, GRUNT_DOGMA } from "./agent.ts";
import { TIERS } from "./models.ts";

const contract = Contract.freeze({
  requirement:
    "Implement `add(a, b)` returning the integer sum of two integers.",
  entry: "add",
  version: "1",
  examples: [
    { name: "small", input: [2, 3], expected: 5 },
    { name: "neg", input: [-1, 1], expected: 0 },
  ],
});

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`SMOKE FAIL: ${msg}`);
  console.log(`  ok — ${msg}`);
}

async function main(): Promise<void> {
  console.log(`Contract frozen. hash=${contract.hash.slice(0, 12)}…`);

  console.log("\n[offline] runner judges a known-good impl");
  const good = judge(contract, "function add(a, b) { return a + b; }", {
    expectedHash: contract.hash,
  });
  assert(good.pass, "good impl passes all examples");
  assert(good.score === 1, "score is 1.0");

  console.log("\n[offline] runner judges a wrong impl and explains why");
  const bad = judge(contract, "function add(a, b) { return a - b; }", {
    granularity: "full",
  });
  assert(!bad.pass, "wrong impl fails");
  assert(bad.feedback.includes("expected"), "feedback names expected values");
  console.log(`  feedback:\n    ${bad.feedback.replace(/\n/g, "\n    ")}`);

  console.log("\n[offline] sandbox bounds an infinite loop");
  const loop = judge(contract, "function add(a, b) { while (true) {} }", {
    timeoutMs: 200,
  });
  assert(!loop.pass, "infinite loop does not hang the runner");

  console.log("\n[offline] mechanical freeze rejects a hash mismatch");
  let rejected = false;
  try {
    judge(contract, "function add(a, b) { return a + b; }", {
      expectedHash: "deadbeef",
    });
  } catch (e) {
    rejected = e instanceof ContractHashMismatch;
  }
  assert(rejected, "runner refuses to execute against an unregistered hash");

  if (!process.env["ANTHROPIC_API_KEY"]) {
    console.log("\n[online] skipped — set ANTHROPIC_API_KEY to dispatch a grunt.");
    console.log("\nSMOKE PASS (offline).");
    return;
  }

  console.log("\n[online] dispatching one grunt against the frozen contract");
  const ledger = new Ledger();
  const grunt = new Agent(TIERS.LOW, ledger, { system: GRUNT_DOGMA });

  const prompt = [
    contract.requirement,
    "",
    "Acceptance examples (input → expected):",
    ...contract.examples.map((c) => `  ${JSON.stringify(c.input)} → ${JSON.stringify(c.expected)}`),
    "",
    `Define a function named \`${contract.entry}\`.`,
  ].join("\n");

  const gen = await grunt.generate({ prompt, kind: "grunt.generate", tags: { arm: "smoke" } });
  console.log(`  grunt produced ${gen.code ? "code" : "no code"} in ${gen.wallMs.toFixed(0)}ms`);

  const verdict = judge(contract, gen.code ?? "", { expectedHash: contract.hash });
  console.log(`  verdict: ${verdict.pass ? "GREEN" : "RED"} (score ${verdict.score})`);

  const t = ledger.totals();
  console.log(
    `  ledger: ${t.calls} call, ${t.inputTokens} in / ${t.outputTokens} out, $${t.costUsd.toFixed(6)}`,
  );

  console.log(`\nSMOKE PASS${verdict.pass ? "" : " (grunt did not reach green — that's data, not a failure)"}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
