// Regression guard for `ledger.mjs annotate latest`: a tie on the newest
// un-judged doer ts must refuse (fail-closed), not let file order pick the target.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ledger = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'ledger.mjs');
const PAYLOAD = '{"verdict":"green","round":1}';

function tempPath(name) {
  return path.join(os.tmpdir(), `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
}

function writeLedger(rows) {
  const file = tempPath('ledger-annotate');
  fs.writeFileSync(
    file,
    rows.map((r) => JSON.stringify({ model: 'haiku', tokens: 10, source: 'hook', ...r })).join('\n') + '\n'
  );
  return file;
}

function annotate(L, V, agentId, payload = PAYLOAD) {
  return spawnSync(process.execPath, [ledger, 'annotate', agentId, payload, '--file', L, '--verdicts', V], {
    encoding: 'utf8',
  });
}

function verdictLines(V) {
  if (!fs.existsSync(V)) return [];
  return fs
    .readFileSync(V, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));
}

const TS0 = '2026-01-01T00:00:00.000Z';
const TS1 = '2026-01-01T00:00:01.000Z';

test('annotate latest: identical newest ts across two agents refuses with ambiguous', () => {
  const L = writeLedger([
    { agent_id: 'a1', agent_type: 'warboss-horde:doer', ts: TS0 },
    { agent_id: 'a2', agent_type: 'warboss-horde:doer', ts: TS0 },
  ]);
  const V = tempPath('verdicts-annotate');
  try {
    const r = annotate(L, V, 'latest');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /ambiguous/);
    assert.match(r.stderr, /a1/);
    assert.match(r.stderr, /a2/);
    assert.equal(verdictLines(V).length, 0);
  } finally {
    fs.rmSync(L, { force: true });
    fs.rmSync(V, { force: true });
  }
});

test('annotate latest: distinct ts picks the later agent', () => {
  const L = writeLedger([
    { agent_id: 'a1', agent_type: 'warboss-horde:doer', ts: TS0 },
    { agent_id: 'a2', agent_type: 'warboss-horde:doer', ts: TS1 },
  ]);
  const V = tempPath('verdicts-annotate');
  try {
    const r = annotate(L, V, 'latest');
    assert.equal(r.status, 0);
    const lines = verdictLines(V);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].agent_id, 'a2');
  } finally {
    fs.rmSync(L, { force: true });
    fs.rmSync(V, { force: true });
  }
});

test('annotate latest: later ts wins even when its row is first in the file', () => {
  const L = writeLedger([
    { agent_id: 'a2', agent_type: 'warboss-horde:doer', ts: TS1 },
    { agent_id: 'a1', agent_type: 'warboss-horde:doer', ts: TS0 },
  ]);
  const V = tempPath('verdicts-annotate');
  try {
    const r = annotate(L, V, 'latest');
    assert.equal(r.status, 0);
    const lines = verdictLines(V);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].agent_id, 'a2');
  } finally {
    fs.rmSync(L, { force: true });
    fs.rmSync(V, { force: true });
  }
});

test('annotate latest: same agent with two models at the same ts is not a tie', () => {
  const L = writeLedger([
    { agent_id: 'a1', agent_type: 'warboss-horde:doer', ts: TS0, model: 'haiku' },
    { agent_id: 'a1', agent_type: 'warboss-horde:doer', ts: TS0, model: 'sonnet' },
  ]);
  const V = tempPath('verdicts-annotate');
  try {
    const r = annotate(L, V, 'latest');
    assert.equal(r.status, 0);
    const lines = verdictLines(V);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].agent_id, 'a1');
  } finally {
    fs.rmSync(L, { force: true });
    fs.rmSync(V, { force: true });
  }
});

test('annotate latest: runner row sharing the newest ts is not a tie', () => {
  const L = writeLedger([
    { agent_id: 'a1', agent_type: 'warboss-horde:doer', ts: TS0 },
    { agent_id: 'r1', agent_type: 'warboss-horde:runner', ts: TS0 },
  ]);
  const V = tempPath('verdicts-annotate');
  try {
    const r = annotate(L, V, 'latest');
    assert.equal(r.status, 0);
    const lines = verdictLines(V);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].agent_id, 'a1');
  } finally {
    fs.rmSync(L, { force: true });
    fs.rmSync(V, { force: true });
  }
});

test('annotate latest: already-judged tied row does not create a tie', () => {
  const L = writeLedger([
    { agent_id: 'a1', agent_type: 'warboss-horde:doer', ts: TS0 },
    { agent_id: 'a2', agent_type: 'warboss-horde:doer', ts: TS0 },
  ]);
  const V = tempPath('verdicts-annotate');
  try {
    const explicit = annotate(L, V, 'a2');
    assert.equal(explicit.status, 0);
    const r = annotate(L, V, 'latest');
    assert.equal(r.status, 0);
    const lines = verdictLines(V);
    assert.equal(lines.length, 2);
    assert.equal(lines[1].agent_id, 'a1');
  } finally {
    fs.rmSync(L, { force: true });
    fs.rmSync(V, { force: true });
  }
});

test('annotate explicit id still works during a tie', () => {
  const L = writeLedger([
    { agent_id: 'a1', agent_type: 'warboss-horde:doer', ts: TS0 },
    { agent_id: 'a2', agent_type: 'warboss-horde:doer', ts: TS0 },
  ]);
  const V = tempPath('verdicts-annotate');
  try {
    const r = annotate(L, V, 'a1');
    assert.equal(r.status, 0);
    const lines = verdictLines(V);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].agent_id, 'a1');
  } finally {
    fs.rmSync(L, { force: true });
    fs.rmSync(V, { force: true });
  }
});
