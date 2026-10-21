// Acceptance guard for audit X0: full prefix attribution. Every block that enters the orchestrator's prefix is
// classed (what it is and, for file traffic, where it points), sized, and priced over its lifetime, so the claim
// "most orchestrator cost is files passed around, not execution" can pass or die on one number.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prefixAttribution, attributionUsd, groupOf, x0Verdict } from '../scripts/audit.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const u = (think = 0, output = 100) => ({
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
const sz = (input) => Math.ceil(JSON.stringify(input).length / 4);

const W1 = { file_path: 'C:\\r\\.warboss-horde\\slices\\s1.md', content: 'x'.repeat(100) };
const R1 = { file_path: 'src/a.ts' };
const A1 = { prompt: 'p'.repeat(40) };
const B1 = { command: 'npm test' };
const H1 = { file_path: '.warboss-horde/out/x.txt' };
const E1 = { file_path: 'src/a.ts', old_string: 'a', new_string: 'b' };
const G1 = { pattern: '*' };
const c3 = [
  { type: 'tool_use', id: 'b1', name: 'Bash', input: B1 },
  { type: 'tool_use', id: 'h1', name: 'Read', input: H1 },
  { type: 'tool_use', id: 'e1', name: 'Edit', input: E1 },
  { type: 'tool_use', id: 'g1', name: 'Glob', input: G1 },
];

const X = [
  user('build the thing'),
  // c1 streams as two records under one message id: one call, thinking counted once from the final usage.
  asst('c1', [{ type: 'thinking', thinking: 'plan', signature: 's' }, { type: 'tool_use', id: 'w1', name: 'Write', input: W1 }], u(40)),
  asst('c1', [{ type: 'tool_use', id: 'r1', name: 'Read', input: R1 }], u(40)),
  user([{ type: 'tool_result', tool_use_id: 'w1', content: 'ok' }, { type: 'tool_result', tool_use_id: 'r1', content: 'A'.repeat(400) }]),
  asst('c2', [{ type: 'text', text: 'hello world!' }, { type: 'tool_use', id: 'a1', name: 'Agent', input: A1 }], u(0)),
  user([{ type: 'tool_result', tool_use_id: 'a1', content: 'done' }]),
  asst('c3', c3),
  user([
    { type: 'tool_result', tool_use_id: 'b1', content: 'pass' },
    { type: 'tool_result', tool_use_id: 'h1', content: [{ type: 'text', text: 'B'.repeat(80) }] },
    { type: 'tool_result', tool_use_id: 'e1', content: 'ok' },
    { type: 'tool_result', tool_use_id: 'g1', content: 'f' },
  ]),
  asst('c3', c3), // a re-emitted record: no new call, no new entries
  boundary(),
  asst('c4', [{ type: 'text', text: 'z' }]),
  'not json',
].join('\n');

test('prefixAttribution: class, size, live calls to the next compact boundary, authored flag', () => {
  assert.deepEqual(prefixAttribution(X), [
    { cls: 'user_text', sizeTokens: 4, liveCalls: 3, authored: false },
    // thinking: one entry per call whose final usage has thinking_tokens > 0, sized by that count, placed
    // before the call's first block; thinking blocks themselves add nothing.
    { cls: 'thinking', sizeTokens: 40, liveCalls: 2, authored: true },
    // Write target: backslashes normalised; under .warboss-horde/slices/ -> slices.
    { cls: 'use:Write:slices', sizeTokens: sz(W1), liveCalls: 2, authored: true },
    { cls: 'use:other', sizeTokens: sz(R1), liveCalls: 2, authored: true },
    { cls: 'result:other', sizeTokens: 1, liveCalls: 2, authored: false },
    // Read result: target taken from the matching Read tool_use; outside .warboss-horde/ -> src.
    { cls: 'result:Read:src', sizeTokens: 100, liveCalls: 2, authored: false },
    { cls: 'assistant_text', sizeTokens: 3, liveCalls: 1, authored: true },
    { cls: 'use:Agent', sizeTokens: sz(A1), liveCalls: 1, authored: true },
    { cls: 'result:Agent', sizeTokens: 1, liveCalls: 1, authored: false },
    { cls: 'use:Bash', sizeTokens: sz(B1), liveCalls: 0, authored: true },
    { cls: 'use:other', sizeTokens: sz(H1), liveCalls: 0, authored: true },
    { cls: 'use:Edit', sizeTokens: sz(E1), liveCalls: 0, authored: true },
    { cls: 'use:other', sizeTokens: sz(G1), liveCalls: 0, authored: true },
    { cls: 'result:Bash', sizeTokens: 1, liveCalls: 0, authored: false },
    // relative path under .warboss-horde/ (not slices) -> horde.
    { cls: 'result:Read:horde', sizeTokens: 20, liveCalls: 0, authored: false },
    { cls: 'result:other', sizeTokens: 1, liveCalls: 0, authored: false },
    { cls: 'result:Glob', sizeTokens: 1, liveCalls: 0, authored: false },
    { cls: 'assistant_text', sizeTokens: 1, liveCalls: 0, authored: true },
  ]);
});

