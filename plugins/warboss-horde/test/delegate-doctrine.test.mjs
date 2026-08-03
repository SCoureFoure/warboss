// Regression guard for the delegate skill's PREWORK doctrine — the two additive
// pieces that sit before any dispatch:
//
//   A. fog register    — "stateable, not answerable"; what you cannot yet state
//                        sharply is registered as fog, never pre-sliced into a
//                        contract, and it acquires no durable artifact.
//   B. none-conversion — `none` is not terminal; research / prototype /
//                        groundwork convert it, then it is re-classified.
//
// Prose has no compiler, so the membrane for a SKILL.md change is the one
// `.warboss-horde/slices/skill-file-protocol.md` established: grep the
// load-bearing strings, and pin the heading list so an "improvement" cannot
// silently restructure the loop. Both slice contracts live in
// `.warboss-horde/slices/`.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const skillPath = path.resolve(here, '..', 'skills', 'delegate', 'SKILL.md');
const skill = fs.readFileSync(skillPath, 'utf8').replace(/\r\n/g, '\n');

/**
 * Collapse whitespace before matching a phrase. Doctrine is hard-wrapped prose:
 * without this, an assertion passes or fails on where a paragraph happens to
 * wrap, which has nothing to do with what the doctrine says.
 */
const flat = (s) => s.replace(/\s+/g, ' ');
const flatSkill = flat(skill);

/** The loop's phases, in order. Additive doctrine must not add or rename one. */
const EXPECTED_HEADINGS = [
  '## Step 0 — Build the ladder from config (do this first, every session)',
  "## Step 0.5 — Is there a membrane? (classify each slice's verify_kind)",
  '## Step 1 — Cut the task into the smallest independent slices (always, before tiering)',
  '## Step 2 — Tier each slice (set its rung by its residual entropy)',
  '## Step 3 — Author the entropy out (the expensive, non-delegable part)',
  '## Step 4 — Dispatch at the chosen model',
  '## Step 5 — Judge mechanically (you own the membrane; the runner runs it)',
  '## Step 6 — Diagnose the cause, then retry with feedback, bounded',
  '## Step 7 — Metering (mostly automatic)',
  '## The ops rule (delegation does not end when the build ends)',
  '## Context hygiene (the multiplier on every future call)',
  '## The one invariant',
];

/** Text of one step, whitespace-flattened, by index into EXPECTED_HEADINGS. */
function step(i) {
  const from = skill.indexOf(EXPECTED_HEADINGS[i]);
  const to = i + 1 < EXPECTED_HEADINGS.length ? skill.indexOf(EXPECTED_HEADINGS[i + 1]) : skill.length;
  return flat(skill.slice(from, to));
}

const STEP_0_5 = 1;
const STEP_1 = 2;

test('structure: the phase list is unchanged (prework is additive, not a new rung)', () => {
  const headings = skill.split('\n').filter((l) => l.startsWith('## '));
  assert.deepEqual(headings, EXPECTED_HEADINGS);
});

test('A: fog register — the sharpness gate', () => {
  assert.ok(flatSkill.includes('stateable, not answerable'), 'fog gate phrase missing');
  assert.ok(flatSkill.includes('Pre-slicing fog'), 'the named failure mode is missing');
  assert.ok(flatSkill.includes('## Fog'), 'the fog section is not named');
  assert.ok(flatSkill.includes('index, not a store'), 'state-file index discipline missing');
});

test('A: fog is a working set, so graduated lines are evicted', () => {
  // The miss this replaced: fog lived in a STATE.md that was born immortal —
  // append-only, read every session, with no event that ended it.
  assert.ok(
    flatSkill.includes('working set, not a record'),
    'the working-set/record distinction is what bounds the fog list'
  );
  assert.ok(
    flatSkill.includes('delete the line'),
    'graduated fog must be evicted, or the list only ever grows'
  );
});

test('A: fog is portable — both host-repo cases are answered', () => {
  // The plugin installs standalone. Most host repos have no per-effort work
  // item, so the doctrine must say where fog goes when there is nothing to hang
  // it on — otherwise an agent improvises a file and recreates the immortal
  // artifact this rule exists to prevent.
  const s = step(STEP_1);
  assert.ok(
    s.includes('The repo opens a work item per effort'),
    'the has-a-work-item case must be stated'
  );
  assert.ok(
    s.includes('The repo has no such item'),
    'the no-work-item fallback must be stated — it is the common case'
  );
  assert.ok(
    s.includes('hand it back to the user when the session ends'),
    'without an artifact, fog must survive via the Leader'
  );
  assert.ok(
    s.includes('Do **not** invent a fog file'),
    'the improvise-a-file failure must be named and forbidden'
  );
  assert.ok(
    !s.includes('here, a `HANDOFF.md`'),
    'an ambiguous "here" reads as the host repo once installed elsewhere'
  );
});

test('A: fog acquires no durable home of its own', () => {
  // A work item already is the plan-of-record and verdicts.jsonl already owns
  // verdicts. The pre-existing Context-hygiene bullet may still name a state
  // file generically for shedding at phase boundaries — that resident predates
  // this slice and is not ours to evict.
  assert.ok(!step(STEP_1).includes('STATE.md'), 'fog must not be routed to a standalone state file');
  assert.ok(
    !flatSkill.includes('## Decisions') && !flatSkill.includes('## Verdicts'),
    'decisions belong to the work item and verdicts to verdicts.jsonl'
  );
});

test('A: fog is registered during cutting, not made a phase of its own', () => {
  assert.ok(step(STEP_1).includes('stateable, not answerable'), 'fog gate must sit inside Step 1');
});

test('B: none-conversion — the three routes and the re-classify requirement', () => {
  assert.ok(flatSkill.includes('`none` is never a terminal state'), 'lead-in missing');
  assert.ok(flatSkill.includes('re-classify the slice'), 're-classification requirement missing');
  for (const route of ['**research**', '**prototype**', '**groundwork**']) {
    assert.ok(flatSkill.includes(route), `route ${route} missing`);
  }
  assert.ok(
    flatSkill.includes('.warboss-horde/out/'),
    'research findings must be confined to .warboss-horde/out/'
  );
});

test('B: conversion does not waive the membrane rule it sits under', () => {
  // The pre-existing prohibitions must survive verbatim — the routes produce a
  // membrane, they never authorise dispatching a slice that lacks one.
  assert.ok(
    flatSkill.includes('A dispatch with no membrane is an authoring defect.'),
    'the prohibition the routes must not overturn was removed or reworded'
  );
  const gate = 'Only `test` (and `visual`, with you as judge) slices proceed.';
  assert.ok(flatSkill.includes(gate), 'the proceed-gate was removed or reworded');

  // ...and the routes must be stated BEFORE that gate, so the gate still reads
  // as the closing condition of the whole classification step.
  assert.ok(
    flatSkill.indexOf('`none` is never a terminal state') < flatSkill.indexOf(gate),
    'conversion block must precede the proceed-gate'
  );
});

test('B: escalation survives as the terminal move for a genuine judgement call', () => {
  const s = step(STEP_0_5);
  assert.ok(
    s.includes('escalate to') && s.includes('the one invariant'),
    'the routes must not replace escalation as the terminal move'
  );
});
