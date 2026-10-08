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

## Next

- **Stream-split double count** (`src/hooks/cost-from-transcript.ts:119`, core F4). Two transcript records sharing
  one `requestId` across hook runs may be billed twice. Unconfirmed.
- **Meters write the ledger relative to session `cwd`** (plugin F8). Explains the stray
  `plugins/warboss-horde/.warboss-horde/ledger.jsonl` and `plugins/warboss-horde/scripts/.warboss-horde/ledger.jsonl`.
  Fix: walk up to the directory that owns `.warboss-horde/`, as `bash-gate.mjs` `findMarker` already does. Then
  delete the two stray ledgers.
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

- **Model prices.** `plugins/warboss-horde/tiers.json` and `src/models.ts` prices are unverified; `tiers.json`
  carries its own "VERIFY" note and prices any id containing `opus` at `15/75`. A wrong price silently corrupts
  the metric. Needs the current price sheet.
- **Warn-mode hook field.** `bash-gate.mjs` warn mode now emits `hookSpecificOutput.additionalContext`. The test
  proves the output shape, not that Claude Code surfaces it. Needs one live check with `WARBOSS_BASH_GATE=warn`.
- **Fiat forks to confirm** — listed in [docs/decisions.md](docs/decisions.md) under "Fiat to confirm".
- **Keep this file?** `TODO.md` and `docs/decisions.md` were created on 2026-10-08 to trial the session prompt.
  The delegate skill says a repo with no per-effort work item should carry fog in-session rather than in a file.
  Decide whether these two files replace that rule here.

## Done

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
