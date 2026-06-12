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
- Spec gaps for rev 2s (all planner defects, from H-13/H-14/H-15/H-16 reports):
  gate-calibration / calibrate-derive — cwd-relative `loadTask` path, unpinned
  `runGateCalibration`/`runDeriveCalibration` return type (pin `{ deadRun }`);
  decompose-run — `deadRun` key on healthy artifacts (omit vs `false`), CRLF
  final-newline strip, `runDecompose` return shape, `--max-requirements` NaN
  guard; ~~e2 — `analyzeE1bArm` cast~~ → folded into e2 spec rev 2 / H-17
  (`AnalyzableSession` structural loosening).
- **Cost-ledger JSONL sidecar — RULING PINNED (H-16):** every experiment runner
  writes ONE `cost-ledger-<ts>.jsonl` alongside its `<run>-<ts>.json` artifact
  (e1b, calibrate-gate, calibrate-derive, e2 all do). Resolves the H-13/H-14
  inconsistency; decompose-run rev 2 should adopt the sidecar.
- **Worktree branch-point lesson (H-15/H-16):** the Agent worktree isolation
  branched both grunts from the SESSION-START HEAD (`842a753`), NOT from the
  planner's post-dispatch spec commit (`3ca4329`) — so committing the spec to
  main before dispatch did NOT place it at worktree HEAD (rule 4's premise is
  weaker than assumed). Both grunts recovered cleanly via
  `git checkout main -- <spec paths>` (byte-identical → merges clean). Standing
  defense: dispatch prompts must instruct the grunt to `git checkout main --`
  its spec/HANDOFF paths at start; do not assume the spec is at worktree HEAD.
- Entropy-reduction authoring mandates are binding for every new spec/AC
  (`specs/README.md` Rules): every normative sentence maps to an AC that fails
  when violated; kill second readings with an example; one AC per state
  transition.
- **All 2026-06-12 live spends complete (total $0.468).** Results:
  - **E2 MEASURED (attempt 2, post-H-17): criterion FAIL 0.667 < 0.700, but
    the error path fully closed** (`reports/e2-verdict.md`, attempt-2 section;
    artifact `runs/e2-20260612T142157Z.json`, $0.227 grinding + $0.163
    authoring). Warboss `meanErrorScore` **1.000 vs human 0.000** — the sharp
    prediction held; Corollary-D error debt is solved by machine authoring.
    The FAIL is two deterministic (0/30) happy-path **ambiguity-resolution
    divergences**: bare-number `"120"` (warboss never pinned it; human pins
    `"90"→90`) and whitespace `" 1h 30m "` (warboss pins throws; battery says
    accept). Both were derivable as "intent does not decide this" — and
    `admit` passed the contract with **0 questions**: third independent datum
    the cheap-judge admission line is blind (gruntJudge, deriveCheck, now
    admit-in-anger). Pre-registered consequence narrowed: warboss needs an
    **underdetermined-semantics kick-back pass** (not adversarial example
    generation — error coverage is already perfect). `decimal-hours` fails for
    BOTH sources (neither contract decides it) — battery design note for any
    rev 3. Attempt 1 (same day, rev 1) aborted on contamination; the
    residual-battery fix is H-17, spec rev 2.
  - **derive-calibration: FAIL as gate**
    (`reports/derive-calibration-verdict.md`, $0.0778). `decidedRate` 0.000 on
    ALL configs (metric saturates — one hole flips a run UNDECIDED); worse,
    precision broken: config B pins `parseDuration("90") === 90` in-prompt yet
    deriveCheck flags bare-number underivable 20/20 (false positive), while
    config A — where the hole is REAL — flags it only 2/20. Mirror pathology
    of gruntJudge (over-confident, 0 recall) vs deriveCheck (over-skeptical,
    low precision). **Cheap-judge gate line shelved by default (two FAILs);
    probe stays mandatory.** Open option if God wants one more datum: MID-tier
    comparison (~$0.10) before burying it; rev-2 instrument ideas in the
    verdict (hole-level matrix metric, subtract-pinned-set prompt).
- **decompose-run rev 2 gap list grew:** `--max-requirements` is a
  post-validation cap only — never surfaced into the decompose prompt
  (`warboss.ts:306`), so the model freely split duration-parse into 6 reqs and
  the run fail-closed. Workaround used: `--context` SCOPE CONSTRAINT demanding
  one atomic requirement. Rev 2 should inject the cap into the prompt.
  (Joins the 4 H-14 gaps + jsonl-sidecar adoption already queued above.)
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

