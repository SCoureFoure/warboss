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

**Standing notes for the next leg** (carried from H-12…H-14 reviews + the
three funded live runs of 2026-06-11):

- **E1b criterion 4: FAIL as measured** (`reports/e1b-verdict.md`). Loop is
  fine (green 1.00 @ ~1.1 attempts, 9.5× cheaper per green); the hidden-score
  plateau (0.750 vs Arm D 0.8167) is contract authoring debt — Corollary D
  measured. `passfail` feedback is dead (green 0.07). Cheap re-run ($0.10)
  with a denser contract doubles as the first E2 data point.
- **Gate calibration: cheap judge fails as gate**
  (`reports/gate-calibration-verdict.md`). READY anti-correlates with anchors
  (A 0.85 vs B 0.70 vs C 1.00 against 0.60/0.967/0.967); judge misses
  Corollary-D holes (C: 20/20 READY, 0 questions). Probe stays mandatory;
  judge-prompt rework candidate: "enumerate inputs whose output you cannot
  derive" instead of declaring readiness; MID-tier comparison cheap.
- **First live decomposition succeeded**
  (`runs/decompose-20260612T022857Z.json`, $0.26): 6 requirements, all carry
  throws examples (mandate held), auditGaps 0, 5 admitted, 1 kicked back with
  a genuine catch (tags '#'-strip ambiguity). Substrate works end-to-end.
- Spec gaps for rev 2s (all planner defects, from H-13/H-14 reports):
  gate-calibration — cwd-relative `loadTask` path, unpinned return type;
  decompose-run — `deadRun` key on healthy artifacts (omit vs `false`), CRLF
  final-newline strip, `runDecompose` return shape, `--max-requirements` NaN
  guard. Also harmonize the cost-ledger JSONL sidecar ruling (H-13 wrote one
  per notes-down, H-14 omitted it per spec-literal — both accepted, pin one).
- Entropy-reduction authoring mandates are binding for every new spec/AC
  (`specs/README.md` Rules): every normative sentence maps to an AC that fails
  when violated; kill second readings with an example; one AC per state
  transition.
- Offline trick: an EMPTY fake-client response is the only way to force
  `generationFailed` — `extractCode` falls back to raw trimmed text.
- Tooling: npm eats `--flags` on Windows — invoke live runners directly
  (`node --env-file=.env --import tsx <script> --flags`). Worktree grunts
  cannot `git merge` (permission layer) — they sync via
  `git checkout main -- <paths>`; expect merge-identical, not fast-forward.
  H-12's grunt left an rtk shim at `C:\Users\SCora\bin\rtk` (outside repo) —
  God may delete if unwanted.

---

## Active items

### H-15 · E2 contract-authorship runner — `queued`

**Spec (frozen):** [e2-contract-authorship.spec.md](specs/e2-contract-authorship.spec.md) rev 1.
**Worktree:** your assigned worktree only — never the main checkout (rule 4).

**Scope checklist:**

- `src/experiment/e2.ts`: `runE2(opts)` + CLI entry guarded like `e1b.ts`.
  Two contract sources (`human` = `task.grader`, `warboss` = reconstructed
  from a decompose artifact), N sessions each via `runLoop`, hidden-battery
  post-scoring, coverage split (happy/error by `throws`), pre-registered E2
  criterion (warboss ≥ 0.90 × human hidden score), separate
  authoring/grinding cost fields, dead-run guard, timestamped artifact +
  jsonl cost log.
- Export `formatContractSection` from `src/experiment/arms.ts` (only change
  to that file) and reuse it; reuse `analyzeE1bArm` + `SessionRecord` from
  `e1b.ts`, `runLoop`, `judge`, `loadTask`, `auditNoContamination`,
  `GRUNT_DOGMA`. No loop logic of your own.
- `test/e2.test.ts`: AC1–AC10, offline, fake client + a fixture decompose
  artifact written into a temp `out` dir.
- `package.json`: add `"e2": "node --env-file=.env --import tsx src/experiment/e2.ts"`.

