# Spec — loop-core (retry-in-place: the core loop)

> Status: active · **rev 3** (2026-07-02: stall detection upgraded from exact consecutive string equality to two mechanical triggers — code-repeat over the unbroken run (catches A→B→A oscillation) and behavioral-signature repeat (catches textually different code with identical outcomes on every contract example, where the next retry prompt would be byte-identical to one that already failed). Both trackers reset on a `generationFailed` attempt, preserving rev 2's AC12 pair-break rule) · rev 2 (2026-06-10: AC12 stall-pair break + AC6 wording — H-6 review findings) · Feature: loop-core · Added: 2026-06-10 · Maps to: PLAN Phase 2b (core loop), "Loop mechanics" section
> Source of truth for the product's heart: `grunt generates → membrane judges
> (pass/fail + feedback) → retry-in-place until green`. E1b later orchestrates
> arms OVER this module; the loop itself is durable product infrastructure, not
> experiment scaffolding. This spec is written to be implemented by a low-tier
> model: every fork is decided here; nothing is left to interpret.

## Requirement

The harness can drive a single grunt against a single frozen contract to green:
given an agent, a frozen contract, and a caller-built initial prompt, the loop
generates an implementation, judges it against the contract (mechanical freeze
enforced on every judge call), and — on failure — renders feedback at a
configured granularity, builds a retry prompt, and tries again, until the
contract reports green, the attempt budget is exhausted, or a stall is
detected. Every attempt is metered; the result carries the full attempt
history and total cost-to-green. The default test path is offline and
deterministic via the injected fake client.

## Constraints (inherited)

- **Cost-metered.** Every generation routes through `Agent` → `Ledger`. No
  un-metered path. Cost-to-green is THE thesis metric — it must be a
  first-class output, not derivable-if-you-squint.
- **Membrane immutability.** Every `judge` call inside the loop passes
  `expectedHash: contract.hash`. A tampered contract throws
  `ContractHashMismatch` out of the loop (no catch — that error is sacred).
- **Hidden battery never enters the loop.** `runLoop` accepts NO battery
  parameter — feedback is built exclusively from the contract's own examples
  (the covered cases the grunt is allowed to see). Hidden-battery scoring of
  the final impl is the CALLER's post-hoc business. This is enforcement by
  API shape, not by discipline.
- **The grunt is a doer.** One `Agent.generate` per attempt. The loop owns
  retry policy; the agent stays a single dogmatic call.
- **Reuse, don't rebuild:** `judge` already renders feedback at three
  granularities (`runner.ts` `Granularity = "passfail" | "input" | "full"`)
  and `GRUNT_DOGMA` already exists in `agent.ts`. The loop composes them; it
  does not duplicate feedback rendering or system-prompt text.

## Decisions (pinned 2026-06-10)

### API

```ts
src/loop.ts:
  runLoop(opts: LoopOptions): Promise<LoopResult>

  interface LoopOptions {
    agent: Agent;                 // caller picks the tier
    contract: Contract;           // frozen; loop judges against THIS only
    prompt: string;               // initial decided environment (caller-built)
    granularity?: Granularity;    // default "full" (per PLAN default for covered cases)
    budget?: number;              // max attempts TOTAL, default 5 (PLAN: "max 5 attempts")
    system?: string;              // default GRUNT_DOGMA (production grunt path)
    maxTokens?: number;           // default 2048
    kind?: string;                // ledger kind, default "grunt.loop"
    tags?: Record<string, string | number>;  // merged into every attempt's tags
  }

  interface AttemptRecord {
    index: number;                // 1-based
    code: string | undefined;     // extracted impl, undefined on generation failure
    generationFailed: boolean;
    pass: boolean;                // judge pass (false when generationFailed)
    score: number;                // judge score (0 when generationFailed)
    vector: readonly boolean[];   // judge vector over CONTRACT examples ([] when generationFailed)
    feedback: string;             // what was (or would be) sent to the next attempt
    costUsd: number;
    wallMs: number;
  }

  interface LoopResult {
    status: "green" | "stalled" | "exhausted";
    green: boolean;               // status === "green"
    attempts: readonly AttemptRecord[];
    attemptsUsed: number;         // attempts.length
    finalCode: string | undefined; // code of the LAST attempt that produced code
    costUsd: number;              // sum over attempts — cost-to-green when green
    wallMs: number;               // sum over attempts
  }
```

### Loop semantics

- **Attempt flow:** generate → extract code → judge vs contract examples
  (`judge(contract, code, { expectedHash: contract.hash, granularity })`) →
  green? stop `"green"` : build retry prompt, next attempt.
- **Budget:** counts ATTEMPTS (generations), not retries. Budget 5 = at most 5
  `Agent.generate` calls. Exhausted without green → status `"exhausted"`.
- **Stall detection (rev 3 — two mechanical triggers).** The loop keeps two
  trackers over the current *unbroken run* of code-producing attempts; BOTH are
  cleared whenever an attempt is `generationFailed` (preserving rev 2's pinned
  pair-break rule, AC12):
  - **Trigger A — code repeat:** `seenCodes: Set<string>` of trimmed code. A
    current attempt whose trimmed code is already in the set → judged, recorded,
    status `"stalled"`. Subsumes rev 2's consecutive-equality rule and catches
    A→B→A oscillation (the retry prompt carries only the last attempt, so an
    oscillating model would loop forever unobserved).
  - **Trigger B — behavioral repeat:** after judging, the attempt's outcome
    signature `JSON.stringify(results.map(r => ({pass, actual ?? null, error ?? null})))`
    is compared to the PREVIOUS code-producing attempt's. Equal → recorded,
    status `"stalled"`: identical outcomes mean the next retry feedback would be
    byte-identical to one that already failed, so grinding is provably futile —
    a variable rename no longer defeats the check.
  Order per attempt: judge first (the stalled attempt's record carries its real
  judge results), green wins before any stall trigger, then A, then B.
  Escalation on stall (tier bump, tournament) remains the CALLER's policy —
  out of scope here, signaled by the status.
- **Retry prompt template** (exact; built from the ORIGINAL prompt + the LAST
  attempt only — constant-size context per Fractal Views; history never
  accumulates):

  ````text
  <original prompt>

  Your previous implementation:
  ```js
  <last attempt's code>
  ```

  Judge feedback:
  <feedback>

  Fix the implementation. Output ONLY one fenced code block.
  ````

  (For a `generationFailed` previous attempt, the "Your previous
  implementation" block is omitted and the feedback line is the fixed string
  `Your previous response contained no code block.`)
- **Generation failure:** an attempt whose response yields no extractable code
  is recorded `generationFailed: true`, counts against the budget, and the
  loop continues with the fixed feedback above.
- **Transient API errors:** same policy as E1a — a throwing call is retried up
  to 2 times (3 tries) within the SAME attempt; only successful calls are
  metered. All 3 tries throwing → the attempt is recorded
  `generationFailed: true` (cost 0) and the loop continues. This is
  infrastructure, not loop semantics.
- **Feedback granularity** is passed straight through to `judge` — the loop
  does not post-process feedback text. `revealInFeedback` stays at its default
  (`true`, since no battery is passed): contract examples are exactly the
  cases the grunt is allowed to see.
- **Ledger tagging:** every attempt's generate call carries
  `kind: opts.kind ?? "grunt.loop"` and `tags: { ...opts.tags, attempt: <index> }`.

### Non-goals (explicitly out of scope)

- No tier escalation, no tournament (Phase 3, caller policy on `"stalled"`).
- No hidden-battery evaluation (caller's post-hoc step).
- No E1b orchestration (separate spec when the experiment is funded).
- No prompt authoring — the caller builds the initial decided environment.

## Acceptance criteria (Given / When / Then)

1. **AC1 — green first try.** Fake client returning a correct impl → result
   `status: "green"`, `green: true`, 1 attempt, `finalCode` set, attempt 1 has
   `pass: true`, `vector` length = contract example count, feedback `""`.
2. **AC2 — feedback-driven retry to green.** Scripted fake client (call 1 → a
   wrong-but-valid impl, call 2 → correct impl) → `status: "green"`,
   2 attempts; attempt 1 has `pass: false` and non-empty feedback; the SECOND
   request's prompt contains the original prompt, attempt 1's code, and
   attempt 1's feedback per the pinned template.
3. **AC3 — granularity passthrough.** With the scripted wrong→right client:
   `granularity: "full"` → attempt 1 feedback contains `got` and `expected`;
   `"input"` → contains the failing input but neither `got` nor `expected`;
   `"passfail"` → matches `/^\d+ case\(s\) failed\.$/`.
4. **AC4 — stall detection.** Fake client returning the SAME wrong impl every
   call → loop stops at exactly 2 attempts with `status: "stalled"`
   (budget 5 NOT consumed), both attempts recorded, `green: false`.
5. **AC5 — budget exhaustion.** Fake client returning a DIFFERENT wrong impl
   each call (e.g. distinct constants) → exactly `budget` attempts,
   `status: "exhausted"`, `green: false`, `finalCode` = last code.
6. **AC6 — generation failure counts and continues.** Scripted client
   (call 1 → an EMPTY response, call 2 → correct impl) → 2 attempts; attempt
   1 `generationFailed: true`, `pass: false`, `vector: []`; the second
   request's prompt contains `Your previous response contained no code block.`
   and NO "Your previous implementation" block; `status: "green"`.
   _(rev 2 wording: "empty", not "prose" — `extractCode` falls back to raw
   trimmed text, so a non-empty prose response is treated as code, not as a
   generation failure.)_
7. **AC7 — no battery, no leakage.** Type-level: `LoopOptions` has no battery
   field. Behavioral: with a contract whose examples are distinct from a known
   "hidden" set, run the wrong→right script and assert no hidden input string
   appears in ANY captured request prompt (feedback can only name contract
   examples).
8. **AC8 — mechanical freeze.** A contract object whose hash was tampered
   (e.g. judging with a mismatched frozen registration via a contract clone)
   makes the loop throw `ContractHashMismatch` — the error propagates, no
   retry consumes budget on it.
9. **AC9 — metering.** Wrong→right script → ledger has exactly 2 entries
   tagged `attempt: 1` / `attempt: 2`, kind `grunt.loop`; `result.costUsd`
   equals the sum of the attempts' `costUsd` and of the ledger entries.
10. **AC10 — transient retry inside an attempt.** Client that throws once then
    returns the correct impl → 1 attempt, `status: "green"`, exactly 1 ledger
    entry. Client that always throws → `budget` attempts all
    `generationFailed: true`, `status: "exhausted"`, 0 ledger entries, no
    throw out of `runLoop`.
11. **AC11 — constant-size context.** Three-attempt script (wrong A → wrong B
    → correct): the THIRD request's prompt contains attempt 2's code but NOT
    attempt 1's code (history does not accumulate).
12. **AC12 — failed generation breaks the stall pair** _(rev 2; H-6 defect,
    H-10 fix)_. Scripted client `[code X, empty, code X, empty, empty]`,
    budget 5 → all 5 attempts run, `status: "exhausted"`, never `"stalled"`.
    Pins the only-consecutive reading of the stall rule: attempts 1 and 3 are
    NOT a stall pair even though they are consecutive _code-producing_
    attempts — the failed generation between them resets the pair.

13. **AC13 — oscillation stall** *(rev 3)*. Script wrong impl A → different
    wrong impl B → A again (all code-producing, distinct behaviors) → exactly
    3 attempts, `status: "stalled"`, `green: false` (Trigger A across the run,
    not just consecutive).
14. **AC14 — behavioral stall** *(rev 3)*. Script two textually DIFFERENT wrong
    impls with identical judge outcomes on every contract example → 2 attempts,
    `status: "stalled"` (Trigger B; a rename/comment no longer defeats stall).
15. **AC15 — generation failure clears rev-3 trackers** *(rev 3)*. Script
    `[code X, empty, code X, empty, empty]`, budget 5 → all 5 attempts,
    `status: "exhausted"`, never `"stalled"` (AC12's pair-break holds against
    BOTH new trackers).
16. **AC16 — no false stall on distinct sequences** *(rev 3)*. Script wrong A →
    wrong B → correct C (all distinct code and behavior) → `status: "green"`
    at attempt 3 (the trackers never misfire on genuine progress).

## Verifies-with

- Tests: `test/loop.test.ts` — AC1–AC16, offline, fake `MessagesClient`
  (reuse the capture pattern from `test/e1a.test.ts`).
- Integration: E1b (when funded) drives this module live; until then a manual
  smoke `runLoop` against duration-parse with a live key is optional, not CI.
- Falsifies / experiment link: E1b criterion 4 (economics) is measured as this
  module's `costUsd`-to-green vs the r2 Arm D baseline.
