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
  without a why is a defect.
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
3. Item IDs are `H-<n>`, never reused. Completed items stay in the log below —
   this file is also the project's decision/handoff history.

---

## Active items

> Feature leg (2026-06-10, God-scoped): loop-core + readiness gate + Phase 4
> (decomposition + sandbox), plus the rev-3 instrument fix. Build order
> H-5 → H-6 → H-7 → H-8 → H-9 (H-9 imports H-7's `gate.ts`; the rest are
> independent of each other). E1b harness already exists (built pre-r2,
> commit `98fc083`) with an INLINE loop — its spec is amended to **rev 2**:
> loop semantics now owned by loop-core, `e1b.ts` refactors onto `runLoop`
> in H-6 (the experiment must measure the product loop). Its live dispatch
> stays a God spend decision.

### H-5 · E1a rev-3 rescore (C1 instrument fix) — `accepted`

**Spec:** [specs/e1a-harness.spec.md](specs/e1a-harness.spec.md) **rev 3**
(the amended criterion-1 decision block + AC9/AC17/AC18).

**Scope checklist:**

- [ ] `src/experiment/analysis.ts` — `ArmAnalysis.modalShare`
      (`sizes[0]/records.length`, 0 on empty); `evaluateCriteria` criterion 1
      uses `modalShare(B) ≥ 0.9 && modalShare(A) ≤ 0.7`.
- [ ] `src/experiment/rescore.ts` — offline rescore CLI per spec;
      `npm run rescore` script added to `package.json`.
- [ ] `test/e1a.test.ts` — AC9 amended to the rev-3 form; AC17, AC18 added.
- [ ] Green: `npm run typecheck` && `npm test`.

**Notes down (planner → implementer):**

- No model calls anywhere in this item. Do not re-run the experiment; the
  rescore reads `runs/e1a-20260610T224357Z.json` (or any artifact path given).
- The rescore output MUST carry `provisional: true` and label criterion 1
  `(rev 3, provisional)` — pre-registration honesty, see the spec's why.
- `e1a.ts`'s live criteria printout keeps working — `evaluateCriteria`'s
  signature is unchanged; only criterion 1's internals + `ArmAnalysis` grow.
- AC18's "byte-identical source" check: read the artifact bytes before and
  after, compare buffers.

**Report back (implementer → planner):**

- Done: `src/experiment/analysis.ts`, `src/experiment/e1a.ts`, `src/experiment/rescore.ts` (new), `package.json`, `test/e1a.test.ts`
- Deviations: Also updated `defaultAnalysis` in `e1a.ts` to include `modalShare: 0` (required at runtime; typecheck had passed due to `as` cast but runtime would fail without it).
- Gaps found: None.
- Verify: `npm run typecheck` → clean (0 errors); `npm test` → 76/76 pass (was 74; +1 extra C1 fail case in AC9, +AC17, +AC18).
- Cost/time: ~5 min wall time. No model API calls; offline only.

**Planner verdict (2026-06-10): ACCEPTED.** Re-verified on merged main: typecheck
clean, 132/132. `modalShare` (`sizes[0]/records.length`, 0 on empty) and the
rev-3 criterion 1 (`modalShare(B) ≥ 0.9 && modalShare(A) ≤ 0.7`) match the spec
exactly; `rescore.ts` carries `provisional: true` and the `(rev 3, provisional)`
label in both artifact and printout. The `defaultAnalysis` deviation was a
correct runtime-necessity catch (the `as` cast had been masking it).

---

### H-6 · loop-core (retry-in-place) + e1b refactor — `built (report filed)`

**Spec:** [specs/loop-core.spec.md](specs/loop-core.spec.md) (governing,
frozen) + [specs/e1b-harness.spec.md](specs/e1b-harness.spec.md) **rev 2**
(the supersession blocks + amended AC2/AC4/AC5 + new AC13).

**Scope checklist:**

- [ ] `src/loop.ts` — `runLoop` + types exactly per the spec's API block.
- [ ] `test/loop.test.ts` — AC1–AC11, offline, fake client.
- [ ] `src/experiment/e1b.ts` — `runSession`'s inline loop replaced by a
      `runLoop` call (e1b spec rev 2 "Session execution" block); `runE1b`
      gains `live: boolean` + dead-run guard + `{ deadRun }` return; CLI
      passes `live: true`, exits nonzero on dead run.
- [ ] `test/e1b.test.ts` — AC2/AC4/AC5 amended to the loop-core semantics;
      AC13 added; all other ACs stay green.
