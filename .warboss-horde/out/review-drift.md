# review-drift

## Findings

### F1 — membrane-core AC21 and AC22 have no test anywhere in test/
- where: `specs/membrane-core.spec.md:135`
- severity: medium
- kind: test-gap
- evidence: "**AC21 — throwsMatch** *(rev 2)*." and "`test/contract.test.ts` (AC3–4, AC16 hash, AC21 a–c)"
- why: A grep of `test/` for `AC21` and `AC22` returns no hits. The spec's Verifies-with block (line 152-153) says these ACs are covered in contract, runner and agent tests, so the throwsMatch and temperature rules have no traceable guard.
- fix: Add tests labelled `AC21 ...` and `AC22 ...` (or correct the Verifies-with block if the coverage is under other names).
- check: `npx tsx --test --test-name-pattern "AC2[12]" test/*.test.ts` finds zero tests now and should find at least one after the fix.

### F2 — readiness-gate AC21 has no test anywhere in test/
- where: `specs/readiness-gate.spec.md:368`
- severity: medium
- kind: test-gap
- evidence: "21. **AC21 — wilson rule + temperature (rev 3).** 8/8 one-cluster with" and "Tests: `test/gate.test.ts` — AC1–AC21, offline, fake `MessagesClient`."
- why: The spec claims `test/gate.test.ts` covers AC1 through AC21, but no file under `test/` contains the string `AC21`. The Wilson-bound rule has no traceable regression test.
- fix: Label the Wilson-rule and temperature tests in `test/gate.test.ts` with `AC21`, or correct the Verifies-with range.
- check: `npx tsx --test --test-name-pattern "AC21" test/*.test.ts` finds zero tests now and should find at least one after the fix.

### F3 — src/models.ts (TIERS and ModelSpec prices) is named by no spec
- where: `src/models.ts:40`
- severity: medium
- kind: drift
- evidence: "const TIERS"
- why: No file under `specs/` contains `models.ts` or the word `models`. CLAUDE.md says "Update id + price together; a wrong price silently corrupts the metric," but the pricing table has no spec that pins it.
- fix: Add a short section to an existing spec (for example membrane-core) that pins the TIERS ids and prices and names `src/models.ts`.
- check: `none` (a documentation gap; a check would need a spec-to-source mapping, which does not exist).

### F4 — src/hooks/record-cost.ts (metering hook) is imported by no test
- where: `.claude/settings.json:40`
- severity: medium
- kind: test-gap
- evidence: "\"command\": \"npx tsx \\\"$CLAUDE_PROJECT_DIR/src/hooks/record-cost.ts\\\" --kind claudecode.main\","
- why: `test/hooks.test.ts` imports only `src/hooks/cost-from-transcript.ts`. The grep of `test/` for `record-cost` returns nothing, so the Stop and SubagentStop hooks that write metered cost have no offline test. This is the cost-metering path the thesis is judged on.
- fix: Add a test that imports `src/hooks/record-cost.ts` (or runs it with a fixture payload) and asserts a ledger line is written.
- check: a test in `test/hooks.test.ts` that imports `../src/hooks/record-cost.ts` fails before the change (no import) and passes after.

### F5 — CLAUDE.md and run-warboss SKILL describe npm test as the harness suite only
- where: `CLAUDE.md:21`
- severity: low
- kind: drift
- evidence: "npm test            # full offline suite (tsx --test test/*.test.ts)"
- why: `package.json:12` now sets `"test": "npm run test:harness && npm run test:horde"`, so `npm test` also runs the plugin tests in `plugins/warboss-horde/test/`. The same stale command appears at `.claude/skills/run-warboss/SKILL.md:71`, which also hard-codes "# pass 294".
- fix: Change both lines to say `npm test` runs `test:harness` and `test:horde`, and drop the hard-coded test count.
- check: `none` (documentation text).

### F6 — package.json scripts test:harness, test:horde and viz are mentioned by no document
- where: `package.json:22`
- severity: low
- kind: drift
- evidence: "\"viz\": \"node --env-file=.env --import tsx scripts/viz.ts\""
- why: Searching CLAUDE.md, README.md, specs/ and the skills for the names `test:harness`, `test:horde` and `viz` finds only their definitions in package.json. (`rescore` is mentioned at `specs/e1a-harness.spec.md:144`.) `npm run viz` writes `runs/viz.html` and is undocumented.
- fix: Mention `npm run viz` in CLAUDE.md or README.md, and name `test:harness` and `test:horde` where `npm test` is described.
- check: `none`.

