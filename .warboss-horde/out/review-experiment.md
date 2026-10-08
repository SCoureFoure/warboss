# review-experiment

## Findings

### F1 — A run or rescore without arm A (or with missing fields) substitutes all-zero stats, so criteria 1 and 2 pass vacuously
- where: `src/experiment/e1a.ts:229` (and `src/experiment/rescore.ts:48`)
- severity: medium
- kind: fail-open
- evidence: "analysisMap[\"A\"] ?? defaultAnalysis(\"A\")," (e1a.ts:229); "analysis[\"A\"] ?? { clusterResult: { count: 0, sizes: [] } }" (rescore.ts:48)
- why: `--arms B,C` (CLI accepts any subset, e1a.ts:302) leaves A with `modalShare=0`, `coveredPassRate=0`. `evaluateCriteria` then computes `modalShare(A)=0 <= 0.7` and `coveredPassRate(B) - 0 >= 0.15`, so criteria 1 and 2 can print PASS with no A data. `rescore.ts:34-38` also turns any missing numeric field into `0` via `?? 0`, with the same effect.
- fix: In `evaluateCriteria` callers, throw (or mark each affected criterion `pass:false, detail:"arm A not run"`) when A, B or C is missing from the analysis, instead of defaulting to zeros.
- check: a test running `runE1a({arms:["B","C"], ...})` with a fake client that yields perfect impls, asserting `criteria.criterion1.pass === false` and `criterion2.pass === false`.

### F2 — `meanCostPerGreenSession` divides green-session cost by green count; the spec says total cost / green count
- where: `src/experiment/e1b.ts:153`
- severity: medium
- kind: drift
- evidence: "meanCostPerGreenSession: greenCount > 0 ? greenCost / greenCount : Infinity," vs spec `specs/e1b-harness.spec.md:130` "meanCostPerGreenSession: number; // totalCostUsd / greenCount; Infinity if greenCount=0"
- why: Criterion 4 asks for "cheap-model + retry cost-to-green". Failed, stalled and budget-exhausted sessions spend money but are excluded from the numerator, so the cost compared against Arm D (e1b.ts:189 `best.meanCostPerGreenSession < e1aArmD.meanCostUsd`) is understated. With the AC9 fixture (test/e1b.test.ts:427, 2 green at 0.02 plus 0.06 of failed spend) the spec formula gives 0.05, the code gives 0.02. `test/e1b.test.ts:427` pins the code's value, so spec and test disagree and one of them is wrong.
- fix: Owner decides which formula is intended. If the spec is right, use `totalCostUsd / greenCount` and update the test's expected value.
- check: update the `analyzeE1bArm` AC9 assertion to `0.05` (total cost 0.1 / 2 green); it fails before the fix.

### F3 — `smoke.ts` live call is metered into a Ledger with no JSONL sink
- where: `src/smoke.ts:76`
- severity: low
- kind: cost
- evidence: "const ledger = new Ledger();"
- why: The one live grunt call is recorded only in memory and printed. If the process dies after the SDK returns, there is no durable spend record, unlike every other runner (`jsonlFileSink`). Dispatch count is correct: exactly one live call.
- fix: Pass `jsonlFileSink(...)` to the `Ledger` constructor, or document smoke as exempt.
- check: none

### F4 — E4 reads "the latest `e2-*.json` in outDir" rather than the file `runE2` just wrote
- where: `src/experiment/e4.ts:605`
- severity: low
- kind: bug
- evidence: ".filter((f) => f.startsWith(\"e2-\") && f.endsWith(\".json\"))" / "const e2FileName = e2Files[e2Files.length - 1];"
- why: `runE2` returns only `{deadRun}`. E4 selects by lexical sort over a shared `--out` directory (default `runs`). A concurrent E2 run, or any `e2-<later ts>.json` already present (e.g. clock skew or a hand-copied artifact), is silently used as the E4 verdict source for `e4Criterion`, `grindingCostUsd` and `deadRun`.
- fix: Have `runE2` return `artifactPath` (and the parsed analysis) and have E4 use it directly.
- check: a test that pre-seeds `outDir` with `e2-99999999T999999Z.json` containing different analysis, runs `runE4` offline, and asserts `e4Criterion` reflects the fresh run.

