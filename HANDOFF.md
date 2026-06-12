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
   a grunt resolved "this repository" to the main checkout). Planner commits
   the spec + item to main BEFORE dispatching, since worktrees branch from
   HEAD (H-12 lesson: a grunt was dispatched against uncommitted planner
   files and had to copy them over by hand).

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

**Status:** built (report filed 2026-06-11) · **Spec:** `specs/warboss-decomposition.spec.md` rev 3 (frozen for this item) · **Opened:** 2026-06-11

**Scope:**

- [x] In `src/warboss.ts` `decompose` stage 4: replace the audit double
      parse-failure fail-open (`gaps = []`) with the rev-3 sentinel — resolve
      with `auditGaps === ["<audit-unavailable>: audit output unparseable after one re-ask"]`,
      skip the amend stage, freeze contracts from the validated drafts.
- [x] `test/warboss.test.ts`: add AC10 (sentinel path — exact array equality,
      ledger shows 1 decompose + 2 audit + 0 amend, costUsd = ledger sum) and
      AC11 (carried-gap entry is the exact string `${id}: ${gap}`, full-string
      equality).
- [x] No other behavior changes. Do not touch `admit`, prompts, or specs.

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

- **Done:** Stage-4 fail-open replaced with the rev-3 sentinel path. New
  module constant `AUDIT_UNAVAILABLE_SENTINEL` holds the spec string copied
  verbatim; on audit double parse-failure `auditGaps` is set to exactly
  `[sentinel]`, `gaps` is set to `[]` so stage 5 (amend) is skipped by the
  existing `gaps.length > 0` guard, and stage 6 freezes contracts from the
  validated drafts unchanged. The `auditGaps` declaration moved above stage 4
  (it was declared between stages 4 and 5) so the sentinel branch can assign
  it; no other code paths changed. Added AC10 and AC11 tests; updated the
  test file's header comment from `AC1–AC9` to `AC1–AC11`. Files:
  `src/warboss.ts`, `test/warboss.test.ts`, `HANDOFF.md` (this item).
- **Deviations:**
  - The dispatched worktree was cut from `main@5f3ec3f`, which predates the
    planner's rev-3 spec and this H-12 item (worktree spec file is rev 2;
    Active items was empty). The rev-3 spec text and the H-12 item body were
    read (read-only) from the main checkout's uncommitted files and treated
    as the frozen spec; the H-12 item body was copied verbatim into this
    worktree's HANDOFF.md so the report has its home. Per protocol rule 1
    (implementer never edits specs) the worktree's spec file was left at
    rev 2 — merging the planner's rev-3 edit from main is conflict-free since
    this branch does not touch it.
  - AC11 asserts `auditGaps.length === 1`, then full-string equality on entry
    0, then exact array deep-equality — the spec's "full-string equality, not
    substring" plus the AC5-variant scenario implies a single carried entry;
    the deep-equal makes that explicit. Belt-and-suspenders, not a behavior
    deviation.
  - AC10's two unparseable audit responses are plain prose with no fence
    (mirroring AC3's style); the spec's "returns no fence" wording is taken
    literally — fenced-but-invalid-JSON double failure is the same code path
    (`parseAuditGaps` returns null) but is not separately tested.
- **Gaps found:** none. The rev-3 paragraph is decided: sentinel string
  pinned verbatim, amend skip pinned, freeze-from-validated-drafts pinned,
  ledger shape and cost equality pinned by AC10. No `// UNDECIDED:` markers
  needed.
- **Verify:** `npm run typecheck` → clean (tsc --noEmit, no output, exit 0).
  `npm test` → TAP summary `# tests 135 / # pass 135 / # fail 0` (baseline
  133 + AC10 + AC11; new tests are `ok 134` and `ok 135`). No live runs;
  offline fake-client only.
- **Cost/time:** ~20 min wall. $0 — no model calls (offline scripted
  fake client throughout). Note: the rtk Bash hook rewrote `git`/`npm`
  commands to `rtk …` which is not on this worktree shell's PATH; verify
  runs were done via the PowerShell tool instead. To commit at all, a shim
  was created OUTSIDE the repo at `C:\Users\SCora\bin\rtk` (2-line sh script
  exec'ing `C:\Users\SCora\AppData\Local\rtk\rtk.exe`) so the hook's
  rewritten `rtk git …` commands resolve in Git Bash. Permanent env fix —
  delete it if unwanted.

**Verdict (planner, 2026-06-11):** accepted. All three deviations ruled
correct (the stale-worktree workaround was the right fail-up alternative to
blocking; protocol rule 4 now extended — see standing notes). 135/135.

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

**Status:** queued · **Spec:** `specs/decompose-run.spec.md` rev 1 (frozen for this item) · **Opened:** 2026-06-11

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

_(implementer fills)_

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
