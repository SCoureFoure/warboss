# Spec — gate-judge derive-check (mechanical-enumeration readiness instrument)

> Status: active · rev 1 · Feature: gate-judge-derive · Added: 2026-06-12 · Maps to: readiness-gate spec lever 1 + gate-calibration verdict "Rework candidates" (`reports/gate-calibration-verdict.md`)
> Source of truth for a second readiness instrument, born from the
> gate-calibration FAIL: the LOW-tier `gruntJudge` (a *confidence* call —
> "are you READY?") anti-correlates with contract density (READY 0.85 for bare
> prose vs 0.70 for the full contract) and misses known Corollary-D holes (20/20
> READY on the partial contract whose bare-number hole is real). The verdict's
> rework candidate: ask the model to **mechanically enumerate the inputs whose
> output it cannot derive** from the prompt — a recall task, not a
> calibrated-confidence task. This spec builds that instrument (`deriveCheck`)
> and its calibration runner so the rework is falsified or confirmed on the same
> anchors that sank `gruntJudge`.
> Depends on: `specs/readiness-gate.spec.md` (`gruntJudge` shape, fail-closed
> parse, `Agent`/`Ledger` plumbing — `deriveCheck` is its sibling), and
> `specs/gate-calibration.spec.md` (the runner shape this mirrors).

## Requirement

Given the exact dispatch prompt a grunt would receive, the harness can ask the
LOW tier to mechanically enumerate every concrete input whose required output it
cannot derive from the prompt, and parse a fail-closed verdict
(`DECIDED` / `UNDECIDED` + the enumerated inputs). A calibration runner drives
this instrument N times against each of the three r2 prompt configs (A prose,
B full contract, C partial) and persists a timestamped artifact juxtaposing the
per-config DECIDED rate and the enumerated underivable inputs against the pinned
r2 modal-share anchors — so the rework can be read against the same signal that
falsified `gruntJudge`. Both pieces are metered and offline-testable via the
injected fake client.

## Constraints (inherited)

- **Cost-metered.** Every call routes through `Agent` → `Ledger`; the instrument
  reports its own `costUsd`, the runner embeds the full ledger.
- **Fail closed.** An unparseable verdict is never a green light (`ready: false`,
  `malformed: true`) — the `gruntJudge` dogma, carried verbatim.
- **What is judged is what ships.** The instrument sends `opts.prompt` verbatim;
  the runner builds each config's prompt with `buildPrompt(config, task)` and
  never rewraps — identical to gate-calibration, so the two instruments are
  compared on byte-identical inputs.
- **Reuse, don't rebuild:** `deriveCheck` lives beside `gruntJudge` in
  `gate.ts` and shares its API-attempt/transient-retry loop and parse skeleton;
  the runner is a near-clone of `calibrate-gate.ts` differing only in the
  instrument called and the per-config aggregate reported. No new plumbing.
- **The gate never amends a contract.** `deriveCheck` is an admission signal
  only; the enumerated inputs are advisory kick-back color until the calibration
  run proves the instrument trustworthy (same status `gruntJudge` holds today).

## Decisions (pinned 2026-06-12)

### Instrument — `deriveCheck`

```ts
src/gate.ts:

  deriveCheck(opts: DeriveCheckOptions): Promise<DeriveCheckVerdict>

  interface DeriveCheckOptions {
    agent: Agent;          // the tier that would DO the work (LOW by policy)
    prompt: string;        // the EXACT dispatch environment, verbatim
    kind?: string;         // ledger kind, default "gate.derive"
    tags?: Record<string, string | number>;
  }
  interface DeriveCheckVerdict {
    ready: boolean;                    // true iff first line is exactly DECIDED
    undecided: readonly string[];     // enumerated underivable inputs, empty when ready
    malformed: boolean;               // true → ready forced false (fail closed)
    raw: string;
    costUsd: number;
  }
```

- **System prompt (exact):**
  `You are the implementer who will receive this task. Do NOT rate your confidence. Mechanically enumerate the concrete inputs whose exact required output you cannot derive from the task text alone. First line of your reply: exactly DECIDED if you can derive the output for every input, or exactly UNDECIDED otherwise. If UNDECIDED, list each underivable input as a "- " bullet — the concrete input value followed by the one behavior the task leaves open — one per line, nothing else.`