### F7 — CLAUDE.md links agents/doer.md, which does not exist at the repo root
- where: `CLAUDE.md:139`
- severity: low
- kind: drift
- evidence: "generic `doer` subagent (`agents/doer.md`, `model: inherit`)"
- why: Glob for `agents/*` at the repo root returns no files. The file exists only at `plugins/warboss-horde/agents/doer.md`, so the backticked path is wrong as written for a reader at the repo root.
- fix: Write the path as `plugins/warboss-horde/agents/doer.md`.
- check: `none`.

### F8 — specs/README.md index omits the gate-calibration spec
- where: `specs/README.md:100`
- severity: low
- kind: drift
- evidence: "| [e3-needle-matcher](e3-needle-matcher.spec.md) | E3 evaluator rev 2: tighten `E3_NEEDLES`"
- why: `specs/gate-calibration.spec.md` exists and is listed by Glob, but the index table has 17 rows and none links to `gate-calibration.spec.md`. The spec's ACs AC1 to AC5 are covered by `test/calibrate-gate.test.ts`, so the spec is orphaned from the index.
- fix: Add a row for `gate-calibration` with its feature, maps-to and status.
- check: `none`.

### F9 — Four ignore-required paths are not matched by .gitignore
- where: `.gitignore:36`
- severity: low
- kind: drift
- evidence: "plugins/**/.warboss-horde/"
- why: Of the seven paths the contract lists, `.env`, `node_modules`, and `.claude/settings.local.json` are ignored. NOT ignored: `reports/`, `.warboss-horde/out/`, `.warboss-horde/*.bak`, `.claude/scheduled_tasks.lock`. The only `.warboss-horde` rule (`.warboss-horde/gate.on`, line 30) is a single file, and the other `.warboss-horde` rule is scoped to `plugins/`.
- fix: Add ignore rules for the four paths if they are meant to be untracked. See the open question on `reports/`.
- check: `none` (a `git check-ignore` run per path would confirm it, but no test covers ignore rules).

## Open questions
- `specs/e1a-harness.spec.md:338` — AC16 has no hit in `test/e1a.test.ts`. The id grep is not spec-scoped: AC16 matches in `test/contract.test.ts:34`, `test/gate.test.ts:1`, `test/loop.test.ts:527` and others, so the check passes. Is the per-spec id check meant to be spec-scoped?
- `specs/sandbox-hardening.spec.md:50` — AC21 is a membrane-core id and is not defined in this spec, so it is not reported under check 4. Confirm that the spec should not define it.
- `CLAUDE.md:44` — `tasks/<x>/hidden-battery.json` contains a placeholder `<x>`, so it was not checked as a path.
- Check 5 base-name grep: `cost` and `smoke` match only prose or script names (`specs/membrane-core.spec.md:155` "npm run smoke"), and `ledger-sink` matches only a test filename (`specs/membrane-core.spec.md:154`). They are counted as mentioned under the literal protocol. Does the protocol want file-name matches (`cost.ts`, `smoke.ts`) instead?
- Check 6: `src/sandbox-child.mjs` is spawned by path (`specs/sandbox-hardening.spec.md:62`) and not imported. It is reported under F4's list scope only as "not imported"; it is not a defect by itself. `src/smoke.ts` is run via `package.json:15` and is also not imported. Both are left out of the findings above to keep F4 to the metering hook. Confirm whether that split is wanted.
- Check 7: `reports/` may be tracked on purpose, since `reports/README.md` is committed. Is it meant to be ignored?
- Check 7: `.claude/scheduled_tasks.lock` is absent from the git status snapshot, which suggests a global excludes file may be hiding it. The check looked only at `.gitignore`.

## Files read
- .warboss-horde/slices/_review-protocol.md
- .warboss-horde/slices/review-drift.md
- CLAUDE.md
- README.md
- package.json
- tsconfig.json
- .gitignore
- .env.example
- specs/README.md
- specs/membrane-core.spec.md (grep and targeted lines)
- specs/readiness-gate.spec.md (grep and targeted lines)
- specs/sandbox-hardening.spec.md (lines 44-68)
- specs/multi-task-replication.spec.md (grep)
- .claude/settings.json
- .claude/skills/run-warboss/SKILL.md
- .claude/skills/spec/SKILL.md
- src/contract.ts (lines 40-115)
- Grep and Glob passes over specs/, test/, src/, plugins/ and the repo root for the checks above
