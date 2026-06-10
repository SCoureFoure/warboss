# Spec — E1b harness (retry-in-place loop + feedback-granularity sub-arms)

> Status: active · Feature: e1b-harness · Added: 2026-06-10 · Maps to: PLAN Phase 2b (E1b)
> Source of truth for the second falsifier: the retry-in-place loop that tests
> whether cheap-model + frozen-contract + retry beats high-model one-shot on
> correctness-per-dollar. Closes out criterion 4 of the pre-registered E1
> success criteria.

## Requirement

The harness can run E1b end-to-end: load a task's assets, freeze the grader
contract, run N independent retry sessions per feedback-granularity sub-arm
(`passfail` / `input` / `full`), and for each session drive the loop
`generate → judge(contract) → append-feedback → retry` until the impl passes
the contract, budget is exhausted, or a stall is detected. Every session is
then scored against the hidden battery (never fed into the loop). The runner
reports per-arm green rate, mean attempts, stall rate, mean hidden-battery pass
rate, per-session cost, and evaluates criterion 4 of the pre-registered E1
success criteria — both persisted as a timestamped results artifact.

## Constraints (inherited)

- **Cost-metered.** Every generation routes through `Agent` → `Ledger`. Results
  artifact embeds the full ledger. No un-metered path.
- **Membrane immutability.** Grader contract is frozen once; every judge call
  passes `expectedHash` so a tampered contract throws `ContractHashMismatch`.
- **Hidden battery never leaks.** Hidden cases never appear in any prompt,
  feedback, or system string. The contamination audit (from `task.ts`) runs
  before dispatch. Hidden battery is used ONLY for post-session scoring — it is
  never part of the retry loop.
- **`node:vm` is not a security sandbox.** E1b tasks remain pure synchronous
  functions; the existing sandbox suffices.
- **Grunt is a doer, not a planner.** One `Agent.generate` call per attempt. No
  autonomous inner loop; the outer retry loop lives here in the runner.

## Decisions (pinned 2026-06-10)

### Experiment design

- **Feedback sub-arms** — the only experimental variable in E1b. Three arm IDs,
  each naming the granularity passed to `judge` for the per-attempt feedback:
  `"passfail"` / `"input"` / `"full"`. These reuse `Granularity` from
  `runner.ts` verbatim.
- **Model tier:** `TIERS.LOW` for all E1b sessions (same tier as E1a Arms A–C).
- **System prompt:** `GRUNT_DOGMA` from `agent.ts` (not `E1A_SYSTEM`). E1b
  tests the loop, not variance — the grunt should be told to implement literally
  and escalate undecided.
- **Initial prompt:** `buildPrompt("B", task)` from `arms.ts` — prose +
  full canonical contract. Identical to E1a Arm B to isolate the retry variable.
- **Retry prompt (attempt k ≥ 2):**
  ```
  {original prompt (prose + frozen contract)}

  Your previous attempt failed. Feedback:
  {feedback string from judging attempt k-1}
  ```
  If attempt k-1 produced no extractable code block, the feedback line is
  replaced with:
  ```
  Your previous attempt produced no extractable code block. Output ONLY a
  single fenced code block.
  ```
- **`maxTokens: 2048`** per generation.
- **`MAX_BUDGET = 5`** attempts per session.
- **Stall detection:** if attempt k's extracted code equals attempt k-1's
  extracted code (including both `undefined`), the session is immediately
  terminated with `stalled: true` without spending another API call. Stall is
  checked AFTER extracting code, BEFORE judging.
- **N default 30 per feedback arm**, overridable via CLI `--n`.
- **Concurrency: 4** sessions in flight at once (across all arms).
- **Transient-failure policy (per attempt):** an API call that throws is retried
  up to 2 times (3 attempts total at the infrastructure level). A call whose
  attempts are all exhausted is treated as producing no extractable code.

### Judging