> **Leg 6 — the kick-back leg** (specs authored 2026-06-12 by the top tier,
> handed to the planner for dispatch). Design ruling behind all three items:
> the E2 measurement proved post-freeze instruments cannot detect fiat
> resolutions (every per-case rate 0/30 or 30/30 — the freeze destroys the
> divergence), and introspective judges are triple-falsified. The kick-back
> therefore moves to the AUTHOR tier, pre-freeze: the warboss must REPORT
> the choices intent didn't force (H-18), and prose-level behavioral
> divergence becomes the mechanical detector (H-19). E3 (H-20) is the
> falsification experiment for both. Planner: dispatch H-18 ∥ H-19 in
> parallel worktrees (no file overlap), H-20 only after both merge.

### H-18 · warboss-decomposition rev 4 — fiat-flagging + escalations + probe-only admission — `queued`

**Spec (frozen):** [warboss-decomposition.spec.md](specs/warboss-decomposition.spec.md) rev 4.
**Worktree:** your assigned worktree only — never the main checkout (rule 4).
At session start, `git checkout main -- specs/warboss-decomposition.spec.md HANDOFF.md` (worktrees branch from session-start HEAD; do not assume the spec is at worktree HEAD).

**Scope checklist:**

- `src/warboss.ts`:
  - `Resolution` type + `resolutions` field on `RequirementDraft` (mandatory,
    shape-checked in stage-3 validation; empty array legal).
  - `DECOMPOSE_SYSTEM` rev-4 text (exact string in spec) + requirement-cap
    line injected into the decompose user prompt (exact line in spec).
  - `AUDIT_SYSTEM` rev-4 text (exact string in spec); audit user prompt now
    carries `Original intent:` + the intent; gap entries gain
    `intentDecides` with the fail-closed parse rule (non-boolean → false).
  - Gap routing: amendable → amend (unchanged); intent-undecided → NEVER
    amended, → `escalations`. `DraftSet.escalations` with the two pinned
    entry formats + pinned ordering (fiat first).
  - `admit` rework: `AdmitOptions.judgeAgent` deleted, `probe` required;
    per contract probe-or-fail-closed (exact no-battery question string in
    spec); no `gruntJudge` call anywhere in `admit`.
- `src/experiment/decompose-run.ts`: call-site fix only — `admit` is invoked
  with the new options shape (empty probes map); every contract will kick
  back with the no-battery question and the artifact records that honestly.
  No other behavior change. (decompose-run.spec.md gets a one-line rev note
  pointing at warboss-decomposition rev 4 — planner files it at acceptance,
  implementer does NOT edit specs.)
- `test/warboss.test.ts`: AC1–AC17. Pre-existing fixtures gain
  `resolutions: []`; AC7/AC8 fixtures change judge-scripts → probe-scripts
  (spec-driven amendments, report them as such, not as deviations).
- `test/decompose-run.test.ts`: minimal fixture updates for the new
  `admit` shape (expect kicked-back-with-no-battery in the admission stage).

**Notes down:**

- `resolutions` is draft metadata — it does NOT enter `Contract.freeze`
  canonical form. Hashes of drafts with identical
  requirement/entry/version/examples must not change (existing AC1
  determinism assertion will catch a violation).
- The fail-closed `intentDecides` rule is load-bearing: a missing boolean
  routes to ESCALATION, not to amend. Do not "helpfully" default to true.
- Amend-prompt purity is capture-asserted (AC14): no intent-undecided gap
  text may reach the amend call — the amend prompt is built from the
  amendable partition only.
- Worktree grunts cannot `git merge` — sync via `git checkout main -- <paths>`;
  commit in your worktree. npm eats `--flags` on Windows — invoke runners via
  `node` directly.

### H-19 · readiness-gate rev 2 — `intentProbe` pre-freeze divergence instrument — `queued`

**Spec (frozen):** [readiness-gate.spec.md](specs/readiness-gate.spec.md) rev 2.
**Worktree:** your assigned worktree only — never the main checkout (rule 4).
At session start, `git checkout main -- specs/readiness-gate.spec.md HANDOFF.md`.

**Scope checklist:**

- `src/gate.ts`: add `intentProbe(opts)` + `IntentProbeOptions` /
  `IntentProbeVerdict` beside the existing instruments. Contract-free:
  generation via the SHARED dispatch skeleton (reuse the existing
  `dispatchGeneration` / `runWithConcurrency` helpers — do not duplicate),
  execution via `runImpl` from `sandbox.ts`; outcome keys, viability screen,
  splits, and `decidedRate` exactly as pinned. No `ready` boolean, no
  threshold (deliberate — E3 calibrates first).
- `gruntJudge` / `deriveCheck`: NO code change — their demotion is a wiring
  change that lives in H-18's `admit` rework. Doc-comment updates only if
  the spec's rev-2 status lines make the existing comments wrong.