### F5 — Every report/artifact path is second-resolution `<ts>` with no run id; a second run in the same second overwrites it and shares the appended ledger
- where: `src/experiment/e1a.ts:235` (same pattern e1b.ts:274, e2.ts:533, e3.ts:290, e4.ts:673, calibrate-gate.ts:173, calibrate-derive.ts:178, decompose-run.ts:222)
- severity: low
- kind: invariant
- evidence: "const fileName = `e1a-${ts}.json`;" with ts from ".replace(/\\.\\d{3}Z$/, \"Z\")"
- why: The milliseconds are stripped, so two runs started in the same second to the same `--out` write the same `*.json` (second overwrites first) and append to the same `cost-ledger-<ts>.jsonl`, mixing two runs' spend. In practice needs two launches within one second; offline tests do this readily.
- fix: Keep the milliseconds (or add a short random suffix) in the shared timestamp helper.
- check: call `runE1a` twice in the same second with the same `out`; assert two distinct artifact files exist.

### F6 — Criterion 3 passes vacuously when the NOT-covered-by-C set is empty
- where: `src/experiment/analysis.ts:101`
- severity: low
- kind: bug
- evidence: "if (records.length === 0 || indices.length === 0) return 0;"
- why: If every hidden case is `coveredBy` something in `armCSubset`, `notCoveredByCIndices` is empty, both arms get `0`, and `evaluateCriteria` (analysis.ts:142) yields `0 <= 0` = PASS. An empty split should be "not measurable", not a pass.
- fix: In `evaluateCriteria`, fail criterion 3 with a detail "no not-covered-by-C cases" when that set is empty (needs the split passed in, or a `null` rate).
- check: `evaluateCriteria` with an `ArmAnalysis` pair built from an empty split; assert `criterion3.pass === false`.

### F7 — `Infinity` cost-per-green is written to the JSON artifact as `null`
- where: `src/experiment/e1b.ts:285` (also e2.ts:521)
- severity: low
- kind: bug
- evidence: "analysis: Object.fromEntries(analysisByArm)," (analysis values include `meanCostPerGreenSession: Infinity`, e1b.ts:135/153)
- why: `JSON.stringify(Infinity)` is `null`. The artifact then says `meanCostPerGreenSession: null` for a zero-green arm, which a reader or a later rescorer cannot distinguish from a missing field; the spec types it as `number` ("Infinity if greenCount=0").
- fix: Serialise as a sentinel string/`null` explicitly and document it, or omit the field when `greenCount===0`.
- check: run e1b offline with a client that never goes green; assert the parsed artifact's field is not `undefined` and is documented as the sentinel.

### F8 — No runner refuses to start without `ANTHROPIC_API_KEY`
- where: `src/experiment/e1a.ts:290` (all CLI entries: e1b.ts:319, e2.ts:579, e3.ts:315, e4.ts:706, calibrate-gate.ts:198, calibrate-derive.ts:203, decompose-run.ts:382)
- severity: low
- kind: fail-open
- evidence: "runE1a(opts)" is called with `live: true` and no key check; `Agent` lazily builds `new Anthropic()` (agent.ts:35).
- why: With the key absent, the CLI issues requests that fail at the SDK. In `e1a.ts:54` `dispatchOne` swallows every error (`catch {`) and retries 3 times per job, so a 4-arm N=30 run makes ~360 failing calls and then reports `deadRun` only after finishing. No spend occurs, but it is not the "refuse" behaviour.
- fix: In each CLI entry, `if (!process.env.ANTHROPIC_API_KEY) { console.error(...); process.exit(1); }` before calling the runner.
- check: spawn the CLI with `ANTHROPIC_API_KEY` unset and assert nonzero exit with no output file.

### F9 — Per-record `coveredScore`/`uncoveredScore` use `1` for an empty split while the aggregate analysis uses `0`
- where: `src/experiment/e1a.ts:176`
- severity: low
- kind: drift
- evidence: ": 1;" (the `coveredScore` / `uncoveredScore` fallbacks at e1a.ts:176 and e1a.ts:184) vs "if (records.length === 0 || indices.length === 0) return 0;" (analysis.ts:101)
- why: The same empty split reports a perfect `1` in `runs[]` and `0` in `analysis`. The artifact is internally inconsistent; no criterion reads the per-record field today, so impact is on anyone reading `runs[]` directly.
- fix: Use the same sentinel in both places (or `null`).
- check: unit test with a task whose covered set is empty; assert record `coveredScore` equals `analysis.coveredPassRate`.

