# TODO

**Proof rule:** one new thing at a time. Each "Now" item ends with something runnable (a command that passes or
fails), not only a spec. An item with no pass/fail check is not ready — convert it (research, prototype,
groundwork) or park it under "Waiting on Leader".

Settled forks live in [docs/decisions.md](docs/decisions.md); it overrides the specs where they disagree.
Finding ids below (`core F4`, `plugin F8`, ...) point into `.warboss-horde/out/review-*.md` from the 2026-10-08 review.

## Now

1. **Amend step can rewrite frozen content** (`src/warboss.ts:532`, decompose F1). The amend reply may change or
   drop existing examples and requirements and the result is still frozen; `validateDrafts` checks shape only.
   Reported by review, not yet confirmed by reading the code. Proves: an amend can only add what the audit asked
   for. Runnable: a `test/warboss.test.ts` case with a scripted amend that flips one existing `expected`.

2. **Rerun the audit on or after 2026-10-28** to measure the idle relay against its 12.4% baseline:
   `node plugins/warboss-horde/scripts/audit.mjs --out .warboss-horde/out/audit-r3`, then compare the
   `## Idle relay` section with `.warboss-horde/out/audit-r2/summary.md`.

3. **Orchestrator file-traffic experiments** (2026-10-21, from `.warboss-horde/out/research-*.md`). Claim under
   test: most orchestrator cost is files passed around (reads in, contracts out), not execution.
   - **X0, prefix attribution — DONE 2026-10-21, PASS.** `audit.mjs` prices every block entering the prefix
     (`test/audit-x0.test.mjs`; run in `.warboss-horde/out/audit-x0/summary.md`, 36 sessions, $248). File share
     42.6% of attributed cost vs execution 5.3%. Top file classes: Read of src $17.29, Write of slices $10.25,
     Read of `.warboss-horde/` $5.55, Edit $5.29. Caveat: attribution covers 40.9% of read+write; the rest is mostly
     base prefix (B 47k x n calls) plus chars/4 undercount, so file traffic is ~20% of total spend, the biggest
     attributable slice but not a majority of the bill. Thinking is 28.8% of attributed. Next: X1 + X2.
   - **X1, drafter rung** (exergy matching, stigmergy, ant scouts). A MID doer reads code + intent and drafts the
     contract with a `forks:` list; the orchestrator reads only the draft. PASS: orchestrator $/green -30%, green
     rate within -5 pts. KILL: orchestrator rewrites > 50% of drafts, or two drafters' fork lists disagree.
   - **X2, contract = visible test file.** First used on X0 itself (`.warboss-horde/slices/audit-x0.md` points at
     the test). PASS: authoring output per slice -40%.
   - **X3, doer self-check** (ants: informed by the environment; fresh, small groups). Doer Bash limited by a hook
     to the contract's `selfcheck:` command (visible tests); hidden battery stays with the orchestrator. PASS: <= 3
     orchestrator calls per green slice, hidden-battery pass rate does not drop.
   - **X5, stall noise-kick** (ants D5; replaces batching). On a stall, a fresh doer with a different framing and the
     same contract, versus a same-framing retry. Offline check on 2026-10-21: only 10 red verdicts in all ledgers
     (all trickshot), under the n >= 30 needed. Unresolved offline; needs a live arm.
   - **X1/X2 pilot — DONE 2026-10-21** (`experiments/orchestrator/report.md`; harness `run.mjs`, `report.mjs`,
     `tasks.json`; 3 tasks x 3 arms x 3 reps, Opus orchestrator, hidden battery = real post-fix tests; ~$16.3 spent
     incl. runs lost to the usage limit).
     - A (baseline): 9/9 green, orchestrator $0.591/run, 11.1 calls, total $0.600/green.
     - **X1 drafter: MIDDLE.** 8/9 green. Orchestrator $0.415/run (-30%), 7.4 calls (-33%), zero src reads, but
       orchestrator $/green only -21% (needed -30%) and the Sonnet drafter ($0.13/run) brings total $/green to
       $0.615 (+2.5%). Cost moved down the ladder; it did not shrink. Next: Haiku drafter, and a task with bigger reads.
     - **X2 contract = test: KILL.** 7/9 green; authoring tokens -3% (needed -40%); orchestrator $/run -6%. The
       orchestrator still wrote a prose contract.
     - All 3 reds are one fork in my kick intent: the escalation error message order vs the hidden regex
       `/answers\[0\].*escalation/` (A 0/3, X1 1/3, X2 2/3 hit it). Author defect (under_decided), not an arm
       effect at n=3; pin the order in `tasks.json` before reps 4+.
   - X1-X3 and X5 spend API money: paired runs on past slices, >= 3 reps per arm, owner-gated.

