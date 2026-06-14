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

**Standing notes for Leg 7** (Leg 6 closed offline; E3 ran 2026-06-13):

- **E3 VERDICT RUN — DONE 2026-06-13, PASS** ($0.087, artifact
  `runs/e3-20260613T191532Z.json`, verdict `reports/e3-verdict.md`). All three
  E2-known inputs surfaced; on GENUINE signal the arms are DISJOINT (author
  caught bare-number + whitespace by fiat escalation; decimal caught by PROBE
  ALONE). The artifact's `surfacedByAuthor:true` for decimal is a **needle false
  positive** (`"decimal"` substring-matched an unrelated Unicode-digits
  escalation) — PASS robust, attribution not. Probe nonviable rate 4/8.
  **Leg 7 = the five follow-on items below (H-21…H-25), specced and queued
  2026-06-13.** Only H-21 (battery-authoring) carries live spend (~$0.15,
  God-gated on the owner authoring `god-answers.json`); H-22…H-25 are offline.
- **e3 rev-2 gap (H-20 fail-up):** the probe-prompt format
  `Implement: ${entry}${signature}` has no signature source — `loadTask`'s
  TaskDef carries none, and the per-requirement signature is author-arm
  output (can't cross to the probe arm — instrument independence). Grunt used
  `signature = ""` → `Implement: parseDuration`, marked `// UNDECIDED:`. Rev 2
  either adds a `signature` to the task asset or pins the empty-signature
  reading as canonical. (Empty is arguably better — less scaffolding, purer
  prose-latitude measurement. Likely just bless it.)
- **Worktree branch-point lesson RECURRED (H-20), now a hard dispatch rule:**
  Agent worktree isolation branches from a STALE HEAD (here `85b4549`), not
  current main — so a later item built on freshly-merged deps gets the OLD
  source files and the default spec/HANDOFF `git checkout main --` does NOT
  fix it. **Dispatch rule for any item depending on same-leg merges: the
  grunt's FIRST step must `git checkout main -- <all dep src + test files>`
  (compute via `git diff --name-only <branch-point> main`), then VERIFY the
  depended-on symbols exist before building.** H-20 attempt 1 was stopped for
  exactly this (built against pre-rev-4 stale source); attempt 2 with the
  7-file sync baked in passed clean.

**Standing notes carried from H-12…H-14 reviews + the
three funded live runs of 2026-06-11:**

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

**Leg 8 OPEN (queued 2026-06-14) — production wiring + E4 follow-ons.** E4 PASSed
(`reports/e4-verdict.md`); the four verdict §Consequence candidates are specced
and queued as H-27…H-29. **Dispatch order is SEQUENTIAL — all three touch
`src/experiment/e4.ts` and/or share `src/kickback.ts`, so parallel worktrees
would three-way conflict (Leg-7 `e3.ts` lesson). H-27 → H-28 → H-29; each grunt's
FIRST step is `git checkout main -- <predecessor files>` per the standing
same-leg-merge dispatch rule, then VERIFY the depended-on symbols exist.** Only
the live runs carry spend (all owner-gated): kickback live pair ~$0.20–0.30 (H-27),
e4 rev-3 rerun ~$0.15 (H-28), parse-range E4 ~$0.15–0.25 (H-29). All offline
builds are zero-spend.

### H-27 · kick-back pipeline — production wiring — `queued`

**Spec (frozen):** [kickback-pipeline.spec.md](specs/kickback-pipeline.spec.md) rev 1.
**Worktree:** your assigned worktree only — never the main checkout (rule 4).
**Dispatch order:** FIRST of Leg 8. No predecessor sync needed (branches from current main).

**Scope checklist:**

- `src/kickback.ts` (NEW): `renderDecisionBlock(decisions)` (the EXACT prose
  block e4's `renderOwnerDecisions` emits today), `OwnerAnswer` + `AnswerQueue`
  types, `buildAnswerQueue(args)`, `loadOwnerAnswers(path)` (blank/whitespace
  decision guard, dup-escalation guard, all throws before any model call).
- `src/experiment/decompose-run.ts`: phase-1 queue emit (`answers-needed-<ts>.json`
  when `escalations.length > 0`, same `<ts>`, `answerQueuePath?` on the result),
  plus phase-3 re-author mode (`--reauthor-from`/`--answers` flags, mutually
  exclusive with `--intent`/`--intent-file`, both-or-neither; basename
  provenance cross-check; augmented context via `renderDecisionBlock`;
  `reauthorOf`/`answersPath` provenance fields omitted on first-pass runs).
- `src/experiment/e4.ts`: factor `renderOwnerDecisions` to call
  `renderDecisionBlock` (keep its self-leak guard); output byte-identical → every
  e4 test passes unmodified.
- `test/kickback.test.ts` (NEW): AC1–AC4. `test/decompose-run.test.ts`: AC5–AC9
  added. Offline, fake client + fixture source artifact + fixture filled queue.

**Notes down:**

- NO self-leak guard / residual filter in the live path — there is no scoring
  battery (spec Constraints). Owner decisions may name input literals freely.
- Re-author IS a `decompose-run` (phase-1 re-applies to it → AC9 iterate).
- `requirementId` parses from the escalation's `"<id>: …"` prefix ONLY when the
  prefix matches `/^[a-z][a-z0-9-]*$/`; else `""` (AC2 kills the loose reading).
- npm eats `--flags` on Windows — test the CLI via `node` directly.
- Worktree grunts cannot `git merge` — sync via `git checkout main -- <paths>`.

### H-28 · E4 rev 3 — `extraCases` + ordering rulings — `queued`

**Spec (frozen):** [e4-battery-authoring.spec.md](specs/e4-battery-authoring.spec.md) rev 3.
**Worktree:** your assigned worktree only — never the main checkout (rule 4).
**Dispatch order:** AFTER H-27 merges. FIRST step: `git checkout main --
src/kickback.ts src/experiment/e4.ts` (H-27 promoted `renderDecisionBlock` and
factored `renderOwnerDecisions` onto it) and VERIFY `renderDecisionBlock` exists
before building. Rebase the rev-3 `extraCases` changes onto the promoted form.

**Scope checklist:**

- `src/experiment/e4.ts`: `GodRuling` gains optional `extraCases:
  { input, expected, throws? }[]`; `loadGodAnswers` validates them + extends the
  self-leak guard to span canonical `input` AND every `extraCases` input + dedups
  inputs across a ruling's `input`+`extraCases` and across rulings;
  `buildGodBattery` emits each extra case by the same override-or-append rule
  immediately after the canonical case.
- `tasks/duration-parse/god-answers.json`: decimal ruling gains `extraCases`
  (`2.5h`→9000, `0.5h`→1800); add two ordering rulings (`30m30m`→3600,
  `30m1h`→5400) with literal-free `decision`s.
- `test/e4.test.ts`: AC11 (extraCases enter battery + decimal class survives a
  canonical `1.5h` self-collision + self-leak guard on extra input) + AC12
  (ordering rulings override the happy hidden cases in place; literal-free
  bullets). Existing AC1–AC10 still pass.

**Notes down:**

- Extra-case inputs are battery inputs only — NEVER rendered; the ruling's single
  `decision` is rendered once, literal-free.
- The decimal CLASS is scored when ≥1 of {canonical, extras} survives the
  residual; the author can echo at most one input.
- Ordering rulings need NO new battery code — pure `buildGodBattery` override
  reuse (their inputs deep-equal existing `repeat-units`/`reversed-order` hidden
  cases).
- npm eats `--flags` on Windows. Worktree grunts sync via `git checkout main --`.

### H-29 · multi-task replication — `contested.json` + parse-range — `queued`

**Spec (frozen):** [multi-task-replication.spec.md](specs/multi-task-replication.spec.md) rev 1.
**Worktree:** your assigned worktree only — never the main checkout (rule 4).
**Dispatch order:** AFTER H-28 merges. FIRST step: `git checkout main --
src/experiment/e4.ts tasks/duration-parse/god-answers.json` (H-28's
`extraCases`-aware `loadGodAnswers`/`buildGodBattery`) and VERIFY the
`extraCases` field exists on `GodRuling` before building. Rebase the
`requiredInputs` change onto it.

**Scope checklist:**

- `src/experiment/e4.ts`: `loadGodAnswers` gains a `requiredInputs:
  readonly (readonly unknown[])[]` param (coverage check now driven by it, not a
  module constant); DELETE `E3_KNOWN_INPUTS`. `runE4` reads
  `tasks/<task>/contested.json` → passes `inputs` as `requiredInputs`; missing
  `contested.json` → descriptive throw before any model call.
- `tasks/duration-parse/contested.json` (NEW): the three existing E3 inputs
  (back-compat). Offline e4 fixtures that inject a fake `tasksDir` must also drop
  a `contested.json` in.
- `tasks/parse-range/*` (NEW — owner-gated authoring): `requirement.md`,
  `task.json` (entry `parseRange`, ≥2 examples incl. a `throws`, `armCSubset`),
  `hidden-battery.json` (happy + error split), `contested.json`,
  `god-answers.json` (literal-free `decision` per contested input).
- `test/e4.test.ts`: AC-MT1 (contested.json drives coverage; `E3_KNOWN_INPUTS`
  gone) + AC-MT2 (runE4 reads contested.json; missing → throw) + AC-MT3
  (parse-range loads + runs offline). Existing ACs re-run with contested.json
  fixtures.

**Notes down:**

- parse-range is the RECOMMENDED second task; the owner may substitute any pure,
  synchronous task with ≥3 contested inputs + a happy/error hidden split (spec
  Decisions). If the owner has not authored parse-range assets at build time, the
  grunt builds the harness generalization (loadGodAnswers/runE4/contested.json +
  duration-parse back-compat) and STUBS parse-range AC-MT3 as a fail-up note —
  the live replication run waits on owner authoring.
- `loadTask`/`task.ts` is UNCHANGED — `contested.json` is read by e4, not loadTask.
- npm eats `--flags` on Windows. Worktree grunts sync via `git checkout main --`.

_Leg 7 CLOSED offline 2026-06-13 — H-21 + H-22 + H-23 + H-24 + H-25 all built
by parallel sonnet grunt worktrees (group A = H-21/H-22 fully isolated; e3
cluster H-23/H-24/H-25 bundled into ONE grunt to avoid the `e3.ts` three-way
conflict), reviewed, merged, accepted. **main at 248/248, typecheck clean, zero
live spend.** Frozen-spec scope bodies live in each spec + the Log table below._

**Standing notes carried from Leg 7 (rev-2 candidates surfaced at build/merge):**

- **E4 RAN 2026-06-14 — PASS** ($0.252, artifact `runs/e4-20260614T144326Z.json`,
  verdict `reports/e4-verdict.md`, commit `391ecb3`). warboss **0.918** vs human
  **0.724** on the neutral God oracle (E2 FAILed 0.667 on the old confounded
  battery). Driver = error coverage (human 0.000, warboss 0.878 — God ruled the
  inputs invalid, warboss authored throws). `"120"` flipped polarity vs E2
  (warboss 1.00 / human 0.00) = clean confound removal. `"1.5h"` excluded
  (warboss coincidentally echoed it as its own example — spec rev-2 prediction #3
  backstop, 1/3 not 3/3); PASS rests on 11/12. **Closes the E1→E2→E3→E4 chain.**
  NEXT-leg candidates (verdict §Consequence): (1) production wiring
  escalations→owner-answer queue→re-author into live `decompose-run`; (2) E4 rev 3
  to score decimal (render-hint forbidding the author from echoing the ruling
  input, or a 2nd God battery using `"2.5h"`); (3) owner happy-path ruling on
  repeat/reversed unit ordering (warboss dips to 0.77 there); (4) multi-task
  replication.
- **e3-needle-matcher rev-2 (spec defect, found by the H-25 grunt):** AC5 as
  written ("every needle is a contested literal OR contains a space/hyphen")
  CONTRADICTS the pinned needle lists, which include single-word needles
  (`unitless`, `whitespace`, `fractional`, `trim`, `padded`, …). The grunt
  fail-upped: AC5 test asserts (a) the 3 literals present + (b) the dropped
  generic tokens absent. Rev 2 should fix AC5's wording to match that intent.
- **e3-needle-matcher rev-2 (AC4):** `runs/e3-20260613T191532Z.json` is not in
  the git tree (gitignored), so the recorded-run regression was pinned from the
  escalation strings in `reports/e3-verdict.md` as a fixture. If the artifact is
  ever committed, AC4 should read it directly.
- **probe `signature` typed `unknown` (H-23):** `RawTask.signature` is `unknown`
  (not `string?`) so `loadTask` can validate + throw on a non-string. Intended.

_Full H-21…H-26 scope bodies: the frozen specs (`specs/`) + the Log table
below. Per-item build outcomes recorded in the Log._

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
| **H-26** · E4 rev 2 — prose-only decisions + shared ledger | literal-free `decision` rendering + self-leak guard + `runE2` `ledger?` (`src/experiment/e4.ts`, `e2.ts` rev 4, `god-answers.json`), AC3/AC7/AC8/AC9 | accepted 2026-06-14, 252/252 offline; grunt session-limited pre-commit → planner committed + fixed AC7-variant assertion (find excluded by `leakedBy`, not name: `"120"` overrides hidden `bare-number-2` in place); **unblocks the live E4 run** |
| **H-25** · E3 needle matcher rev 2 | tighten `E3_NEEDLES` to literals + unambiguous phrases, kill the decimal substring FP (`src/experiment/e3.ts`), AC1–AC5 | accepted 2026-06-13, 248/248; grunt caught a spec contradiction in AC5 (lists contain single-word needles) → fail-up reimplemented AC5 as dropped-tokens-absent → needle-matcher rev 2 candidate; AC4 pinned from verdict strings (`runs/` gitignored) |
| **H-24** · intent-probe viability | `intentProbe` rev 3 — `noEntry`/`viable`/`nonviable` three-way split keyed on sandbox sentinel + scaffolded `PROBE_DEFAULT_SYSTEM` (`src/gate.ts`, `src/experiment/e3.ts`), AC1–AC6 | accepted 2026-06-13, 248/248; zero deviations; invariant `generated === noEntry+viable+nonviable` |
| **H-23** · probe signature | optional task-asset `signature` → `TaskDef` → E3 probe prompt; closes the H-20 `signature=""` fail-up (`src/experiment/task.ts`, `e3.ts`, `task.json`), AC1–AC5 | accepted 2026-06-13, 248/248; `RawTask.signature` typed `unknown` for validation (intended) |
| **H-22** · decompose-run rev 2 | jsonl cost sidecar, `--max-requirements` NaN/range guard, blessed deadRun-omit + CRLF readings (`src/experiment/decompose-run.ts`), AC7–AC9 | accepted 2026-06-13, 248/248; zero deviations/gaps |
| **H-21** · E4 battery-authoring | God-answers re-author + neutral oracle battery + `runE2` `hiddenOverride` (`src/experiment/e4.ts`, `e2.ts` rev 3, `god-answers.json`), AC1–AC9 | accepted 2026-06-13, 248/248 offline; 2 deviations → e4 rev-2 (split cost-ledger: `runE2` owns its ledger; contested-input contamination masks the oracle — render owner decisions prose-only) |
| **H-20** · E3 intent-divergence runner | `runE3` + `evaluateE3Criterion` + pinned `E3_CANDIDATE_INPUTS`/`E3_NEEDLES` (`src/experiment/e3.ts`), AC1–AC8 | accepted 2026-06-12, 204/204; **live verdict DONE 2026-06-13 — E3 PASS $0.087** (`reports/e3-verdict.md`); spawned Leg 7 items H-21…H-25 (signature fail-up → H-23, nonviable 4/8 → H-24, needle FP → H-25) |
| **H-19** · readiness-gate rev 2 — `intentProbe` | contract-free K-grunt pre-freeze divergence instrument (`src/gate.ts`), AC11–AC16 | accepted 2026-06-12, 185/185 at merge; zero deviations/gaps |
| **H-18** · warboss-decomposition rev 4 | fiat-flagging `resolutions` + escalation channel + probe-only admission + prompt-injected req cap (`src/warboss.ts`, `src/experiment/decompose-run.ts`), AC1–AC17 | accepted 2026-06-12, 191/191 at merge; zero deviations/gaps; grunt correctly placed `resolutions` validation at stage 3 (AC12 ledger-count forces it) |
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