- `test/gate.test.ts`: AC11–AC16 beside the existing cases (AC1–AC10
  untouched).

**Notes down:**

- Outcome key for a throwing execution is the SINGLE key `throw` — error
  messages are not clustered (AC12 kills the "cluster by message" reading).
- `value:` keys use `JSON.stringify(run.value)`; `undefined` stringifies to
  `undefined` (no quotes) → key `value:undefined` (AC12 asserts it).
- Viability screen excludes all-throw impls from clustering but counts them
  in `nonviable`; `viable === 0` forces `decidedRate: 0` — fail closed, no
  throw (AC13).
- No contamination guard on candidate inputs — pinned as correct in the
  spec (inputs carry no expected outputs). Do not copy the
  convergenceProbe audit.
- Worktree + npm-flags notes as in H-18. No file overlap with H-18 (gate.ts
  vs warboss.ts; test files disjoint).

### H-20 · E3 intent-divergence runner — `queued` (DO NOT DISPATCH until H-18 + H-19 are merged to main)

**Spec (frozen):** [e3-intent-divergence.spec.md](specs/e3-intent-divergence.spec.md) rev 1.
**Worktree:** your assigned worktree only — never the main checkout (rule 4).
At session start, `git checkout main -- specs/e3-intent-divergence.spec.md HANDOFF.md`.

**Scope checklist:**

- `src/experiment/e3.ts`: `runE3(opts)` + CLI entry guarded like e1b/e2.
  Author arm = rev-4 `decompose` (`maxRequirements: 1`, duration-parse
  prose); probe arm = `intentProbe` (k=8, `E3_CANDIDATE_INPUTS` pinned
  constant); `evaluateE3Criterion` pure helper (surfacing rules + criterion,
  exported); artifact + jsonl sidecar + dead-run guard; costs split
  `authoringCostUsd` / `probingCostUsd`.
- `E3_CANDIDATE_INPUTS` and `E3_NEEDLES` copied VERBATIM from the spec
  (pre-registered — any edit is a spec violation, not a judgment call).
- `test/e3.test.ts`: AC1–AC8, offline, fake client.
- `package.json`: add `"e3": "node --env-file=.env --import tsx src/experiment/e3.ts"`.

**Notes down:**

- E3 dispatches NO grunt loop and touches NO hidden battery — if you find
  yourself importing e1b session machinery, stop and re-read the spec.
- `surfacedByAuthor` consults `escalations` ONLY — `auditGaps` is the
  amendable remainder and is deliberately out (AC2 variant kills the
  "scan everything" reading).
- Needle matching is case-insensitive substring over lowercased escalation
  entries; recall over precision is the pinned trade.
- Live run is God-gated and sequenced in standing notes (~$0.20: fresh rev-4
  decompose — the 2026-06-12 artifact predates the `resolutions` schema and
  cannot be reused — plus k=8 LOW probe).
- Worktree + npm-flags notes as in H-18.

> **Parallel-dispatch note (planner):** H-18 and H-19 have no file overlap
> (warboss.ts/decompose-run.ts/test-warboss vs gate.ts/test-gate) — dispatch
> both in parallel worktrees. H-20 imports both items' outputs
> (`decompose` rev 4, `intentProbe`) and adds the only `package.json` line —
> sequence it strictly after both merge. After H-20 acceptance, the E3 live
> run is the leg's verdict gate (God funds, ~$0.20).

<!-- ARCHIVED — bodies moved to HANDOFF-archive.md on acceptance
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
-->

---

## Log (accepted items — full bodies in [HANDOFF-archive.md](HANDOFF-archive.md))

| Item | What | Outcome |
| --- | --- | --- |
| **H-17** · E2 rev-2 residual battery | `buildResidualBattery` exclusion stage + viability guard (`src/experiment/e2.ts`), `AnalyzableSession` loosening (`e1b.ts`), AC11–AC13 | accepted 2026-06-12, 177/177, zero gaps; unblocked E2 attempt 2 same day (criterion FAIL 0.667, error path 1.000 vs 0.000) |
| **H-16** · gate-judge derive-check | `deriveCheck` mechanical-enumeration instrument + `calibrate-derive` runner (`src/gate.ts`, `src/experiment/calibrate-derive.ts`), AC1–AC9 | accepted 2026-06-12, 173/173; jsonl-sidecar ruling pinned; return-type gap → rev 2 |
| **H-15** · E2 contract-authorship | `runE2` human-vs-warboss contract on the grunt loop, happy/error hidden split, ≥0.90× criterion (`src/experiment/e2.ts`), AC1–AC10 | accepted 2026-06-12, 173/173; `analyzeE1bArm`/`E2SessionRecord` cast → e2 rev 2 |
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