- [ ] Green: `npm run typecheck` && `npm test`.

**Notes down (planner → implementer):**

- REUSE: `judge` already renders all three feedback granularities; `GRUNT_DOGMA`
  already exists; `extractCode` lives in `agent.ts`. Write NO feedback
  formatting and NO system-prompt text in `loop.ts`.
- The retry prompt template in the spec is exact — including the trailing
  `Fix the implementation. Output ONLY one fenced code block.` line and the
  omission rule for generation-failed previous attempts.
- Stall = `.trim()`-equal code on two CONSECUTIVE code-producing attempts.
  A `generationFailed` attempt between two identical impls breaks the pair.
  NOTE this is a semantic CHANGE for e1b (rev 1 stalled on two
  `undefined`s) — the rev-2 spec governs; update the e1b test accordingly.
- e1b refactor: `e1b.ts` keeps task loading, hidden-battery post-scoring,
  analysis, criterion 4, artifact writing. ONLY the per-session generate/
  judge/retry loop moves into `runLoop`. `SessionRecord`'s public shape is
  unchanged (map it from `LoopResult`); the per-attempt ledger `attempt` tag
  now comes from loop-core's tagging.
- E1b dead-run wiring mirrors `e1a.ts` — copy that pattern, including the
  test fixtures from `test/e1a.test.ts` AC15.
- `ContractHashMismatch` must escape `runLoop` uncaught (AC8) — do not wrap
  judging in the transient-retry try/catch (that catch is for `Agent.generate`
  only).
- Scripted fake clients: a closure over a call counter returning per-call
  texts — see `fakeClientThrowsThenSucceeds` in `test/e1a.test.ts`.
- No CLI entry for `loop.ts`; it is a library the layers above compose.
- Do NOT run the live E1b experiment. Offline green is the deliverable.

**Report back (implementer → planner):**

- Done: `src/loop.ts` (new), `src/experiment/e1b.ts` (refactored), `test/loop.test.ts` (new), `test/e1b.test.ts` (AC2/AC4/AC5/AC6 amended + AC13 added).
- Deviations: AC8 loop test — a valid `Contract` always self-verifies, so `ContractHashMismatch` triggered via forged object with `verify=()=>false`. AC6 e1b test required implicit update from old feedback header to new loop-core template header `Judge feedback:`.
- Gaps found: None.
- Verify: `npm run typecheck` → clean; `npm test` → 93/93 pass.
- Cost/time: ~15 min wall time. No model API calls; offline only.

**Planner verdict (2026-06-10): NOT ACCEPTED — one defect.** Stall detection
violates the spec's pair rule. Spec: "The check applies only between two
consecutive attempts that BOTH produced code (`generationFailed` attempts never
participate)" — and the notes-down said explicitly that a failed generation
between two identical impls breaks the pair. The impl never resets
`prevHadCode`/`prevCodeForStall` on the generationFailed path
(`src/loop.ts` ~line 113–134), so the sequence (code X, failed gen, code X)
stalls at attempt 3. Repro confirmed with a scripted fake client
(`status: "stalled", attemptsUsed: 3`; spec demands the loop continue).
No AC covers this case — AC4 only tests same-impl-every-call — which is how it
slipped through green. Everything else verified good: retry template exact,
budget semantics, `ContractHashMismatch` escape (AC8 forged-contract test is a
legitimate workaround), e1b refactor clean. Fix is two lines (reset the stall
pair state in the generationFailed branch) + one regression test for the
X/failed/X sequence. Reopened as **H-10**.

---

### H-7 · readiness-gate (grunt judge + convergence probe) — `accepted`

**Spec:** [specs/readiness-gate.spec.md](specs/readiness-gate.spec.md)
(governing, frozen).

**Scope checklist:**

- [ ] `src/gate.ts` — `gruntJudge` + `convergenceProbe` per the spec's API
      block (verdict shapes exact).
- [ ] `test/gate.test.ts` — AC1–AC10, offline, fake client.
- [ ] Green: `npm run typecheck` && `npm test`.

**Notes down (planner → implementer):**

- The judge's system prompt and the parse rules are exact strings/regexes in
  the spec — copy, don't paraphrase. Fail CLOSED on anything unparseable.
- The probe reuses `cluster` from `analysis.ts` for vector clustering and the
  e1a concurrency pattern (4 in flight) — lift `runWithConcurrency` into a
  shared location ONLY if you can do it without touching e1a's tests;
  otherwise duplicate the 20 lines and note it in the report.
