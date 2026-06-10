# HANDOFF — the relay between ranks

> The adjacency rule applied to our own workflow. The planner (high tier) writes
> a work item here pointing at a frozen spec; the implementer (lower tier) builds
> to the spec and writes its report back in the same item. Neither rank edits the
> other's section. This file is the only channel — no side instructions.

## Protocol

**Planner writes** (before handoff):

- One work item per change set, pointing at the spec(s) that govern it.
- Scope checklist — concrete deliverables, no interpretation latitude.
- Pre-answered questions ("notes down") — anything the spec doesn't carry but
  the implementer might trip on.

**Implementer writes** (in the item's *Report back* section, after building):

- `Done:` what was built, file list.
- `Deviations:` anywhere the result differs from spec, and why. A deviation
  without a why is a defect.
- `Gaps found:` underspecification hit during build. **Fail-up dogma: do not
  resolve ambiguity yourself — implement the most literal reading, mark it
  `// UNDECIDED:` in code, and list it here.** Gaps feed the next spec rev.
- `Verify:` exact output of `npm run typecheck` + `npm test` (pass counts),
  plus any smoke/live run made.
- `Cost/time:` rough wall time; token/dollar cost if model calls were made.

**Rules:**

1. The spec is frozen for the duration of a work item. Implementer never edits
   `specs/*.spec.md` — gaps go in *Report back*, planner amends the spec.
2. Status ladder: `queued → in-progress → built (report filed) → accepted`.
   Only the planner moves an item to `accepted` (after reviewing the report).
3. Item IDs are `H-<n>`, never reused. Completed items stay in the log below —
   this file is also the project's decision/handoff history.

---

## Active items

### H-1 · Build the E1a harness — `queued`

**Spec:** [specs/e1a-harness.spec.md](specs/e1a-harness.spec.md) (governing) +
[specs/membrane-core.spec.md](specs/membrane-core.spec.md) AC16 (amendment to
implement first).

**Scope checklist:**

- [ ] AC16 in `src/contract.ts` + `src/runner.ts` (`ContractCase.throws?: true`;
      hash participation; judge passes a throws-case on `{ok:false}`). Tests in
      `test/contract.test.ts` + `test/runner.test.ts`.
- [ ] `tasks/duration-parse/` — `requirement.md`, `task.json`,
      `hidden-battery.json`. Content **verbatim** from the spec's
      "Duration-parse canon" section — do not invent cases.
- [ ] `src/experiment/task.ts` — `loadTask`, asset validation,
      `auditNoContamination`.
- [ ] `src/experiment/arms.ts` — `ArmId`, `E1A_SYSTEM`, `armSpec`, `buildPrompt`.
- [ ] `src/experiment/analysis.ts` — `cluster`, `splits`, `evaluateCriteria`
      (pure, no I/O).
- [ ] `src/experiment/e1a.ts` — `runE1a(opts)` with injectable `MessagesClient`
      + thin CLI (`--n --arms --task --out`).
- [ ] `test/e1a.test.ts` — AC1–AC13, offline, fake client.
- [ ] Green: `npm run typecheck` && `npm test`.

**Notes down (planner → implementer):**

- Existing primitives are DONE — wire them, do not rebuild or modify (except
  the AC16 amendment): `models.ts`, `cost.ts`, `contract.ts`, `sandbox.ts`,
  `runner.ts`, `agent.ts`. Read `test/agent.test.ts` for the fake-client
  pattern before writing `test/e1a.test.ts`.
- Build order that avoids rework: AC16 first (assets depend on `throws`),
  then assets, then `task.ts` → `arms.ts` → `analysis.ts` → `e1a.ts`, tests
  red→green alongside each.
- `judge` already handles hidden batteries (`battery` passed → non-revealing
  feedback default). E1a is single-shot: feedback is never shown to anyone;
  granularity is irrelevant here.
- Arm C's partial contract is for **prompt injection only**; ALL grading uses
  the full grader contract + `expectedHash`. Don't grade against the partial.
- `repeat-units` ("30m30m") and `whitespace` (" 1h 30m ") cases: the canon's
  expected values are in the spec table — trust the table over your own
  parse of the canon prose if they ever seem to disagree (they don't).
- Do NOT run the live experiment (`npm run e1a` with a key). Offline green is
  the deliverable; the live N=30 run is a planner/God decision (it spends money).
- TypeScript is strict + `"type": "module"`, imports carry `.ts` extensions
  (tsx runtime) — match the existing style in `src/`.

**Report back (implementer → planner):**

- Done:
- Deviations:
- Gaps found:
- Verify:
- Cost/time:

---

## Log (accepted items)

*(none yet)*
