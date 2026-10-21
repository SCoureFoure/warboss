// Acceptance guard for audit round 2: dead tool output (E2) and thinking share of output.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { toolLifetimes, lifetimeUsd, sizeBucket } from '../scripts/audit.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const u = (output = 1, think = 0) => ({
  input_tokens: 1, cache_read_input_tokens: 1000, cache_creation_input_tokens: 100, output_tokens: output,
  cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 0 },
  output_tokens_details: { thinking_tokens: think },
});
let tsn = 0;
const ts = () => new Date(Date.UTC(2026, 9, 1, 0, tsn++)).toISOString();
const asst = (id, content, usage = u()) =>
  JSON.stringify({ type: 'assistant', timestamp: ts(), message: { id, role: 'assistant', model: 'claude-opus-5-5', usage, content } });
const user = (content) => JSON.stringify({ type: 'user', timestamp: ts(), message: { role: 'user', content } });
const boundary = () => JSON.stringify({ type: 'system', subtype: 'compact_boundary', timestamp: ts() });

const T1 = [
  asst('a1', [{ type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: 'C:/x/alpha.txt' } }], u(10000, 4000)),
  user([{ type: 'tool_result', tool_use_id: 'tu1', content: 'zeta_unique_42 shared_token_99' }]),
  asst('a2', [
    { type: 'text', text: 'I saw zeta_unique_42 there' },
    { type: 'tool_use', id: 'tu2', name: 'Bash', input: { command: 'ls' } },
  ], u(20000, 6000)),
  user([{ type: 'tool_result', tool_use_id: 'tu2', content: [
    { type: 'text', text: 'output_never_cited_77' },
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'A'.repeat(5000) } },
  ] }]),
  asst('a3', [{ type: 'text', text: 'done' }], u(0, 0)),
  asst('a3', [{ type: 'text', text: 'done' }], u(0, 0)),
  boundary(),
  asst('a4', [{ type: 'text', text: 'ok output_never_cited_77' }], u(0, 0)),
  'not json',
].join('\n');

test('toolLifetimes: size, live calls to the next compact boundary, novel-token reference', () => {
  assert.deepEqual(toolLifetimes(T1), [
    // 30 chars -> 8 tokens; a2 and a3 are live (a3 streamed twice = one call); a4 is past the boundary.
    { tool: 'Read', sizeTokens: 8, liveCalls: 2, referenced: true },
    // 21 text chars -> 6 tokens + 1600 per image; base64 data is not counted as chars.
    // a4 cites the token past the boundary; it still counts: reference scope is the whole remaining transcript.
    { tool: 'Bash', sizeTokens: 1606, liveCalls: 1, referenced: true },
  ]);
});

test('toolLifetimes: no novel tokens is dead; user text never counts as a reference; tool name buckets', () => {
  const text = [
    user('please look for already_known_token and user_says_this_one'),
    asst('b1', [
      { type: 'tool_use', id: 'g1', name: 'Grep', input: { pattern: 'already_known_token' } },
      { type: 'tool_use', id: 't1', name: 'Task', input: { prompt: 'go' } },
      { type: 'tool_use', id: 'e1', name: 'Edit', input: { old_string: 'abc' } },
    ]),
    user([
      { type: 'tool_result', tool_use_id: 'g1', content: 'already_known_token' },
      { type: 'tool_result', tool_use_id: 't1', content: 'research_finding_xyz' },
      { type: 'tool_result', tool_use_id: 'e1', content: 'edited_ok_marker' },
      { type: 'tool_result', tool_use_id: 'nope', content: 'orphan_result_text' },
    ]),
    user('the user repeats research_finding_xyz'),
    asst('b2', [{ type: 'thinking', thinking: 'consider edited_ok_marker', signature: 's' }, { type: 'text', text: 'already_known_token' }]),
  ].join('\n');
  assert.deepEqual(toolLifetimes(text), [
    { tool: 'Grep', sizeTokens: 5, liveCalls: 1, referenced: false },
    { tool: 'Agent', sizeTokens: 5, liveCalls: 1, referenced: false },
    { tool: 'other', sizeTokens: 4, liveCalls: 1, referenced: true },
    { tool: 'other', sizeTokens: 5, liveCalls: 1, referenced: false },
  ]);
});

test('lifetimeUsd: one write then a read per later live call; zero live calls costs nothing', () => {
  close(lifetimeUsd(1000, 3, 0.2, 5), 0.0054);
  close(lifetimeUsd(1000, 1, 0.2, 5), 0.005);
  assert.equal(lifetimeUsd(1000, 0, 0.2, 5), 0);
});

test('sizeBucket: half-open token ranges', () => {
  assert.equal(sizeBucket(0), '<1k');
  assert.equal(sizeBucket(999), '<1k');
  assert.equal(sizeBucket(1000), '1k-5k');
  assert.equal(sizeBucket(4999), '1k-5k');
  assert.equal(sizeBucket(5000), '5k-20k');
  assert.equal(sizeBucket(19999), '5k-20k');
  assert.equal(sizeBucket(20000), '>=20k');
});

test('CLI: E2 and thinking columns and summary sections', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-e2-'));
  const out = path.join(root, 'out');
  fs.mkdirSync(path.join(root, 'proj'));
  fs.writeFileSync(path.join(root, 'proj', 's1.jsonl'), T1 + '\n');
  const r = spawnSync(process.execPath, [path.join(here, '..', 'scripts', 'audit.mjs'), '--root', root, '--out', out, '--min-calls', '1'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const [head, row] = fs.readFileSync(path.join(out, 'sessions.csv'), 'utf8').trim().split('\n');
  const cols = head.split(',');
  assert.deepEqual(cols.slice(-5), ['tool_usd', 'dead_usd', 'think_tokens', 'out_tokens', 'think_usd']);
  const v = Object.fromEntries(cols.map((c, i) => [c, row.split(',')[i]]));
  assert.equal(Number(v.think_tokens), 10000);
  assert.equal(Number(v.out_tokens), 30000);
  close(Number(v.think_usd), 0.2, 1e-6);
  assert.ok(Number(v.tool_usd) > 0);
  assert.ok(Number(v.dead_usd) >= 0 && Number(v.dead_usd) <= Number(v.tool_usd));
  const md = fs.readFileSync(path.join(out, 'summary.md'), 'utf8');
  assert.match(md, /^## Dead tool output \(E2\)$/m);
  assert.match(md, /^## Thinking share$/m);
  assert.ok(md.split('\n').length <= 121);
});