test('prefixAttribution: Write targets, Task/MultiEdit aliases, duplicate text records, orphan results, images', () => {
  const text = [
    asst('d1', [
      { type: 'tool_use', id: 'w2', name: 'Write', input: { file_path: '/repo/.warboss-horde/out/r.md', content: 'q' } },
      { type: 'tool_use', id: 'w3', name: 'Write', input: { file_path: 'src/b.ts', content: 'q' } },
      { type: 'tool_use', id: 'w4', name: 'Write', input: { file_path: 'notwarboss-horde/slices/z.md', content: 'q' } },
      { type: 'tool_use', id: 't1', name: 'Task', input: { prompt: 'go' } },
      { type: 'tool_use', id: 'm1', name: 'MultiEdit', input: { file_path: 'a' } },
      { type: 'tool_use', id: 'n1', name: 'NotebookEdit', input: { notebook_path: 'a' } },
    ]),
    asst('d2', [{ type: 'text', text: 'same text' }]),
    asst('d2', [{ type: 'text', text: 'same text' }]),
    user([
      { type: 'tool_result', tool_use_id: 't1', content: 'res' },
      { type: 'tool_result', tool_use_id: 't1', content: 'res' },
      { type: 'tool_result', tool_use_id: 'nope', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'A' } }] },
    ]),
  ].join('\n');
  const got = prefixAttribution(text).map((e) => e.cls);
  assert.deepEqual(got, [
    'use:Write:horde', 'use:Write:src', 'use:Write:src', 'use:Agent', 'use:Edit', 'use:Edit',
    'assistant_text', 'result:Agent', 'result:other',
  ]);
  assert.equal(prefixAttribution(text).at(-1).sizeTokens, 1600);
});

test('attributionUsd: lifetime read+write plus output price for authored blocks, summed per class', () => {
  const got = attributionUsd([
    { cls: 'use:Write:slices', sizeTokens: 1000, liveCalls: 3, authored: true },
    { cls: 'use:Write:slices', sizeTokens: 1000, liveCalls: 0, authored: true },
    { cls: 'result:Read:src', sizeTokens: 2000, liveCalls: 1, authored: false },
  ], { r: 0.2, w: 5, out: 20 });
  assert.deepEqual(Object.keys(got).sort(), ['result:Read:src', 'use:Write:slices']);
  assert.equal(got['use:Write:slices'].n, 2);
  assert.equal(got['use:Write:slices'].tokens, 2000);
  close(got['use:Write:slices'].lifeUsd, 0.0054);
  close(got['use:Write:slices'].authUsd, 0.04);
  close(got['result:Read:src'].lifeUsd, 0.01);
  assert.equal(got['result:Read:src'].authUsd, 0);
});

test('groupOf: every class lands in exactly one group', () => {
  const g = {
    file: ['result:Read:src', 'result:Read:horde', 'use:Write:slices', 'use:Write:horde', 'use:Write:src', 'use:Edit',
      'use:Agent', 'result:Agent'],
    exec: ['use:Bash', 'result:Bash'],
    search: ['result:Grep', 'result:Glob'],
    reasoning: ['thinking', 'assistant_text'],
    user: ['user_text'],
    other: ['use:other', 'result:other'],
  };
  for (const [group, classes] of Object.entries(g)) for (const c of classes) assert.equal(groupOf(c), group, c);
  assert.equal(groupOf('something:new'), 'other');
});

test('x0Verdict: PASS at >= 40% file share, KILL below 20%, MIDDLE between', () => {
  assert.equal(x0Verdict(0.4), 'PASS');
  assert.equal(x0Verdict(0.9), 'PASS');
  assert.equal(x0Verdict(0.3999), 'MIDDLE');
  assert.equal(x0Verdict(0.2), 'MIDDLE');
  assert.equal(x0Verdict(0.1999), 'KILL');
  assert.equal(x0Verdict(0), 'KILL');
  assert.equal(x0Verdict(NaN), 'KILL');
});

test('CLI: X0 section with class table, group lines and a verdict', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-x0-'));
  const out = path.join(root, 'out');
  fs.mkdirSync(path.join(root, 'proj'));
  fs.writeFileSync(path.join(root, 'proj', 's1.jsonl'), X + '\n');
  const r = spawnSync(process.execPath, [path.join(here, '..', 'scripts', 'audit.mjs'), '--root', root, '--out', out, '--min-calls', '1'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const md = fs.readFileSync(path.join(out, 'summary.md'), 'utf8');
  assert.match(md, /^## Prefix attribution \(X0\)$/m);
  assert.match(md, /^\| class \| blocks \| tokens \| lifetime usd \| authoring usd \| total usd \| share \|$/m);
  assert.match(md, /^\| use:Write:slices \| 1 \| \d+ \| \$\d+\.\d{4} \| \$\d+\.\d{4} \| \$\d+\.\d{4} \| \d+\.\d% \|$/m);
  for (const g of ['file', 'exec', 'search', 'reasoning', 'user', 'other']) {
    assert.match(md, new RegExp(`^- group ${g}: \\$\\d+\\.\\d{4} \\(\\d+\\.\\d%\\)$`, 'm'));
  }
  assert.match(md, /^- coverage \(attributed lifetime \/ \(read\+write\)\): \d+\.\d%$/m);
  assert.match(md, /^- file share: \d+\.\d% -> (PASS|MIDDLE|KILL)$/m);
  assert.ok(md.split('\n').length <= 121);
});