- **User prompt:** `opts.prompt` verbatim — no rewrap, no summary.
- **Parse (mechanical, mirrors `gruntJudge`):** first non-empty trimmed line:
  - exactly `DECIDED` → `{ ready: true, undecided: [], malformed: false }`.
  - exactly `UNDECIDED` → `ready: false`; every subsequent line matching `/^- /`
    after trim becomes an `undecided` entry (the `- ` prefix stripped).
  - anything else → `{ ready: false, undecided: [], malformed: true }`.
    Fail closed.
- **`maxTokens: 1024`.** No `thinking` key. Up to 3 API attempts on transient
  throw (matching `gruntJudge`'s `MAX_API_ATTEMPTS`); all exhausted → treat as
  malformed, `costUsd: 0`, `raw: ""`.
- **Why this differs from `gruntJudge` (the hypothesis under test):**
  `gruntJudge` asks for a self-assessment ("are you READY?") — a confidence
  judgment the LOW tier mis-calibrates (rewards freedom, mis-reads density as
  surface to question, and over-claims on partial contracts). `deriveCheck`
  asks for an enumeration ("which inputs can't you derive?") — a mechanical
  recall task. The pre-registered bet: enumeration surfaces real holes
  (especially the partial contract's bare-number hole `gruntJudge` missed 20/20)
  and tracks density the right way (fewer undecided inputs for the full
  contract than for bare prose).

### Calibration runner — `runDeriveCalibration`

- **Module:** `src/experiment/calibrate-derive.ts` — exported
  `runDeriveCalibration(opts)` + CLI entry guarded as `calibrate-gate.ts` is.
  Near-clone of `calibrate-gate.ts`; the diffs are: it calls `deriveCheck`
  (not `gruntJudge`), and per config it reports a DECIDED rate + the enumerated
  inputs (not a READY rate + questions).
- **Configs (exact):** `["A", "B", "C"]`, prompt = `buildPrompt(config, task)`,
  `task = loadTask("tasks/duration-parse")`. No rewrapping.
- **Instrument call:** `deriveCheck({ agent, prompt, tags: { config, run } })`,
  default `kind` (`gate.derive`). Agent tier `TIERS.LOW`. Concurrency 4.
- **N:** default 20 per config, `--n` overrides.
- **Anchors (pinned constants, from r2, embedded verbatim):**
  `{ A: 0.60, B: 0.967, C: 0.967 }`. The runner computes NO pass/fail verdict —
  interpretation is human (see "useful signal" below); the artifact juxtaposes.

```ts
interface DeriveCalibrationOptions {
  client?: MessagesClient;   // fake for tests; omitted → real client
  n?: number;                // default 20
  out?: string;              // default "runs"
  live?: boolean;            // CLI true, tests false
}
interface ConfigDeriveCalibration {
  readonly decidedCount: number;     // first line exactly DECIDED
  readonly decidedRate: number;      // decidedCount / n (malformed in denominator)
  readonly malformedCount: number;
  readonly undecided: readonly string[];  // every verdict's undecided entries, call order, dups kept
}
interface DeriveCalibrationResult { readonly deadRun: boolean; }
```

- **Malformed counts as not-decided** (fail-closed): a malformed verdict
  increments `malformedCount`, never `decidedCount`; it stays in the `n`
  denominator (`decidedRate = decidedCount / n`).
- **`undecided` is the concatenation** of every verdict's `undecided` array for
  that config, in call order, **duplicates kept** — a repeated enumerated input
  marks a stable, real hole (the same "duplicates are signal" rule
  gate-calibration uses for questions).
- **Artifact** `runs/derive-calibration-<ISO8601-basic>.json`:

  ```json
  {
    "config": { "n": 20, "configs": ["A", "B", "C"], "task": "duration-parse" },
    "results": {
      "A": { "decidedCount": 0, "decidedRate": 0.0, "malformedCount": 0, "undecided": ["…"] },
      "B": { "…": "same shape" },
      "C": { "…": "same shape" }
    },
    "anchors": { "A": 0.60, "B": 0.967, "C": 0.967 },
    "ledger": [],
    "totalCostUsd": 0.0,
    "deadRun": false
  }
  ```

- **Dead-run guard:** `live: true` AND ledger total cost `0` → `deadRun: true`,
  loud `DEAD RUN` warning, CLI exits nonzero. Else `false`.
- **npm script:** `"calibrate-derive": "node --env-file=.env --import tsx src/experiment/calibrate-derive.ts"`.

### Useful signal (human-interpreted, pre-registered — NOT computed by the runner)

The rework is **confirmed** if, against the anchors:
1. **Density tracks the right way** — `decidedRate(B) > decidedRate(A)`
   (the full contract reads as MORE decided than bare prose), reversing
   `gruntJudge`'s anti-correlation (READY A 0.85 > B 0.70).
2. **The partial-contract hole is surfaced** — config C's `undecided` list
   names the bare-number input (`"90"`/bare integer) in a non-trivial fraction
   of calls. `gruntJudge` gave C 20/20 READY, 0 questions — blind to the hole.
   `deriveCheck` surfacing it is the core win.

The rework is **falsified** (and the convergence probe stays the sole gate) if C
still reads as DECIDED with no bare-number enumeration, or if density still
anti-correlates. Optional cheap follow-up named in the verdict, not built here:
a MID-tier sweep (~$0.07/config) to see if the instrument is tier-limited.

## Acceptance criteria (Given / When / Then)

1. **AC1 — DECIDED parse.** Fake client returning `DECIDED` → verdict
   `{ ready: true, undecided: [], malformed: false }`; captured request: the
   pinned system string, user content === `opts.prompt` verbatim,
   `max_tokens` 1024, no `thinking`.
2. **AC2 — UNDECIDED parse.** Fake client returning
   `UNDECIDED\n- "90": is a bare number seconds or minutes?\n- empty string behavior?`
   → `ready: false`, exactly those two `undecided` entries (`- ` stripped),
   `malformed: false`.
3. **AC3 — fail closed.** Fake client returning `I think I can mostly do this.`
   → `{ ready: false, undecided: [], malformed: true }`. Fake client that always
   throws → same shape, `costUsd: 0`, `raw: ""`.
4. **AC4 — DECIDED with stray bullets stays decided-empty.** Fake client
   returning `DECIDED\n- ignored bullet` → `ready: true`, `undecided: []`
   (bullets are only collected under an `UNDECIDED` first line — kills the
   wrong reading that bullets are always harvested).
5. **AC5 — calibration partition & rates.** Fake client scripted so config A
   gets 12×`DECIDED` + 8×`UNDECIDED\n- qA`, B gets 20×`DECIDED`, C gets
   20×`UNDECIDED\n- "90" hole` (n=20) → `results.A.decidedRate === 0.6`,
   `results.A.undecided` has 8 entries all `"qA"`; `results.B.decidedRate === 1`;
   `results.C.decidedRate === 0` and `results.C.undecided.length === 20`.
6. **AC6 — malformed is not decided.** One config's calls scripted as gibberish
   first line → that config's `malformedCount` equals the call count,
   `decidedCount === 0`, `decidedRate === 0`.
7. **AC7 — calibration prompts are r2 prompts.** Capture-assert: config B's
   prompt contains the frozen-contract hash line; config A's prompt is exactly
   `task.prose`.
8. **AC8 — artifact structure & cost.** `runDeriveCalibration` with fake client
   and `n: 2` writes exactly one `runs/derive-calibration-<ts>.json` containing
   `config`, `results` keyed exactly `A`/`B`/`C`, `anchors` equal to the pinned
   constants, `ledger`, and `totalCostUsd` equal to the ledger sum; emits one
   `cost-ledger-<ts>.jsonl`.
9. **AC9 — dead-run guard.** `live: true` + zero-cost fake ledger →
   `deadRun: true` in the artifact and a nonzero CLI exit path; `live: false`
   same fixture → no dead-run failure.

## Verifies-with

- Tests: `test/gate.test.ts` (AC1–AC4, beside the `gruntJudge` cases) and
  `test/calibrate-derive.test.ts` (AC5–AC9) — offline, fake `MessagesClient`.
- Integration: `node --env-file=.env --import tsx
  src/experiment/calibrate-derive.ts --n 20` live (≈60 LOW-tier calls,
  God-gated, ~$0.07); artifact under `runs/`, read against the "useful signal"
  paragraph. Verdict to `reports/derive-calibration-verdict.md`.
- Falsifies / experiment link: the gate-calibration rework hypothesis. If
  `deriveCheck` neither reverses the density anti-correlation nor surfaces C's
  bare-number hole, the mechanical-enumeration reframe is rejected and the
  convergence probe remains the sole admission gate (the standing consequence
  from `reports/gate-calibration-verdict.md`).