**Notes down:**

- Reconstruct the warboss contract by re-freezing the artifact's single
  requirement and ASSERT its hash equals the artifact's recorded
  `contracts[0].hash` — mismatch throws. Exactly-one-requirement rule.
- Entry names may differ between sources and that is correct — score each
  arm's hidden battery through its OWN contract's entry. Do not "fix" a
  mismatch (spec "Entry-name independence").
- `meanErrorScore` is `null` (not 0) when a task's hidden battery has no
  error-path case.
- npm eats `--flags` on Windows — the CLI is invoked via `node` directly;
  test the CLI path accordingly (do not rely on `npm run e2 -- --flag`).
- Worktree grunts cannot `git merge` (permission layer) — sync planner files
  via `git checkout main -- <paths>` if needed; commit in your worktree.

### H-16 · gate-judge derive-check + calibration runner — `queued`

**Spec (frozen):** [gate-judge-derive.spec.md](specs/gate-judge-derive.spec.md) rev 1.
**Worktree:** your assigned worktree only — never the main checkout (rule 4).

**Scope checklist:**

- `src/gate.ts`: add `deriveCheck(opts)` beside `gruntJudge` — mechanical
  DECIDED/UNDECIDED enumeration instrument, fail-closed, shares the
  API-attempt/parse skeleton. Pinned system string + parse rules in spec.
- `src/experiment/calibrate-derive.ts`: `runDeriveCalibration(opts)` + CLI
  entry — near-clone of `calibrate-gate.ts`, calls `deriveCheck`, reports
  per-config DECIDED rate + enumerated underivable inputs vs the pinned r2
  anchors, dead-run guard, timestamped artifact + jsonl cost log.
- `test/gate.test.ts`: AC1–AC4 (beside the `gruntJudge` cases).
  `test/calibrate-derive.test.ts`: AC5–AC9. Offline, fake client.
- `package.json`: add `"calibrate-derive": "node --env-file=.env --import tsx src/experiment/calibrate-derive.ts"`.

**Notes down:**

- `deriveCheck` is the gate-calibration FAIL rework: enumeration (recall),
  NOT confidence (`gruntJudge`). Do not collapse the two — keep both
  instruments exported.
- Bullets are harvested ONLY under an `UNDECIDED` first line (AC4 kills the
  "always harvest bullets" reading). `DECIDED` → `undecided: []` regardless of
  trailing bullets.
- The runner computes NO pass/fail — it juxtaposes DECIDED rate + enumerated
  inputs against `{ A: 0.60, B: 0.967, C: 0.967 }`; interpretation is human.
- npm eats `--flags` on Windows — CLI invoked via `node` directly.
- Worktree grunts cannot `git merge` — sync via `git checkout main -- <paths>`,
  commit in your worktree.

> **Parallel-dispatch note (planner):** H-15 and H-16 both add one line to
> `package.json` scripts and both add test files — expect a trivial
> `package.json` scripts-block merge conflict, resolved by the planner at
> merge. No other overlap (H-15 touches `e2.ts`/`arms.ts`; H-16 touches
> `gate.ts`/`calibrate-derive.ts`).

---

## Log (accepted items — full bodies in [HANDOFF-archive.md](HANDOFF-archive.md))

| Item | What | Outcome |
| --- | --- | --- |
| **H-14** · decompose-run CLI | `runDecompose` + `decompose` script (`src/experiment/decompose-run.ts`), AC1–AC6 | accepted 2026-06-11; 4 spec gaps → decompose-run rev 2 (see standing notes) |
| **H-13** · gate-calibration runner | `runGateCalibration` + `calibrate-gate` script, AC1–AC5 | accepted 2026-06-11; 2 spec gaps → gate-calibration rev 2; live verdict in `reports/gate-calibration-verdict.md` |
| **H-12** · audit-unavailable sentinel | rev-3 sentinel in `decompose` stage 4 + AC10/AC11 (`src/warboss.ts`) | accepted 2026-06-11, 135/135; stale-worktree lesson → rule 4 |
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