## Next

- **Stream-split double count** (`src/hooks/cost-from-transcript.ts:119`, core F4). Two transcript records sharing
  one `requestId` across hook runs may be billed twice. Unconfirmed.
- **Backfill `est_usd: null` rows** in `.warboss-horde/ledger.jsonl`. About 57.8M `claude-fable-5` tokens are
  unpriced, so the board's dollar total and decide:do ratio understate the decide band.
- **Rescore past E1b / E2 verdicts** under the corrected `meanCostPerGreenSession` (total cost / green count).
  Offline, from stored `reports/` artifacts. Unknown whether any verdict flips.
- **Untested acceptance criteria** (drift F1, F2): membrane-core AC21, AC22 and readiness-gate AC21 have no test.
  Unconfirmed — the check grepped ids across all of `test/`, not per spec.
- **Runner helper duplication** (experiment F10-F12): `runWithConcurrency` in 5 files, `getArg` in 8, the timestamp
  builder in 8. Extract to one module.
- **Doc drift** (drift F5-F8): `CLAUDE.md:139` links `agents/doer.md` (lives under `plugins/warboss-horde/`);
  `npm test` is described as the harness suite only but also runs the horde suite; `specs/README.md` omits the
  gate-calibration spec; `src/models.ts` is named by no spec.
- **Smaller review findings not yet triaged**: core F5, F7; experiment F3-F9; plugin F10, F11.

## Waiting on Leader

- **Warn-mode hook field.** `bash-gate.mjs` warn mode now emits `hookSpecificOutput.additionalContext`. The test
  proves the output shape, not that Claude Code surfaces it. Needs one live check with `WARBOSS_BASH_GATE=warn`.
- **Fiat forks to confirm** — listed in [docs/decisions.md](docs/decisions.md) under "Fiat to confirm".
- **Keep this file?** `TODO.md` and `docs/decisions.md` were created on 2026-10-08 to trial the session prompt.
  The delegate skill says a repo with no per-effort work item should carry fog in-session rather than in a file.
  Decide whether these two files replace that rule here.

## Done

- 2026-10-21 — Ledger root walks up from the starting cwd to the nearest `.warboss-horde/` owner, bounded by the
  git root (plugin F8). Stray plugin ledgers parked in `.warboss-horde/out/stray-ledgers/`. A stray
  `C:\Users\SCora\.warboss-horde` exists outside any repo; left alone (no longer reachable by the walk).
- 2026-10-21 — Base-prefix cuts: warboss interactive base measured 37.2k -> 27.7k headless; delegate skill trimmed.

- 2026-10-08 — Repo review, 5 read-only slices, 43 findings. Lives in `.warboss-horde/out/review-*.md`.
- 2026-10-08 — `Contract.freeze` clones and deep-freezes examples; hash is lossless for `NaN`, `Infinity`, `-0`,
  nested `undefined`. `src/contract.ts`, membrane-core AC23-AC29.
- 2026-10-08 — A `throws` case passes only when the entry function itself threw; sandbox results carry a failure
  `kind`; child output is shape-validated. `src/sandbox*.ts`, `src/sandbox-child.mjs`, `src/runner.ts`.
- 2026-10-08 — `meanCostPerGreenSession` is total cost / green count, as the spec says. `src/experiment/e1b.ts`.
- 2026-10-08 — A run or rescore missing arm A, B, or C fails every criterion. `src/experiment/analysis.ts`
  (`evaluateCriteriaOrFail`), `e1a.ts`, `rescore.ts` (`rescoreCriteria`).
- 2026-10-08 — Zero survivors is never `ready`, in vector and outcome probe modes. `src/gate.ts`,
  readiness-gate AC22-AC25.
- 2026-10-08 — `loadOwnerAnswers` type-checks every field; `requirementId` default now applies. `src/kickback.ts`.
- 2026-10-08 — Bash gate: exact subagent / inline / exempt-command matching; warn mode no longer auto-approves.
  `plugins/warboss-horde/hooks/bash-gate.mjs`.
- 2026-10-08 — Subagent meter re-records a dispatch whose totals grew; `annotate latest` refuses on a tie.
  `plugins/warboss-horde/scripts/meter-subagent.mjs`, `ledger.mjs`.
- 2026-10-08 — Tests for the three untested scripts: `plugins/warboss-horde/test/meter-orchestrator.test.mjs`,
  `plugins/warboss-horde/test/dashboard.test.mjs`, `test/record-cost.test.ts`. Dashboard no longer crashes on an
  unparseable `ts` (`dashboard.mjs` `costChart`).
