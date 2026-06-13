# Spec — probe signature (task-asset signature threaded to the intent probe)

> Status: active · rev 1 · Feature: probe-signature · Added: 2026-06-13 · Maps to: Lever 1 (gate, behavioral line) + E3 rev-2 (the H-20 fail-up).
> Source of truth for closing the H-20 textbook fail-up recorded in
> `reports/e3-verdict.md` §5.3 and the HANDOFF standing notes: the E3 probe
> prompt format is `Implement: ${entry}${signature}`, but no asset carries a
> per-function signature — `loadTask`'s `TaskDef` has none, and the warboss
> `RequirementDraft.signature` belongs to the AUTHOR arm and cannot cross to the
> probe arm (instrument independence). The H-20 grunt correctly fail-upped:
> `signature = ""`, `// UNDECIDED:` in `src/experiment/e3.ts:211`. This spec
> resolves the gap by giving the TASK asset an optional signature and threading
> it to the probe — the probe states the function shape it must implement
> without leaking any contract or example.
> Depends on: `specs/e1a-harness.spec.md` (task-asset shape this extends),
> `specs/e3-intent-divergence.spec.md` (the probe-prompt format this fills),
> `specs/readiness-gate.spec.md` rev 2 (`intentProbe`, unchanged here).

## Requirement

The task asset (`tasks/<task>/task.json`) may carry an optional top-level
`signature` string (a JS type signature such as `"(input: string) => number"`).
`loadTask` surfaces it on `TaskDef.signature` (a `string`, defaulting to `""`
when the asset omits it — full back-compat). The E3 probe arm builds its prompt
as the task prose plus the exact line `Implement: ${entry}${signature}` using
`task.signature`, replacing the blessed-empty placeholder. The signature is the
ONLY structural hint the probe receives: still no contract, no examples, no
expected outputs. Every existing offline test passes unmodified when no asset
declares a signature.

## Constraints (inherited)

- **Hidden battery never leaks.** A signature is a TYPE shape only — it carries
  no input values and no expected outputs, so it cannot leak a hidden case. The
  probe prompt remains free of `===` example lines and the word `contract`
  (E3 AC8 is preserved, now with a non-empty signature).
- **Grunt is a doer, not a planner.** Unchanged — `intentProbe` still issues one
  `Agent.generate` per generation; this spec only changes what string the prompt
  carries.
- **Cost-metered.** No new model call; no cost surface change.

## Decisions (pinned 2026-06-13)

- **Asset field is optional, default `""`.** `RawTask` gains
  `signature?: string`. `loadTask` sets `TaskDef.signature = taskRaw.signature ?? ""`.
  When present it MUST be a string; a non-string `signature` in `task.json` →
  descriptive throw from `loadTask` (same fail-fast posture as the other asset
  validations). Absent → `""`, and `Implement: ${entry}${signature}` collapses
  to `Implement: ${entry}` — byte-identical to today's blessed behavior.
- **TaskDef placement.** `signature` is a top-level `TaskDef` field, NOT on the
  grader `Contract` (the `Contract` canonical form is unchanged — adding a field
  there would alter every existing hash). It is task metadata for the probe arm,
  parallel to `prose`.
- **E3 consumes it.** `src/experiment/e3.ts` replaces the two `// UNDECIDED:`
  lines and `const signature = ""` with `const signature = task.signature;`. The
  probe prompt is `task.prose + "\n" + \`Implement: ${entry}${signature}\``
  unchanged in shape. No other e3 logic changes.
- **duration-parse asset gets a signature.** `tasks/duration-parse/task.json`
  gains `"signature": "(input: string) => number"` (matches the grader entry
  `parseDuration` taking a string, returning seconds). This makes the live E3
  re-run carry a real signature; the value is pinned here so it is reviewable.
- **Scope fence.** This spec does NOT change `intentProbe` (it already takes a
  finished `prompt`), does NOT change the author arm, and does NOT alter the E3
  criterion, needle lists, or candidate inputs (those are e3-needle-matcher's
  and e3's own concerns). It is the prompt-string source only.

## Acceptance criteria (Given / When / Then)

1. **AC1 — loader surfaces signature.** A `task.json` with
   `"signature": "(input: string) => number"` → `loadTask(dir).signature ===
   "(input: string) => number"`. A `task.json` with no `signature` key →
   `loadTask(dir).signature === ""` (and every other `TaskDef` field unchanged).
2. **AC2 — loader validates type.** A `task.json` whose `signature` is a number
   (or any non-string) → `loadTask` throws a descriptive error naming the field;
   no `TaskDef` returned.
3. **AC3 — probe prompt carries the signature.** With the duration-parse asset
   carrying the pinned signature, the E3 probe arm's prompt ends with the exact
   line `Implement: parseDuration(input: string) => number` (capture-assert),
   and STILL contains neither the word `contract` nor any `===` example line
   (E3 AC8 preserved with a non-empty signature).
4. **AC4 — empty-signature back-compat.** A task whose asset omits `signature` →
   the probe prompt's last line is exactly `Implement: <entry>` (no trailing
   junk), byte-identical to the pre-rev behavior; the existing e3 offline test
   (which uses a no-signature fixture, if any) passes unmodified.
5. **AC5 — asset value pinned.** `tasks/duration-parse/task.json` contains
   `"signature": "(input: string) => number"` (grep-assertable), and `loadTask`
   over the real asset returns that string.

## Verifies-with

- Tests: `test/task.test.ts` — AC1, AC2, AC5 (loader). `test/e3.test.ts` — AC3,
  AC4 (probe-prompt shape), beside the existing E3 cases. Offline, fake client.
- Integration: folded into the next live E3 re-run (no separate spend) — the
  probe prompt will carry the real signature; confirm in the run artifact's
  captured prompt that the `Implement:` line includes the signature.
- Falsifies / experiment link: n/a (instrument-hygiene fix). It removes the one
  open `// UNDECIDED:` from the E3 runner so a future E3 verdict reads the probe
  arm as fully decided; whether a signature changes the nonviable rate is
  `specs/intent-probe-viability.spec.md`'s question, not this one's.
