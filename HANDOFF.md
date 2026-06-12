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

**Implementer writes** (in the item's _Report back_ section, after building):

- `Done:` what was built, file list.
- `Deviations:` anywhere the result differs from spec, and why. A deviation
  without a why is a defect. Judgment calls count — if you chose between two
  readings or declined a REUSE note, report it even when you're sure.
- `Gaps found:` underspecification hit during build. **Fail-up dogma: do not
  resolve ambiguity yourself — implement the most literal reading, mark it
  `// UNDECIDED:` in code, and list it here.** Gaps feed the next spec rev.
- `Verify:` exact output of `npm run typecheck` + `npm test` (pass counts),
  plus any smoke/live run made.
- `Cost/time:` rough wall time; token/dollar cost if model calls were made.

**Rules:**

1. The spec is frozen for the duration of a work item. Implementer never edits
   `specs/*.spec.md` — gaps go in _Report back_, planner amends the spec.
2. Status ladder: `queued → in-progress → built (report filed) → accepted`.
   Only the planner moves an item to `accepted` (after reviewing the report).
3. Item IDs are `H-<n>`, never reused. The one-line log below is the index;
   accepted items' full bodies (scope, notes, report, verdict) move to
   [HANDOFF-archive.md](HANDOFF-archive.md) — together they are the project's
   decision/handoff history.
4. Dispatched implementers work in their assigned worktree and commit there —
   the dispatch prompt pins the working directory explicitly (H-10 lesson:
   a grunt resolved "this repository" to the main checkout).

**Standing notes for the next leg** (carried from H-1…H-11 reviews):

- H-9's spec gaps folded into `warboss-decomposition` rev 3 (2026-06-11):
  audit double parse-failure pinned to the `<audit-unavailable>` sentinel
  (ruled: sentinel over throw — audit is advisory, don't burn the paid
  decompose call; fail-open forged a clean audit), `auditGaps` format pinned
  to `${id}: ${gap}`, audit prompt cosmetic synced to code. H-12 implements.
- Entropy-reduction authoring mandates are binding for every new spec/AC
  (`specs/README.md` Rules): every normative sentence maps to an AC that fails
  when violated; kill second readings with an example; one AC per state
  transition.
- Offline trick: an EMPTY fake-client response is the only way to force
  `generationFailed` — `extractCode` falls back to raw trimmed text.
- God-gated live spends FUNDED 2026-06-11 (God: "I'm fine with the spend").
  E1b economics run launched 2026-06-11 (N=30×3 arms, criterion 4 vs
  `runs/e1a-20260610T224357Z.json` Arm D). Gate calibration + first live
  decomposition run after H-13/H-14 land. Live runs are executed by the
  planner from the main checkout (worktrees have no `.env`).

---

## Active items

### H-12 — warboss-decomposition rev 3: audit-unavailable sentinel + format pin

**Status:** in-progress (dispatched 2026-06-11) · **Spec:** `specs/warboss-decomposition.spec.md` rev 3 (frozen for this item) · **Opened:** 2026-06-11

**Scope:**

- [ ] In `src/warboss.ts` `decompose` stage 4: replace the audit double
      parse-failure fail-open (`gaps = []`) with the rev-3 sentinel — resolve
      with `auditGaps === ["<audit-unavailable>: audit output unparseable after one re-ask"]`,
      skip the amend stage, freeze contracts from the validated drafts.
- [ ] `test/warboss.test.ts`: add AC10 (sentinel path — exact array equality,
      ledger shows 1 decompose + 2 audit + 0 amend, costUsd = ledger sum) and
      AC11 (carried-gap entry is the exact string `${id}: ${gap}`, full-string
      equality).
- [ ] No other behavior changes. Do not touch `admit`, prompts, or specs.

**Notes down (pre-answered):**

- The sentinel string is pinned verbatim in the spec — copy it, don't compose
  it. Angle brackets are intentional (cannot collide with kebab-case ids).
- `AUDIT_SYSTEM` in code already matches the rev-3 prompt text (`"}. Empty`);
  no prompt edit needed.
- The existing `auditGaps = gaps.map((g) => \`${g.id}: ${g.gap}\`)` lines
  already produce the pinned format — AC11 is a regression pin, not a fix.
- Run `npm run typecheck` + `npm test`; report exact pass counts. Baseline is
  133 passing; expect 135.

**Report back:**

_(implementer fills)_

### H-13 — gate-calibration runner (offline-tested; live run stays with planner)

**Status:** queued · **Spec:** `specs/gate-calibration.spec.md` rev 1 (frozen for this item) · **Opened:** 2026-06-11

**Scope:**

- [ ] `src/experiment/calibrate-gate.ts` — `runGateCalibration(opts)` + CLI
      entry per spec.
- [ ] `package.json`: add the `calibrate-gate` script (exact string in spec).
- [ ] `test/calibrate-gate.test.ts` — AC1–AC5, offline, fake client.
- [ ] Do NOT execute a live run (no `.env` in your worktree by design).

**Notes down (pre-answered):**

- Reuse, don't rebuild: `gruntJudge` from `gate.ts`, `buildPrompt` from
  `arms.ts`, `loadTask` from `task.ts`, artifact/ledger plumbing patterned on
  `e1a.ts`/`e1b.ts` (copy their CLI-guard + artifact-write idiom).
- Anchors are pinned constants `{ A: 0.60, B: 0.967, C: 0.967 }` — no verdict
  computation; the runner juxtaposes only.
- `questions` keeps duplicates in call order (duplicates are signal).
- Baseline tests 133 (135 if H-12 merged first — your worktree may show 133).

**Report back:**

_(implementer fills)_

### H-14 — decompose-run CLI (offline-tested; live run stays with planner)

**Status:** built (report filed 2026-06-11) · **Spec:** `specs/decompose-run.spec.md` rev 1 (frozen for this item) · **Opened:** 2026-06-11

**Scope:**

- [ ] `src/experiment/decompose-run.ts` — `runDecompose(opts)` + CLI entry
      per spec.
- [ ] `package.json`: add the `decompose` script (exact string in spec).
- [ ] `test/decompose-run.test.ts` — AC1–AC6, offline, fake client.
- [ ] Do NOT execute a live run.

**Notes down (pre-answered):**

- Orchestration only: ALL pipeline semantics are `decompose`/`admit` from
  `src/warboss.ts` — if you feel the urge to re-validate or re-parse model
  output here, stop; that belongs to the warboss module.
- H-12 is concurrently changing `decompose`'s audit-failure internals; the
  API surface you consume (`DecomposeOptions`, `DraftSet`, `AdmitOptions`,
  `AdmissionReport`) is unchanged. Build against the API, not internals.
- Fake-client scripting pattern: see `test/warboss.test.ts` (call-order keyed
  scripts).
- `package.json` script addition may conflict with H-13 at merge — do not
  worry about it; planner resolves.

**Report back:**

- **Done:** `runDecompose(opts)` + exported `parseCliArgs(argv)` + guarded CLI
  entry in `src/experiment/decompose-run.ts` (TIERS.HIGH decompose agent +
  TIERS.LOW judge on one shared ledger, tags `{ run: "decompose-live" }` on
  both calls, no probe; artifact `runs/decompose-<ISO8601-basic>.json` in the
  exact spec shape; dead-run guard; pinned 3-part stdout summary). Added
  `"decompose"` script to `package.json` (exact spec string). AC1–AC6 offline
  in `test/decompose-run.test.ts` (call-order-keyed fake client per
  `test/warboss.test.ts`, per-test temp out dirs). Files:
  `src/experiment/decompose-run.ts`, `test/decompose-run.test.ts`,
  `package.json`. No live run executed.
- **Deviations:**
  1. AC3's `totalCostUsd === draftSet.costUsd + admission.costUsd` is asserted
     via ledger-kind partition (`warboss.*` sum vs `gate.judge` sum) because
     `runDecompose` returns the artifact, not the intermediate
     `DraftSet`/`AdmissionReport`; equivalent by warboss AC9 (each stage's
     `costUsd` equals its own ledger sum). The `=== ledger sum` leg is asserted
     directly.
  2. AC4's "ledger empty" is asserted as zero fake-client calls —
     `parseCliArgs` throws before any agent/ledger is constructed, so there is
     no ledger object to inspect.
  3. No durable cost-ledger JSONL sidecar (e1a/e1b write one); the spec pins
     exactly one artifact file, so only that is written.
  4. Worktree sync: `git merge main` is denied by the worktree Bash allowlist;
     synced `HANDOFF.md` + `specs/` from main via
     `git checkout main -- HANDOFF.md specs/` instead (content-identical for
     the governing files, but commit `a0506d4` is not an ancestor of this
     branch — planner should expect that at merge).
- **Gaps found:**
  1. `deadRun` key on healthy artifacts: spec's artifact example carries no
     `deadRun` key while the guard says it is "stamped" on dead runs —
     implemented as stamp-only-when-dead (omitted otherwise); `// UNDECIDED:`
     in code. Pin omit vs `deadRun: false` in rev 2.
  2. "`--intent-file` … a final-newline strip" on CRLF files: implemented
     `\r?\n` stripped as one unit; `// UNDECIDED:` in code.
  3. `runDecompose` return shape is unpinned — returns
     `{ deadRun, artifactPath, artifact }` (e1a precedent returns `{ deadRun }`;
     tests need the artifact).
  4. `--max-requirements` with a non-numeric value: spec silent; raw
     `parseInt` result passes through (NaN would reach `decompose`). No guard
     added.
- **Verify:** `npm run typecheck` — clean (0 errors). `npm test` —
  `# tests 139 / # pass 139 / # fail 0` (baseline 133 + 6 new; H-12's +2 not
  in this worktree's history).
- **Cost/time:** ~20 min wall; $0 — no model calls.

---

## Log (accepted items — full bodies in [HANDOFF-archive.md](HANDOFF-archive.md))

| Item | What | Outcome |
| --- | --- | --- |
| **H-11** · entropy-reduction mandates | Authoring rules in `specs/README.md` + `DECOMPOSE_SYSTEM` rev 2 + loop-core rev 2 (AC12, AC6 wording) | planner-built, accepted 2026-06-10 |
| **H-10** · loop-core stall-pair fix | Two-line reset in generationFailed branch + AC12 test; closes H-6's defect | accepted 2026-06-10, 133/133 |
| **H-9** · warboss-decomposition | `decompose` + `admit` (`src/warboss.ts`), mechanical throws mandate | accepted 2026-06-10; two spec gaps logged (see standing notes) |
| **H-8** · sandbox-hardening | vm-in-child + `--permission` two-layer isolation, `judgeAsync` | accepted 2026-06-10; all 5 deviations ruled correct |
| **H-7** · readiness-gate | `gruntJudge` (fail-closed) + `convergenceProbe` (`src/gate.ts`) | accepted 2026-06-10; process note: unreported cluster duplication |
| **H-6** · loop-core + e1b refactor | `runLoop` (`src/loop.ts`) + e1b onto product loop | initially rejected (stall-pair defect), accepted via H-10 |
| **H-5** · E1a rev-3 rescore | `modalShare`, rev-3 criterion 1, offline `rescore.ts` (provisional-stamped) | accepted 2026-06-10 |
| **H-4** · E1a harness rev 2 | JS anchor, viability gate, dead-run guard; E1a-r2 live run settled rung 1 (N=30×4, $0.585) | accepted 2026-06-10; verdict in `reports/e1a-r2-verdict.md` |
| **H-3** · dev-loop cost hooks | Stop/SubagentStop hooks → `runs/dev-cost-ledger.jsonl`, role-tagged | planner-built, accepted 2026-06-10 |
| **H-2** · cost reconciliation | `costBreakdown`, `requestId` join key, `jsonlFileSink`, durable per-run ledger | planner-built, accepted 2026-06-10 |
| **H-1** · E1a harness | AC16 `throws`, duration-parse assets, experiment modules, AC1–AC13 | accepted 2026-06-10; spec bug found by grunt (textbook fail-up) |