### F10 — `runWithConcurrency` implemented in five files
- where: `src/experiment/e1a.ts:61`, `src/experiment/e1b.ts:200`, `src/experiment/e2.ts:325`, `src/experiment/calibrate-gate.ts:66`, `src/experiment/calibrate-derive.ts:71`
- severity: low
- kind: dead-code
- evidence: "async function runWithConcurrency<T>(" (identical body in all five)
- why: Five copies of the same worker-pool; a fix in one (e.g. error handling) will not reach the others.
- fix: Export one copy from a shared module (e.g. `src/experiment/pool.ts`) and import it.
- check: none

### F11 — Timestamp construction duplicated in eight files
- where: `src/experiment/e1a.ts:93`, `e1b.ts:227`, `e2.ts:415`, `e3.ts:191`, `e4.ts:527` (and `e4.ts:577`), `calibrate-gate.ts:95`, `calibrate-derive.ts:100`, `decompose-run.ts:85`
- severity: low
- kind: dead-code
- evidence: ".replace(/[-:]/g, \"\")" / ".replace(/\\.\\d{3}Z$/, \"Z\");"
- why: Same 4-line expression copied; this is also why F5 cannot be fixed in one place.
- fix: One `runTimestamp()` helper.
- check: none

### F12 — CLI `getArg` helper duplicated in eight files
- where: `src/experiment/e1a.ts:295`, `e1b.ts:324`, `e2.ts:584`, `e3.ts:320`, `e4.ts:711`, `calibrate-gate.ts:203`, `calibrate-derive.ts:208`, `decompose-run.ts:283`
- severity: low
- kind: dead-code
- evidence: "return idx !== -1 && args[idx + 1] !== undefined ? args[idx + 1]! : def;" (variants without `def` in e2/e3/e4/decompose-run)
- why: Same flag parser in eight places, with two signatures (with and without default).
- fix: One shared `getArg(argv, flag)` helper.
- check: none

## Open questions
- `src/experiment/e1b.ts:92` — E1b's final hidden judge applies no viability gate (spec e1b-harness "Final hidden-battery judge" is ungated), but E1a Arm D's `meanPassRate` (which criterion 4 compares against at `e1b.ts:188`) is viability-gated (`e1a.ts:160`). Non-viable (unparseable) E1b sessions get free `throws` passes that Arm D's number does not. Is the asymmetry intended?
- `src/experiment/e2.ts:229` — E2/E4 scoring is also ungated for the same reason; the spec does not mention a gate. Intended?
- `src/experiment/calibrate-gate.ts:40` — `TASK_PATH = "tasks/duration-parse"` is relative to cwd, unlike the other runners which resolve from `_thisDir`; spec gate-calibration pins `loadTask("tasks/duration-parse")`. Run from any other directory it throws. Intended?
- `src/experiment/arms.ts:12` — `ArmSpec.usesContract` is set for every arm but never read in `src/` or `test/`. Dead field or planned?

## Files read
- src/experiment/analysis.ts
- src/experiment/e1a.ts
- src/experiment/e1b.ts
- src/experiment/e2.ts
- src/experiment/e3.ts
- src/experiment/e4.ts
- src/experiment/rescore.ts
- src/experiment/arms.ts
- src/experiment/task.ts
- src/experiment/calibrate-gate.ts
- src/experiment/calibrate-derive.ts
- src/experiment/decompose-run.ts
- src/smoke.ts
- src/agent.ts (imported; lines 30-120)
- src/loop.ts (grep only)
- src/warboss.ts (grep only)
- specs/e1a-harness.spec.md, specs/e1b-harness.spec.md, specs/e2-contract-authorship.spec.md, specs/e3-intent-divergence.spec.md, specs/e3-needle-matcher.spec.md, specs/e4-battery-authoring.spec.md (grep), specs/gate-calibration.spec.md (grep), specs/gate-judge-derive.spec.md (grep), specs/multi-task-replication.spec.md
- test/e1b.test.ts (lines 400-430)