- **Per-attempt judge** (determines pass/fail + feedback for retry):
  `judge(grader, code, { expectedHash: grader.hash, granularity, revealInFeedback: true })`
  — uses the canonical contract examples, NOT the hidden battery.
- **Final hidden-battery judge** (post-session scoring only):
  `judge(grader, finalCode, { battery: hidden, expectedHash: grader.hash })`
  — uses hidden battery; feedback is ignored.
- If `finalCode === undefined`, final vector = all-false of length `hidden.length`,
  final score = 0.

### Session record

```typescript
interface SessionRecord {
  feedbackArm: "passfail" | "input" | "full";
  sessionIndex: number;
  model: string;
  attempts: number;          // 1 .. MAX_BUDGET
  stalled: boolean;
  green: boolean;            // final attempt passed the grader contract
  finalCode: string | undefined;
  finalVector: readonly boolean[];  // hidden-battery vector, length = hidden.length
  finalScore: number;        // hidden-battery fraction passed
  totalCostUsd: number;
  totalWallMs: number;
}
```

### Analysis per feedback arm

```typescript
interface FeedbackArmAnalysis {
  feedbackArm: string;
  greenRate: number;               // green sessions / N
  meanAttempts: number;            // mean over all N sessions
  stallRate: number;               // stalled sessions / N
  meanFinalHiddenScore: number;    // mean finalScore over all N sessions
  meanCostPerGreenSession: number; // totalCostUsd / greenCount; Infinity if greenCount=0
  totalCostUsd: number;
}
```

### Criterion 4 (pre-registered E1 criterion)

Criterion 4: cheap-model + retry cost-to-green < high-model one-shot cost at
equal-or-better hidden-battery correctness.

Evaluated when `e1aArmD` stats are provided (via `RunE1bOptions.e1aArmD`):

```typescript
interface E1aArmDStats {
  meanHiddenScore: number;  // mean hidden-battery pass rate across Arm D runs
  meanCostUsd: number;      // mean cost per run in Arm D
}
```

**Best E1b arm** = arm with highest `greenRate`; ties broken by
`meanFinalHiddenScore` (higher = better), then by `meanCostPerGreenSession`
(lower = better).

**PASS:** `bestArm.meanFinalHiddenScore ≥ e1aArmD.meanHiddenScore` AND
`bestArm.meanCostPerGreenSession < e1aArmD.meanCostUsd`.

**FAIL:** either condition not met.

**Deferred:** `e1aArmD` not provided → detail = `"deferred (E1a Arm D data not provided)"`.

### Results artifact

`runs/e1b-<ISO8601-basic>.json`:
```json
{
  "config": { "n": 30, "feedbackArms": [...], "task": "duration-parse", "budget": 5 },
  "taskName": "duration-parse",
  "graderHash": "...",
  "sessions": [ ...SessionRecord[] ],
  "analysis": { "passfail": FeedbackArmAnalysis, "input": ..., "full": ... },
  "criterion4": CriterionVerdict,
  "ledger": [ ...LedgerEntry[] ],
  "totalCostUsd": 0.0
}
```

### Module layout

```
src/experiment/e1b.ts   runE1b(opts): exported fn + CLI entry
test/e1b.test.ts        AC1–AC12 (offline, fake MessagesClient)
```

Export from `e1b.ts`: `runE1b`, `MAX_BUDGET`, `FeedbackArm` type,
`SessionRecord` interface, `FeedbackArmAnalysis` interface, `analyzeE1bArm`.

### CLI

```
npm run e1b -- [--n 30] [--arms passfail,input,full] [--task duration-parse]
              [--out runs] [--e1a-arm-d path/to/e1a-artifact.json]
```

`--e1a-arm-d` loads the E1a artifact and reads `analysis.D.meanPassRate` and
`analysis.D.totalCostUsd / config.n` for criterion 4.

### `npm run e1b` script

Add to `package.json`: `"e1b": "tsx src/experiment/e1b.ts"`.

## Acceptance criteria (Given / When / Then)

