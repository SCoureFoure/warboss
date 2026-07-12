// Regression guard for `ledger.mjs summary`'s greens-denominated decide
// productivity line (and the untiered-warning line it sits beside).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ledger = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'ledger.mjs');
const tiers = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tiers.json');

function writeTemp(name, lines) {
  const file = path.join(os.tmpdir(), `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + (lines.length ? '\n' : ''));
  return file;
}

function runSummary(L, T, V) {
  return execFileSync(process.execPath, [ledger, 'summary', '--file', L, '--tiers', T, '--verdicts', V], {
    encoding: 'utf8',
  });
}

test('summary: untiered warning + greens-denominated decide productivity', () => {
  const L = writeTemp('ledger-pos', [
    { agent_type: 'warboss-orchestrator', model: 'claude-opus-4-8', tokens: 900000, agent_id: 'orch-1' },
    { model: 'claude-haiku-4-5-20251001', tokens: 100000, agent_id: 'd1' }, // red first try
    { model: 'claude-haiku-4-5-20251001', tokens: 90000, agent_id: 'd1b' }, // green retry
    { model: 'claude-sonnet-5', tokens: 200000, agent_id: 'd2' },
    { model: 'claude-fable-5', tokens: 700000, agent_id: 'd3' }, // untiered
  ]);
  const V = writeTemp('verdicts-pos', [
    { agent_id: 'd1', verdict: 'red', cause: 'worker_miss' },
    { agent_id: 'd1b', verdict: 'green' },
    { agent_id: 'd2', verdict: 'green' },
    { agent_id: 'd3', verdict: 'green' },
  ]);

  try {
    const out = runSummary(L, tiers, V);

    assert.match(
      out,
      /⚠ untiered tokens: 700000 \(35%\) — model\(s\) not on tiers\.json ladder: claude-fable-5\. They escape thesis accounting \(fail-open\); add each as a rung\./
    );
    assert.match(
      out,
      /decide productivity: 900000 decide-tokens \/ 3 green slices = 300000 decide-tok per green \(lower = leaner authoring\)/
    );
    assert.ok(!out.includes('225000'), 'denominator must be greens=3, not dispatches=4');
  } finally {
    fs.rmSync(L, { force: true });
    fs.rmSync(V, { force: true });
  }
});

test('summary: no untiered, no orchestrator, no verdicts -> both lines omitted', () => {
  const L2 = writeTemp('ledger-neg', [
    { model: 'claude-haiku-4-5-20251001', tokens: 100000, agent_id: 'n1' },
    { model: 'claude-sonnet-5', tokens: 200000, agent_id: 'n2' },
  ]);
  const V2 = writeTemp('verdicts-neg-empty', []);

  try {
    const out = runSummary(L2, tiers, V2);
    assert.ok(!out.includes('untiered tokens:'));
    assert.ok(!out.includes('decide productivity:'));
  } finally {
    fs.rmSync(L2, { force: true });
    fs.rmSync(V2, { force: true });
  }
});

test('summary: orchestrator present but no greens -> decide productivity omitted', () => {
  const L3 = writeTemp('ledger-orch-nogreens', [
    { agent_type: 'warboss-orchestrator', model: 'claude-opus-4-8', tokens: 900000, agent_id: 'orch-2' },
    { model: 'claude-haiku-4-5-20251001', tokens: 100000, agent_id: 'n3' },
    { model: 'claude-sonnet-5', tokens: 200000, agent_id: 'n4' },
  ]);
  const V3 = writeTemp('verdicts-orch-nogreens-empty', []);

  try {
    const out = runSummary(L3, tiers, V3);
    assert.ok(!out.includes('decide productivity:'));
  } finally {
    fs.rmSync(L3, { force: true });
    fs.rmSync(V3, { force: true });
  }
});
