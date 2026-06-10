# Spec — readiness-gate (grunt-readiness admission check)

> Status: active · Feature: readiness-gate · Added: 2026-06-10 · Maps to: PLAN "The grunt is a doer, not a planner" lever 1 + pinned idea (2026-06-09, grunt-tier readiness judge)
> Source of truth for the admission check: no task is dispatched to a grunt
> until its contract's residual interpretation latitude is proven low.
> Two instruments, cheap-first: a LOW-tier **grunt judge** (single call: "is
> this decided enough for you?") backed by the expensive **K-impl convergence
> probe** (generate K, keep survivors, measure behavioral convergence).
> E1a-r2 is the calibration anchor: its viable-only modal shares are the
> numbers the thresholds below are pinned against. This spec is written to be
> implemented by a low-tier model: every fork is decided here.

## Requirement

Given a frozen contract and the exact dispatch prompt a grunt would receive,
the gate can (a) ask the LOW tier itself whether the task is fully decided and
parse a mechanical READY / NOT READY verdict with the undecided questions, and
(b) run K independent single-shot generations, keep the implementations that
satisfy the frozen contract, score the survivors against a caller-provided
probe battery, and report convergence (modal share) plus the exact probes the
survivors disagree on. Both instruments are metered, offline-testable via the
injected fake client, and return structured verdicts a dispatcher can gate on.

## Constraints (inherited)

- **Cost-metered.** Every call routes through `Agent` → `Ledger`. The probe is
  the expensive backstop (K generations); its cost must be visible in its
  verdict.
- **Membrane immutability.** Survivor selection judges against the frozen
  contract with `expectedHash: contract.hash`.
- **Coverage is a gate, not a metric** (Corollary D): the gate's output is a
  dispatch decision input. A NOT-READY verdict kicks the contract back up with
  the questions attached — fail-up applied to admission. The gate itself never
  amends a contract.
- **Probes are not the hidden battery.** The probe battery is a caller-provided
  held-out set used to measure convergence BETWEEN survivor impls. It may
  never appear in any generation prompt (same contamination rule as E1a; the
  generations see only prose + contract).
- **Reuse, don't rebuild:** survivor judging is `judge` from `runner.ts`;
  generation is `Agent.generate`; modal share is the rev-3 e1a measure
  (cluster sizes over vectors). No parallel implementations.

## Decisions (pinned 2026-06-10)

### API

```ts
src/gate.ts:

  // Instrument 1 — cheap front line (one LOW-tier call)
  gruntJudge(opts: GruntJudgeOptions): Promise<GruntJudgeVerdict>

  interface GruntJudgeOptions {
    agent: Agent;          // the tier that would DO the work (LOW by default policy)
    prompt: string;        // the EXACT dispatch environment (prose + contract slice)
    kind?: string;         // ledger kind, default "gate.judge"
    tags?: Record<string, string | number>;
  }
  interface GruntJudgeVerdict {
    ready: boolean;
    questions: readonly string[];  // undecided forks, empty when ready
    malformed: boolean;            // true → ready is forced false (fail closed)
    raw: string;                   // full model text, for audit
    costUsd: number;
  }

  // Instrument 2 — expensive backstop (K generations + convergence)
  convergenceProbe(opts: ProbeOptions): Promise<ProbeVerdict>

  interface ProbeOptions {
    agent: Agent;
    contract: Contract;               // frozen; survivor selection target
    prompt: string;                   // exact dispatch environment
    probes: readonly ContractCase[];  // held-out probe battery (caller-provided)
    k?: number;                       // default 8
    system?: string;                  // default E1A-style neutral JS anchor (see below)
    maxTokens?: number;               // default 2048
    kind?: string;                    // default "gate.probe"
    tags?: Record<string, string | number>;
  }
  interface ProbeVerdict {
    ready: boolean;
    k: number;
    survivors: number;
    survivorRate: number;             // survivors / k
    modalShare: number;               // largest probe-vector cluster / survivors; 0 when no survivors
    disagreements: readonly {
      probeIndex: number;
      name?: string;
      split: Record<string, number>;  // vector-key → count, only probes where survivors differ
    }[];
    costUsd: number;
  }
```

### Grunt judge

- **System prompt (exact):**
  `You are the implementer who will receive this task. Judge ONLY whether the task is fully decided — zero interpretation latitude left. First line of your reply: exactly READY or NOT READY. If NOT READY, list every undecided question as a "- " bullet, one per line, nothing else.`
- **User prompt:** `opts.prompt` verbatim — the gate does not rewrap or
  summarize the dispatch environment (what is judged must be what is shipped).
- **Parse (mechanical):** first non-empty line, trimmed:
  - exactly `READY` → `{ ready: true, questions: [], malformed: false }`.
  - exactly `NOT READY` → `ready: false`; every subsequent line matching
    `/^- /` (after trim) becomes a question (the `- ` prefix stripped).
  - anything else → `{ ready: false, questions: [], malformed: true }`.
    **Fail closed:** an unparseable judge is never a green light.
- `maxTokens: 1024`. No thinking key. One call, no retry beyond the standard
  transient policy (throw retried ≤2 times; exhausted → treat as malformed,
  cost 0).
- **Open question this instrument exists to answer (recorded, not built now):**
  does LOW-tier READY correlate with high probe/E1a modal share, or does it
  over-claim? Calibration protocol (a future, God-gated live run): run
  `gruntJudge` N=20 times against each of the three r2 prompt configs — arm A
  (prose only), arm B (full contract), arm C (partial) — and compare READY
  rates against the r2 modal shares (A 0.60 / B 0.967 / C 0.967). Useful
  signal looks like: READY rate high for B, low for A. C is the interesting
  probe: its r2 modal share is high but its bare-number hole is real — if the
  judge says READY for C, the judge misses Corollary D holes and the probe
  stays mandatory for partial contracts.

### Convergence probe

- **Flow:** dispatch `k` independent generations (same prompt, same system;
  concurrency 4; transient retry ≤2 per call, failed-out generations count as
  non-survivors) → for each impl, `judge(contract, code, { expectedHash })`;
  survivor iff `pass === true` (satisfies the FULL frozen contract) → each
  survivor judged against `probes`
  (`judge(contract, code, { battery: probes, expectedHash })`) → probe
  vectors → clusters (same vector-key clustering as `analysis.ts cluster`).
- **System default (exact):** the E1a rev-2 string —
  `Implement the requested function in JavaScript. Output ONLY one fenced code block. No prose.`
  (neutral: the probe measures the CONTRACT's latitude, not dogma effects).
- **Verdict rule (pinned):** `ready = survivorRate ≥ 0.5 && modalShare ≥ 0.9`.
  - *Calibration anchor (r2):* B-config modal share 0.967 → ready;
    A-config 0.60 → not ready. Thresholds carry the same **provisional**
    status as the rev-3 C1 instrument — revisit after E1b provides a second
    dataset; do not silently tune them per-task.
- **`disagreements`** lists only the probes whose survivor vectors differ —
  this is the actionable kick-back payload: each disagreement names a behavior
  the contract does not pin (the spec-bug finder, mechanically).
- **No probes provided (`probes.length === 0`) → throw** a descriptive error.
  Convergence over zero probes is meaningless; the caller must supply a probe
  battery (auto-generation of probes is Phase 4 / decomposition territory).
- **Contamination audit:** before dispatch, assert no probe input's JSON
  appears as a substring of the prompt (reuse `auditNoContamination` shape:
  inputs only, same rationale as e1a-harness rev 1 amendment).

### Composition policy (pinned, minimal)

- Cheap-first: a dispatcher calls `gruntJudge`; on NOT READY it kicks up
  immediately (probe money saved). On READY, the probe is the backstop for
  contracts that warrant it. **The composition lives in the dispatcher
  (decomposition spec), not here** — this module exports the two instruments
  only. No `checkReadiness` combinator in this change set.

## Acceptance criteria (Given / When / Then)

1. **AC1 — judge READY parse.** Fake client returning `READY` → verdict
   `{ ready: true, questions: [], malformed: false }`; captured request: the
   pinned system string, user content === `opts.prompt` verbatim,
   `max_tokens` 1024, no `thinking`.
2. **AC2 — judge NOT READY parse.** Fake client returning
   `NOT READY\n- what does "1h90m" mean?\n- negative input behavior?` →
   `ready: false`, exactly those two questions (prefixes stripped),
   `malformed: false`.
3. **AC3 — judge fails closed.** Fake client returning `Sure! This looks
   doable.` → `{ ready: false, malformed: true }`. Fake client that always
   throws → same shape, `costUsd: 0`.
4. **AC4 — probe survivor selection.** k=4 scripted impls: 2 correct (pass the
   contract), 1 wrong-value, 1 no-code → `survivors: 2`,
   `survivorRate: 0.5`; the wrong and failed generations appear in no cluster.
5. **AC5 — probe convergence + ready.** k=4, all 4 survive, all agree on every
   probe → `modalShare: 1`, `ready: true`, `disagreements: []`.
6. **AC6 — probe disagreement reporting.** k=4, all survive the contract, but
   2 throw on a probe input and 2 return a value → `modalShare: 0.5`,
   `ready: false`, `disagreements` names exactly that probe (index + name)
   with a 2/2 split.
7. **AC7 — zero survivors.** All k impls fail the contract →
   `{ ready: false, survivors: 0, modalShare: 0 }`, no throw.
8. **AC8 — empty probes throws.** `probes: []` → descriptive error naming the
   field, before any model call (ledger empty).
9. **AC9 — probe contamination audit.** A prompt containing a probe input's
   JSON → descriptive throw naming the probe, before any model call.
10. **AC10 — metering + freeze.** Probe run: ledger has k entries kind
    `gate.probe`; verdict `costUsd` equals their sum. Judging path passes
    `expectedHash` (tampered contract → `ContractHashMismatch` propagates).

## Verifies-with

- Tests: `test/gate.test.ts` — AC1–AC10, offline, fake `MessagesClient`.
- Integration: calibration protocol above (live, God-gated, not CI) — its
  output decides whether `gruntJudge` is a trustworthy front line or the probe
  stays mandatory.
- Falsifies / experiment link: if `gruntJudge` READY does not correlate with
  probe modal share on the calibration run, the cheap front line is dropped
  and the probe is the gate (the pinned idea is falsifiable, and this is its
  instrument).