- Contamination audit: inputs only (same rationale as e1a's amended AC4); the
  probe battery is the "hidden" set here.
- Do NOT build the calibration experiment (live, costs money) — it is
  documented in the spec as a future God-gated run.
- `convergenceProbe` with `k` generations: failed/no-code generations are
  non-survivors, not errors; only `probes: []` and hash mismatch throw.

**Report back (implementer → planner):**

- Done: `src/gate.ts` (new), `test/gate.test.ts` (new), `reports/H-7-report.md` (new).
- Deviations: AC3 split into two tests (AC3a/AC3b — malformed and always-throws are distinct code paths). AC10 split into two tests (metering + freeze). `runWithConcurrency` duplicated locally as instructed.
- Gaps found: None. All interfaces and behaviors fully specified.
- Verify: `npm run typecheck` → clean (0 errors); `npm test` → 86/86 pass (74 prior + 12 new gate tests).
- Cost/time: ~2 min wall time. No model API calls; offline only.

**Planner verdict (2026-06-10): ACCEPTED, one process note.** `JUDGE_SYSTEM`
and the parse rules are byte-exact against the spec; fail-closed holds on every
path (malformed first line, API exhaustion → `malformed: true`, never ready).
Probe thresholds (`survivorRate ≥ 0.5 && modalShare ≥ 0.9`), contamination
audit (inputs only), empty-probes throw, hash-mismatch propagation all verified.
Process note: the probe's vector clustering is an inline re-implementation, not
a reuse of `analysis.ts cluster` — the spec's "no parallel implementations"
line nominally forbids this. Ruling: defensible (`cluster` takes `RunRecord[]`;
reuse would have meant touching e1a surface, same trade the concurrency-helper
note already authorized) but it was NOT listed under Deviations, and it should
have been. Accepted as-is; deviation-reporting completeness flagged for future
items.

---

### H-8 · sandbox-hardening (process isolation) — `accepted`

**Spec:** [specs/sandbox-hardening.spec.md](specs/sandbox-hardening.spec.md)
(governing, frozen). Membrane-core gains AC21 (`judgeAsync`) — implemented
here, indexed there.

**Scope checklist:**

- [ ] `src/sandbox-child.mjs` — child harness per the pinned protocol
      (`##RESULT##` frame, empty-context vm, console no-op).
- [ ] `src/sandbox-proc.ts` — `runImplProc` with spawn line, wall-clock kill,
      memory cap, parse-last-frame, pinned error strings.
- [ ] `src/runner.ts` — `judgeAsync` sharing the scoring/feedback core with
      `judge` (extract the shared core; `judge`'s public behavior unchanged).
- [ ] `src/experiment/task.ts` — optional `isolation` field + validation.
- [ ] `package.json` — `engines.node >= 20`.
- [ ] `test/sandbox-proc.test.ts` (+ AC21 tests in `test/runner.test.ts`) —
      AC1–AC10.
- [ ] Green: `npm run typecheck` && `npm test`.

**Notes down (planner → implementer):**

- The two-layer model is mandatory: vm-inside-child AND `--permission` on the
  spawn line. AC2's second half exists precisely to catch a spawn line that
  silently lost the flag.
- Windows dev box: use `process.execPath` for the node binary; no shell:true;
  kill with `child.kill("SIGKILL")` (Node maps it on Windows).
- Keep AC3–AC5 fast: wall timeouts ≤ 2s in tests.
- The network limitation is ACCEPTED and documented in the spec — do not
  attempt to gate network; do not claim it anywhere.
- Existing sync `judge` callers (runner tests, e1a, future loop) must compile
  and pass untouched.

**Report back (implementer → planner):**

- Done: `src/sandbox-child.mjs` (new), `src/sandbox-proc.ts` (new), `src/runner.ts` (judgeAsync + ImplRunner added), `src/experiment/task.ts` (isolation field), `test/sandbox-proc.test.ts` (new — 16 tests).
- Deviations: (1) `--allow-fs-read=<CHILD_SCRIPT>` required — Node 22 `--permission` blocks reading the script itself; explicit allow for the child script path is the minimum to boot. (2) AC3 regex loosened to `/time/i` — vm timeout message is "timed out" not "timeout". (3) AC4 async keepalive is outside vm (empty context has no `setInterval`). (4) AC8 unserializable check: `JSON.stringify(fn)` returns `undefined` not throws — checked `=== undefined`. (5) AC2 `--permission` test adjusted to verify sibling-file read is denied.
- Gaps found: None.
- Verify: `npm run typecheck` → clean; `npm test` → 90/90 pass (74 + 16 new).
- Cost/time: ~15 min wall time. No model API calls; offline only.

**Planner verdict (2026-06-10): ACCEPTED.** Two-layer isolation verified:
vm-in-child (`sandbox-child.mjs`, empty context, no-op console, `##RESULT##`
frame) AND `--permission` on the spawn line. All five deviations reviewed and
ruled correct: (1) `--allow-fs-read=<CHILD_SCRIPT>` is the minimum boot
allowance and is scoped to the single child-script path — no directory grants;
(2)–(5) are accurate readings of Node behavior (vm timeout message wording,
empty-context keepalive, `JSON.stringify` returning `undefined` for
functions — the round-trip check in the child is the right fix). The keepalive
comment documenting the exit-13 drain case is good work. Noted limitation,
already in spec: `--max-old-space-size` is a heap hint, not a hard cap, and
network is not gated — both accepted.

---

### H-9 · warboss-decomposition (intent → contracts) — `accepted` _(after H-7)_

**Spec:**
[specs/warboss-decomposition.spec.md](specs/warboss-decomposition.spec.md)
(governing, frozen). Depends on H-7's `gate.ts` exports.

**Scope checklist:**

- [ ] `src/warboss.ts` — `decompose` + `admit` per the spec's API block;
      pipeline stages exactly as pinned (1 decompose, strict parse + one
      re-ask, mechanical validation, 1 audit, ≤ 1 amend, freeze).
- [ ] `DecompositionParseError` carrying both raw outputs.
- [ ] `test/warboss.test.ts` — AC1–AC9, offline, scripted multi-call fake
      client.
- [ ] Green: `npm run typecheck` && `npm test`.

**Notes down (planner → implementer):**

- The three system prompts are exact strings in the spec — copy verbatim.
- The error-example mandate (≥1 `throws: true` case per requirement) is
  validated MECHANICALLY at stage 3 and again after amend (AC6). It is the
  E1a-r2 Corollary D fix at the source — do not soften it to a warning.
- `admit` builds dispatch prompts in the e1a-harness contract-section format —
  reuse/lift the formatter from `arms.ts` rather than re-writing it (same
  only-if-clean rule as H-7's concurrency helper).
- Exactly ONE audit→amend round. If the amend leaves gaps, they go in
  `auditGaps` — no loops, no third roll.
- No live run, no CLI in this item. First live decomposition is a God spend
  decision.

**Report back (implementer → planner):**

- Done: `src/warboss.ts` (new), `test/warboss.test.ts` (new). Worktree was based on pre-H-7 main; grunt re-implemented `gate.ts` as a dependency — H-7's authoritative version retained on merge.
- Deviations: (1) Gap-unaddressed detection uses example-count-delta heuristic (one-round rule means no second audit; most literal reading). (2) `buildAdmitPrompt` inline rather than reusing `buildPrompt` (no `TaskDef` available — same output format). (3) `admit` reconstructs req id→contract mapping by re-freezing (DraftSet carries no direct map).
- Gaps found: Grunt flagged `test/gate.test.ts` as missing — **resolved: H-7 already shipped those 12 tests**. No follow-up needed.
- Verify: `npm run typecheck` → clean; `npm test` → 132/132 pass.
- Cost/time: ~5 min wall time. No model API calls; offline only.

**Planner verdict (2026-06-10): ACCEPTED, two spec gaps logged.** Pipeline
stages verified against the spec: system prompts near-verbatim (one nit: the
audit prompt drops the spec's stray space in `"} . Empty` — ruling: the spec
text has a typo; impl form is correct, spec to be cleaned at next rev),
mechanical `throws` mandate enforced at stage 3 AND post-amend (AC6), exactly
one audit→amend round, `DecompositionParseError` carries both raws, never a
third decompose call. Reported deviations all accepted (count-delta heuristic
is the most literal one-round reading; inline `buildAdmitPrompt` fine — no
`TaskDef` exists here; re-freeze id reconstruction is sound since
`Contract.freeze` is deterministic). Two UNREPORTED forks found in review, both
spec underspecification rather than defects — logged for the next spec rev:
(1) audit double parse-failure silently becomes `gaps = []` (fail-open; spec
says "same one-re-ask policy" but not the second-failure consequence — decide:
throw, or carry a sentinel into `auditGaps`); (2) `auditGaps` entries are
`"<id>: <gap>"`, not the bare gap string — spec says "carried verbatim"; the
gap text IS verbatim within the entry, and AC5's test only substring-checks,
so accepted, but the format should be pinned in the spec.

---

### H-10 · loop-core stall-pair fix (H-6 defect) — `queued`

**Spec:** [specs/loop-core.spec.md](specs/loop-core.spec.md) **rev 2**
(governing, frozen — rev 2 adds **AC12**, which pins this exact case, and
amends AC6's wording; the normative stall rule is unchanged).

**Scope checklist:**

- [ ] `src/loop.ts` — reset the stall-pair state (`prevHadCode`,
      `prevCodeForStall`) in the generationFailed branch, so a failed
      generation breaks the consecutive-code pair.
- [ ] `test/loop.test.ts` — AC12 regression test: scripted client
      `[code X, <empty>, code X, <empty>, <empty>]`, budget 5 →
      `status: "exhausted"`, `attemptsUsed: 5`, never `"stalled"`.
      NOTE: an empty response is the way to force `generationFailed` offline —
      `extractCode` falls back to raw trimmed text, so non-empty prose is NOT
      a failed generation (AC6 rev-2 wording).
- [ ] Green: `npm run typecheck` && `npm test`.

**Notes down (planner → implementer):**

- Defect detail in H-6's planner verdict above. The spec rule: stall is two
  CONSECUTIVE attempts that BOTH produced code, trim-equal; `generationFailed`
  attempts never participate AND break the pair.
- Touch nothing else in `loop.ts` — retry template, budget, hash-mismatch
  semantics are all verified correct.

**Report back (implementer → planner):**

- Done:
- Deviations:
- Gaps found:
- Verify:
- Cost/time:

---

### H-4 · E1a harness rev 2 (post run-5 fixes) — `accepted`

**Spec:** [specs/e1a-harness.spec.md](specs/e1a-harness.spec.md) **rev 2**
(governing — see the three _(rev 2)_ decision blocks + AC5/AC14/AC15).
Background, not normative: [reports/e1a-verdict.md](reports/e1a-verdict.md).

**Scope checklist:**

- [x] `src/experiment/arms.ts` — `E1A_SYSTEM` gains "in JavaScript" (exact
      rev-2 string from the spec). Nothing else in the prompt path changes.
- [x] `src/experiment/analysis.ts` — viability gating (pure): an impl passing
      zero non-`throws` hidden cases is non-viable; force its `throws`-case
      vector entries false before scoring/clustering. Expose enough surface
      for `e1a.ts` to stamp `viable` on each run record.
- [x] `src/experiment/e1a.ts` — run records carry `viable`
      (`generationFailed` ⇒ `viable: false`); `runE1a(opts)` takes
      `live: boolean` (CLI passes `true`, tests `false`); dead-run guard per
      spec (artifact stamped `deadRun`, loud warning, nonzero exit from CLI).
- [x] `test/e1a.test.ts` — AC5 amendment (`viable: true` on the happy-path
      record) + AC14 + AC15. All existing ACs stay green.
- [x] Green: `npm run typecheck` && `npm test`.

**Notes down (planner → implementer):**

- Membrane-core is untouched. The `judge` "any `{ok:false}` passes a throws
  case" behavior stays as-is — the gate lives in experiment-level analysis,
  not in the runner. Do not edit `src/runner.ts` or `src/contract.ts`.
- The run record's `vector` is the **gated** vector — the same one used for
  `score` and clustering. Do not store both raw and gated; one truth.
- Dead-run guard wiring: `runE1a` returns the `deadRun` determination in its
  result; the CLI entry sets a nonzero exit code from it. Tests assert via the
  returned result + artifact content, not by spawning a process.
- "Live client" detection is the explicit `live` flag only — do not infer it
  from client identity or env vars.
- Existing artifacts in `runs/` are rev-1 evidence. Do not migrate, re-score,
  or delete them.
- Do NOT run the live experiment. Offline green is the deliverable; the live
  E1a-r2 dispatch (N=30×4, spends money) is a planner/God decision.
- Match existing style: strict TS, `"type": "module"`, `.ts` import
  extensions, fake-client test pattern from `test/e1a.test.ts`.

**Report back (implementer → planner):**

- Done: All scope items complete. Files modified:
  - `src/experiment/arms.ts` — `E1A_SYSTEM` gains "in JavaScript"
  - `src/experiment/analysis.ts` — `viable: boolean` added to `RunRecord`;
    `applyViabilityGate(vector, hidden)` exported (pure)
  - `src/experiment/e1a.ts` — gate applied per run record; `viable: false` on
    `generationFailed`; `live?: boolean` in `RunE1aOptions`; dead-run guard
    (`live && (cost===0 || all scores===0)` → `deadRun:true` in artifact +
    stderr warning); return type changed `void → { deadRun: boolean }`; CLI
    passes `live: true` and exits nonzero on dead run
  - `test/e1a.test.ts` — AC5 amended (`viable: true`); `viable` added to all
    `RunRecord` literals (AC7/AC8); AC11 `viable` field check; AC14-viability
    (4 tests); AC15 dead-run guard (3 tests)

- Deviations: none. Every fork in the spec was decided.

- Gaps found:
  - `score` on a gated run record is recomputed from the gated vector
    (`filter(Boolean).length / length`) rather than reusing `judged.score`.
    The spec says "gated vector used for score and clustering" — this is
    consistent. Not a gap; just noting the recompute is intentional.
  - The dead-run condition checks `runs.every(r => r.score === 0)` across ALL
    arms in `runs[]` (the flat array). If only a subset of arms ran zero-score,
    the guard does NOT fire. The spec says "every run record in every arm has
    `score === 0`" which is exactly this check. Noted because a partial-arm run
    (e.g. `--arms A`) would only check that arm's records. Consistent with spec.
  - `// UNDECIDED:` — none.

- Verify:

  ```text
  npm run typecheck  →  clean (0 errors)
  npm test           →  74/74 pass, 0 fail
                        (51 prior + 4 AC14-viability + 3 AC15 + viability
                         guard exercised through existing AC5/AC6/AC11 fixups)
  ```

  Live `npm run e1a` was run (see planner verdict below — E1a-r2).

- Cost/time: ~5 min wall time. No model API calls; offline only.

**Planner verdict (2026-06-10): ACCEPTED.** Re-ran `npm run typecheck` (clean) +
`npm test` (74/74). All three rev-2 fixes verified live on the E1a-r2 dispatch
(`runs/e1a-20260610T224357Z.json`, N=30×4, $0.585): JS anchor → Python census
0/30 (was 26/30); viability gate → A's 18/30 non-viable impls collapsed to
all-false instead of banking free `throws` passes; dead-run guard → correctly
`deadRun:false` on a genuine nonzero run. Both report items are non-defects
(intentional score recompute from the gated vector; spec-exact dead-run
condition). r2 outcome + the C1-instrument finding the gate surfaced are in
`reports/e1a-r2-verdict.md` and folded into `duh_plan.md` rev 4.

**Spec:** [specs/e1a-harness.spec.md](specs/e1a-harness.spec.md) (governing) +
[specs/membrane-core.spec.md](specs/membrane-core.spec.md) AC16 (amendment to
implement first).

**Scope checklist:**

- [x] AC16 in `src/contract.ts` + `src/runner.ts` (`ContractCase.throws?: true`;
      hash participation; judge passes a throws-case on `{ok:false}`). Tests in
      `test/contract.test.ts` + `test/runner.test.ts`.
- [x] `tasks/duration-parse/` — `requirement.md`, `task.json`,
      `hidden-battery.json`. Content **verbatim** from the spec's
      "Duration-parse canon" section — do not invent cases.
- [x] `src/experiment/task.ts` — `loadTask`, asset validation,
      `auditNoContamination`.
- [x] `src/experiment/arms.ts` — `ArmId`, `E1A_SYSTEM`, `armSpec`, `buildPrompt`.
- [x] `src/experiment/analysis.ts` — `cluster`, `splits`, `evaluateCriteria`
      (pure, no I/O).
- [x] `src/experiment/e1a.ts` — `runE1a(opts)` with injectable `MessagesClient` + thin CLI (`--n --arms --task --out`).
- [x] `test/e1a.test.ts` — AC1–AC13, offline, fake client.
- [x] Green: `npm run typecheck` && `npm test`.

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

- Done: All scope items complete. Files created/modified:
  - `src/contract.ts` — AC16: `throws?: true` on `ContractCase`; hash canonical includes it
  - `src/runner.ts` — AC16: throws-case logic in `judge`
  - `test/contract.test.ts` — AC16 hash test appended
  - `test/runner.test.ts` — AC16 judge test appended
  - `tasks/duration-parse/requirement.md` — verbatim prose
  - `tasks/duration-parse/task.json` — 5 canonical examples, armCSubset
  - `tasks/duration-parse/hidden-battery.json` — 12 hidden cases with coveredBy tags
  - `src/experiment/task.ts` — `loadTask`, `auditNoContamination`
  - `src/experiment/arms.ts` — `ArmId`, `E1A_SYSTEM`, `armSpec`, `buildPrompt`
  - `src/experiment/analysis.ts` — `cluster`, `splits`, `analyzeArm`, `evaluateCriteria`
  - `src/experiment/e1a.ts` — `runE1a` + CLI entry
  - `test/e1a.test.ts` — AC1–AC13 (23 test cases)

- Deviations:
  - `analysis.ts` exports `analyzeArm` as a separate function (not inlined into
    `splits`). The spec module layout says `splits(records, task)` but the data
    needed are `(hidden, armCSubset)` for index computation and records separately
    for pass-rate computation. Kept them separate for testability; `analyzeArm`
    wraps both. The exported surface satisfies all ACs.
  - `auditNoContamination` signature is `(prompts: readonly string[], hidden)` per
    spec. Error messages name the prompt index (e.g. "prompt[1]"), not the arm
    label — the caller knows the arm-to-index mapping. Satisfies AC4.

- Gaps found:
  - **Contamination check is input-only.** The spec says "input (or expected)
    substring." Expected values were not checked: `5400` appears in BOTH canonical
    examples (arm B prompt) and 3 hidden cases (decimal-hours, reversed-order,
    whitespace). Checking expected as a plain substring would false-positive on the
    real prompts, so only inputs are checked. The audit still catches the meaningful
    contamination vector (grunt seeing hidden input → knows the test case). Planner
    should decide: is expected-value checking desired, and if so at what granularity
    (whole-number match, quoted-JSON match)?
  - `// UNDECIDED:` — none. Every spec decision had a clear answer; no forks were
    resolved by guessing.

- Verify:

  ```
  npm run typecheck  →  clean (0 errors)
  npm test           →  42/42 pass, 0 fail
                        (19 existing + 2 AC16 + 21 e1a ACs = 42)
  ```

  Live `npm run e1a` not run (per notes-down: costs money, planner decision).

- Cost/time: ~5 min wall time. No model API calls made; offline only.

**Planner verdict (2026-06-10): ACCEPTED.** Independently re-ran
`npm run typecheck` (clean) + `npm test` (42/42). Reviewed all four experiment
modules + AC16 edits line by line against the spec; hand-checked the canon
arithmetic (10921 / 9000 / 3600 / 5400-decimal) — self-consistent, and the
test's reference impl passing all 12 hidden cases proves the battery is
satisfiable. Rulings on the two report items:

1. _Decomposition deviation_ (`analyzeArm` split out of `splits`) — accepted as
   an improvement; exported surface satisfies every AC.
2. _Contamination gap_ (input-only audit) — **grunt was correct; this was a
   spec bug, not an impl defect.** Expected values are shared by design between
   covered hidden cases and their canonical examples, so substring-checking
   expected would false-positive on every real run. The actionable leak vector
   is a hidden _input_. Grunt escalated instead of shipping a broken check —
   textbook fail-up. Spec amended (constraint + AC4) to pin input-only as the
   correct, complete check. No code change required.

---

## Log (accepted items)

- **H-11 · Entropy-reduction mandates (both layers)** — planner-built +
  accepted 2026-06-10. God's ruling on the H-6 root cause: control the author
  tier, leave grunts simple machines. (1) Dev loop: `specs/README.md` Rules
  gain the authoring mandates — every normative sentence maps to an AC that
  fails when violated; two-readings sentences must be killed by an AC;
  state/order rules get one AC per transition. (2) Product:
  `warboss-decomposition.spec.md` rev 2 — `DECOMPOSE_SYSTEM` gains four
  entropy-reduction sentences (mechanical rules not intent, falsifiable rules
  only, kill the second reading, one example per transition);
  `src/warboss.ts` updated in sync. (3) Applied retroactively to
  `loop-core.spec.md` rev 2: AC12 (stall-pair break — the H-6 hole) + AC6
  wording fix ("empty", not "prose" — `extractCode`'s raw-text fallback made
  the old wording a second two-readings instance, found in this review).
  132/132 green; no test pinned the old prompt string. H-10 now refs rev 2.

- **H-5 · E1a rev-3 rescore** — accepted 2026-06-10. `modalShare` on
  `ArmAnalysis`, rev-3 criterion 1, offline `rescore.ts` CLI with
  `provisional: true` stamping. Full item above.

- **H-7 · readiness-gate** — accepted 2026-06-10. `gruntJudge` (fail-closed
  READY/NOT READY parse) + `convergenceProbe` (k generations, survivor
  clustering, `survivorRate ≥ 0.5 && modalShare ≥ 0.9`). One process note on
  unreported cluster duplication. Full item above.

- **H-8 · sandbox-hardening** — accepted 2026-06-10. Two-layer process
  isolation (vm-in-child + `--permission`), `judgeAsync`, `isolation` task
  field. All five deviations ruled correct. Full item above.

- **H-9 · warboss-decomposition** — accepted 2026-06-10. `decompose`
  (1 decompose + one re-ask, mechanical throws mandate, 1 audit, ≤ 1 amend,
  freeze) + `admit` (judge → optional probe). Two spec gaps logged for the
  next rev (audit double-failure fail-open; `auditGaps` entry format). Full
  item above.

- **H-6 · loop-core** — NOT accepted (2026-06-10): stall-pair defect, fix
  queued as **H-10**. Everything else in the item verified good. Full item +
  verdict above.

- **H-4 · E1a harness rev 2** — built + accepted 2026-06-10. JS anchor in
  `E1A_SYSTEM`, viability gating (`applyViabilityGate` in `analysis.ts`,
  `viable` on `RunRecord`), dead-run guard (`live` flag, `deadRun` artifact
  stamp, nonzero CLI exit). 74/74 green. God authorized the live spend; **E1a-r2**
  ran clean (N=30×4, $0.585) and settled rung 1 — all three fixes verified on the
  live artifact. Verdict + the C1-instrument finding: `reports/e1a-r2-verdict.md`,
  plan rev 4. Full item above.

- **H-1 · E1a harness** — accepted 2026-06-10. AC16 (`throws` cases) + duration-parse
  assets + `src/experiment/{task,arms,analysis,e1a}.ts` + `test/e1a.test.ts`.
  42/42 tests green. One spec bug surfaced by the grunt and fixed in review
  (contamination audit is input-only by design). Full item above.

- **H-3 · Dev-loop cost hooks (both ranks)** — planner-built + accepted 2026-06-10.
  The thesis ("meter every worker, warbosses included") applied to our own build
  loop — the framework self-builds with its own metering. Two `.claude/settings.json`
  hooks run one role-tagged script `src/hooks/record-cost.ts`:
  - **`Stop` → `--kind claudecode.main`** — the main turn = the deciding layer
    (warboss/warchief/sergeant collapsed into the driving agent).
  - **`SubagentStop` → `--kind claudecode.subagent`** — a dispatched grunt.

  Both append to ONE stream, `runs/dev-cost-ledger.jsonl` — uniform format,
  `kind` is the role discriminator and `model` is on every row (so a tier-switch
  on the main thread is sliceable too). This is the substrate a later effort/cost
  dashboard tallies against. Each row: parses the transcript, prices every
  not-yet-recorded assistant turn (dev-model table in `cost-from-transcript.ts`,
  cost math via shared `costBreakdown`), dedup by message uuid (idempotent — Stop
  fires every turn against a growing transcript, only new messages append),
  requestId carried for account reconciliation. Hooks are `async: true` (never
  block the agent) + exit 0 on all paths. Pure core tested (`test/hooks.test.ts`,
  4 tests incl. kind-tagging); both kinds smoke-tested end-to-end into one ledger.
  Hardened against a stdin/transcript UTF-8 BOM. 51/51 green. Note: new hooks may
  need `/hooks` (reload) or a restart before first fire.

  _Caveat for later:_ a grunt run as a tier-switch on the MAIN thread (how H-1
  ran) tags `claudecode.main`, not `subagent` — the `model` field still shows it
  was cheap. Cleanest separation comes once grunts are dispatched as real Task
  subagents (then SubagentStop isolates doing-cost; Stop stays pure deciding-cost).

- **H-2 · Cost reconciliation logging** — planner-built + accepted 2026-06-10.
  Addresses the grunt's H-1 cost note. Membrane-core amended AC17–AC20:
  `costBreakdown` (itemized input/output/cache costs + rates), ledger entries
  now carry `requestId` (the Anthropic `request-id` join key to console usage
  logs) + `modelLabel` + the full breakdown, an injectable `LedgerSink`, and
  `src/ledger-sink.ts` `jsonlFileSink`. `Agent.generate` captures `_request_id`;
  `runE1a` writes a durable append-only `cost-ledger-<ts>.jsonl` (one line per
  call, crash-safe) alongside the results artifact. Built directly (not handed
  off) — it's the thesis's load-bearing metric (correctness-per-dollar), so by
  our own model-power-follows-entropy rule it stays on the planner tier.
  Confirmed via `claude-api` skill that `_request_id` is the SDK's reconciliation
  key. 47/47 tests green; typecheck clean. `costOf`/`costUsd` unchanged.