1. **AC1 — green session.** Given a fake client that returns a failing impl on
   attempt 1 and a passing impl on attempt 2, a session records `attempts=2`,
   `green=true`, `stalled=false`, ledger has exactly 2 entries tagged
   `{feedbackArm, task, sessionIndex, attempt}`.

2. **AC2 — stall detection.** Given a fake client that always returns the same
   code: session records `stalled=true`, `green=false`, `attempts=2` (attempt 1
   + first repeat = stall), no third API call is made.

3. **AC3 — budget exhaustion.** Given a fake client that cycles through distinct
   failing impls for MAX_BUDGET attempts: session records `attempts=5`,
   `green=false`, `stalled=false`.

4. **AC4 — feedback injected into retry prompt.** Given a fake client that
   captures its prompt on attempt 2: the captured prompt contains the original
   prompt AND the phrase `"Your previous attempt failed. Feedback:"` followed by
   the judge feedback from attempt 1.

5. **AC5 — no-code retry prompt.** Given a fake client that returns empty text
   on attempt 1 then passing code on attempt 2: the attempt-2 prompt contains
   `"produced no extractable code block"`. Session records `green=true`,
   `attempts=2`.

6. **AC6 — feedback granularity arms differ.** Run `runE1b` with
   `feedbackArms: ["passfail", "full"]`, `n: 1`, with a fake client that always
   fails attempt 1 and succeeds attempt 2; capture the retry prompts. The
   `passfail` arm's retry prompt contains only a failure count (no input or
   expected); the `full` arm's retry prompt contains input and expected values.

7. **AC7 — hidden battery never in retry prompts.** Given the real
   duration-parse task, the contamination audit passes on all prompts built for
   E1b (including retry prompts built from the judge's feedback on canonical
   contract failures). Hidden battery inputs never appear.

8. **AC8 — final scoring against hidden battery.** Given a session that ends
   with the reference `CORRECT_IMPL`: `finalVector` has length 12, all true,
   `finalScore=1`. Given a session that ends with no code: `finalVector` all
   false, `finalScore=0`.

9. **AC9 — analysis computation.** Given synthetic sessions (known green/stall/
   attempts/finalScore/cost), `analyzeE1bArm` computes correct `greenRate`,
   `meanAttempts`, `stallRate`, `meanFinalHiddenScore`, `meanCostPerGreenSession`.
   `meanCostPerGreenSession` is `Infinity` when `greenRate=0`.

10. **AC10 — criterion 4 evaluation.** Given synthetic `E1aArmDStats` and a
    best-arm analysis: PASS when E1b hidden score ≥ E1a and cost < E1a; FAIL
    when either condition fails; PASS criterion detail includes actual values.
    Without `e1aArmD` → deferred string. Best-arm selection picks highest
    `greenRate` (ties broken by `meanFinalHiddenScore`).

11. **AC11 — results artifact structure.** `runE1b` with a fake client and
    `n=1` writes one JSON artifact under `out/` with `config`, `taskName`,
    `graderHash`, `sessions` (length = `n × |feedbackArms|`), `analysis` keyed
    by arm, `criterion4`, `ledger`, and `totalCostUsd` equal to ledger sum.
    Also emits `cost-ledger-<ts>.jsonl` with one line per successful API call.

12. **AC12 — model, system prompt, and ledger tags.** All E1b `Agent.generate`
    calls use `TIERS.LOW.id`; system is `GRUNT_DOGMA`; `maxTokens` is 2048.
    Ledger entries are tagged `{feedbackArm, task, sessionIndex, attempt}`.

## Verifies-with

- Tests: `test/e1b.test.ts` — AC1–AC12 (offline, fake `MessagesClient`).
- Integration: `npm run e1b -- --n 2 --arms full` with live key dispatches real
  sessions end-to-end and writes a `runs/` artifact (manual, not CI).
- Falsifies: E1 pre-registered criterion 4. Supply `--e1a-arm-d` path from a
  real E1a run to close out the economics comparison.
