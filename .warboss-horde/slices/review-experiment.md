# review-experiment

First read `.warboss-horde/slices/_review-protocol.md` and follow it exactly.

- output: `.warboss-horde/out/review-experiment.md`
- scope: every file under `src/experiment/`, plus `src/smoke.ts`
- context: the matching spec for each runner is in `specs/` (`e1a-harness`, `e1b-harness`,
  `e2-contract-authorship`, `e3-intent-divergence`, `e3-needle-matcher`, `e4-battery-authoring`, `gate-calibration`,
  `gate-judge-derive`, `decompose-run`, `multi-task-replication`). Read the spec for a runner before judging it.

## What to look for

1. **Verdict integrity.** A pre-registered success criterion in a spec that the runner computes differently
   (different threshold, different denominator, `>=` versus `>`). Quote both the spec line and the code line.
2. **Hidden battery leak.** Hidden cases passed into a prompt, onto a `Contract`, or into feedback text.
3. **Un-metered spend.** A model call in an experiment that does not go through the `Ledger`, or a `Ledger` created
   without the JSONL sink so a crash loses the spend record.
4. **Statistics in `analysis.ts` / `rescore.ts`.** Division by zero on an empty arm; a mean taken over a filtered set
   while the count uses the unfiltered set; cost-per-correct computed when correct is `0`.
5. **Failed generations.** A generation that errored or returned no code being counted as a failed attempt in one
   place and excluded in another.
6. **Duplication.** The same helper (argument parsing, report writing, task loading, arm construction) implemented
   in three or more runner files. Report as one `dead-code` finding per helper, listing every `path:line`.
7. **Report writes.** A report path under `reports/` that a second run overwrites without a run id or timestamp.
8. **Offline safety.** A runner that makes a live call when `ANTHROPIC_API_KEY` is absent instead of refusing, or
   `smoke.ts` dispatching more than one live call.
