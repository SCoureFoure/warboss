# Spec — readiness-gate (grunt-readiness admission check)

> Status: active · **rev 2** (2026-06-12: instrument statuses settled by three live runs — `gruntJudge` FAIL as gate (READY anti-correlates with anchors, `reports/gate-calibration-verdict.md`), `deriveCheck` FAIL as gate (decidedRate saturates 0.000, precision broken, `reports/derive-calibration-verdict.md`), `admit`-in-anger miss (E2 contract passed with 0 questions over 2 real ambiguities, `reports/e2-verdict.md`) — **introspective instruments are unwired from admission decisions; behavioral divergence is the only gate signal.** New instrument: **`intentProbe`** — contract-free K-grunt divergence over the PROSE intent, run BEFORE freezing, because the E2 measurement proved the freeze itself destroys divergence: every per-case rate was 0/30 or 30/30, so post-freeze probing cannot see a fiat resolution) · Feature: readiness-gate · Added: 2026-06-10 · Maps to: PLAN "The grunt is a doer, not a planner" lever 1 + pinned idea (2026-06-09, grunt-tier readiness judge — falsified as gate, instrument retained)
> Source of truth for the admission check: no task is dispatched to a grunt
> until its contract's residual interpretation latitude is proven low.
> Rev-2 instrument roster:
>
> - **`convergenceProbe`** — K impls vs a FROZEN contract; survivors clustered
>   by probe-vector. Detects contract holes grunts genuinely diverge on.
>   **The only admission gate** (composition: warboss-decomposition rev 4).
> - **`intentProbe`** (rev 2, new) — K impls from the PROSE intent, no
>   contract; outcomes clustered per candidate input. Detects
>   intent-underdetermined semantics BEFORE a warboss freezes a fiat
>   resolution into them. Report-only until E3 calibrates thresholds.
> - **`gruntJudge` / `deriveCheck`** — introspective; falsified as gates
>   (three independent FAILs). Kept exported for calibration sweeps ONLY;
>   never wired into a dispatch decision.
>
> E1a-r2 is the calibration anchor: its viable-only modal shares are the
> numbers the thresholds below are pinned against. This spec is written to be
> implemented by a low-tier model: every fork is decided here.

## Requirement

Given a frozen contract and the exact dispatch prompt a grunt would receive,
the gate can (a) ask the LOW tier itself whether the task is fully decided and
parse a mechanical READY / NOT READY verdict with the undecided questions
(calibration instrument only — falsified as a gate), and
(b) run K independent single-shot generations, keep the implementations that
satisfy the frozen contract, score the survivors against a caller-provided
probe battery, and report convergence (modal share) plus the exact probes the
survivors disagree on. (c) **Rev 2:** given a PROSE intent (no contract) and
a candidate input set, the gate can run K independent generations from the
prose alone, execute every viable implementation over every candidate input
in the sandbox, cluster the raw outcomes per input, and report exactly which
inputs the population disagrees on — the behavioral measurement of
intent-underdetermined semantics, taken BEFORE a warboss freezes a fiat
resolution into them. All instruments are metered, offline-testable via the
injected fake client, and return structured verdicts a dispatcher can gate on
(or, for `intentProbe` until E3 calibrates it, report on).

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
  (cluster sizes over vectors); contract-free execution (rev 2,
  `intentProbe`) is `runImpl` from `sandbox.ts` — the probe never reimplements
  sandboxing or code extraction. No parallel implementations.

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

  // Instrument 3 (rev 2) — pre-freeze intent-divergence probe (K generations,
  // NO contract, outcomes clustered per candidate input)
  intentProbe(opts: IntentProbeOptions): Promise<IntentProbeVerdict>

  interface IntentProbeOptions {
    agent: Agent;                           // the tier that would DO the work (LOW by policy)
    prompt: string;                         // PROSE intent + entry/signature line — NO contract section
    entry: string;                          // function name impls must define (execution target)
    inputs: readonly (readonly unknown[])[];// candidate inputs (arg tuples); MUST be non-empty
    k?: number;                             // default 8
    system?: string;                        // default PROBE_DEFAULT_SYSTEM (same neutral JS anchor)
    maxTokens?: number;                     // default 2048
    kind?: string;                          // ledger kind, default "gate.intent"
    tags?: Record<string, string | number>;
  }

  interface IntentProbeVerdict {
    k: number;
    generated: number;                      // impls that produced code (extractCode non-undefined)
    viable: number;                         // generated impls with ≥1 non-throw outcome (counted in clusters)
    nonviable: number;                      // generated impls that threw on EVERY input (excluded)
    splits: readonly {
      inputIndex: number;                   // index into opts.inputs
      input: readonly unknown[];            // the tuple, verbatim
      outcomes: Record<string, number>;     // outcome-key → viable-impl count; ≥2 keys by construction
    }[];                                    // ONLY inputs where viable impls disagree — the kick-back payload
    decidedRate: number;                    // (inputs.length - splits.length) / inputs.length; 0 when viable === 0
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
- **Open question — ANSWERED (rev 2, 2026-06-11/12 live runs):** the LOW tier
  over-claims, and worse, anti-correlates. READY rates A 0.85 / B 0.70 /
  C 1.00 against anchors 0.60 / 0.967 / 0.967
  (`reports/gate-calibration-verdict.md`): the judge rewards interpretation
  freedom and penalizes density — the exact inversion of what admission
  needs. C drew 20/20 READY with 0 questions over a real hole. The
  enumeration rework (`deriveCheck`, `specs/gate-judge-derive.spec.md`)
  showed the mirror pathology (`reports/derive-calibration-verdict.md`), and
  the E2 live artifact sailed through `admit` with 0 questions over two real
  ambiguities (`reports/e2-verdict.md`). **Standing ruling: introspective
  readiness is not a gate signal. `gruntJudge` and `deriveCheck` stay
  exported for calibration sweeps only; no dispatch decision may consume
  their verdicts.** Root cause matches [[entropy-control-at-author-tier]]:
  felt ambiguity is subjective — a LOW model rationalizes underdetermined
  input into one confident reading and feels no gap.

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

### Intent probe (rev 2 — the pre-freeze instrument)

- **What it measures and why it exists:** the E2 measurement proved that
  post-freeze instruments can only measure *decidedness*, never *intent
  fidelity* — a fiat resolution frozen into a dense contract drives grunts
  deterministically (every E2 per-case rate 0/30 or 30/30), so divergence
  vanishes exactly where it would have been the signal. Divergence is alive
  at the PROSE level (E1a arm A viable-only modal share 0.60). `intentProbe`
  harvests it there: where K independent cheap implementers split on an
  input, the intent underdetermines that input — mechanically, with no
  introspection anywhere.
- **Flow:** dispatch `k` independent generations (same prompt, same system;
  concurrency 4; transient retry ≤2 per call — identical dispatch skeleton to
  `convergenceProbe`, shared, not duplicated) → `extractCode` per result; no
  code → not generated → for each generated impl, execute
  `runImpl(code, opts.entry, input)` (`sandbox.ts`, contract-free — there is
  no contract yet) once per candidate input, collecting an outcome per
  (impl, input) pair.
- **Outcome key (exact, mechanical):** execution ok → `value:` followed by
  `JSON.stringify(run.value)` (when `JSON.stringify` returns `undefined` —
  e.g. the impl returned `undefined` — the key is `value:undefined`);
  execution failed → the single key `throw` (error MESSAGES are not
  clustered: two impls that both reject an input agree behaviorally; message
  wording is noise). Keys compare by string equality.
- **Viability screen (pinned — reuses the r2 "viable-only" ruling):** an impl
  is **viable** iff it produced ≥1 non-`throw` outcome across the candidate
  inputs. Impls that throw on EVERY input (syntax errors, missing entry,
  hyper-strict refusals) are counted in `nonviable` and excluded from
  clustering — rationale: with no contract there is no other way to separate
  broken code from strict code, and a broken impl's uniform `throw` row
  would manufacture false splits on every input the population accepts.
  E1a-r2 pinned the same move (viable-only modal share) for the same reason.
- **`splits`:** for each candidate input (by index), cluster viable impls by
  outcome key. ≥2 distinct keys → a split entry carrying the full
  distribution. Splits are the kick-back payload: each names an input the
  intent does not decide, with the readings the population actually took.
- **`decidedRate`** = `(inputs.length − splits.length) / inputs.length`;
  forced to `0` when `viable === 0` (a population with no viable impl decides
  nothing — fail closed, never a green light). **No `ready` boolean and no
  threshold in rev 2** — deliberately. Thresholds get pinned from E3 data,
  not invented before the first measurement (the gruntJudge lesson: pinning
  gate semantics before calibration shipped a broken gate).
- **`inputs: []` → throw** a descriptive error naming the field, before any
  model call (mirrors `convergenceProbe`'s empty-probes rule).
- **No contamination guard, and that is correct:** candidate inputs carry NO
  expected outputs — there is nothing to leak. An input string that happens
  to appear verbatim in the prose intent is legal (the prose deciding an
  input is exactly what the probe should measure as convergence). Recorded
  here to kill the "copy the convergenceProbe contamination audit" reading.
- **Cost:** `costUsd` = sum of the k generation calls (sandbox executions are
  free). All calls `kind: "gate.intent"`.

### Composition policy (pinned, minimal — rev 2)

- **Admission (frozen contract → dispatch?):** `convergenceProbe` is the only
  instrument; fail-closed without a battery. The composition lives in
  `admit` (warboss-decomposition spec rev 4), not here.
- **Authoring (prose intent → freeze?):** `intentProbe` runs pre-freeze;
  its splits are God-facing kick-back questions alongside the warboss's own
  fiat/escalation flags (warboss-decomposition rev 4). **Wiring into the
  decompose pipeline is deferred until E3 validates the instrument**
  (`specs/e3-intent-divergence.spec.md` composes them experimentally) — this
  module exports instruments only.
- `gruntJudge`/`deriveCheck`: calibration sweeps only, never composed into a
  decision. No `checkReadiness` combinator in this change set.

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
11. **AC11 — intentProbe split detection (rev 2).** k=4 scripted impls over
    candidate inputs including `["120"]`: 2 impls return `120`, 2 throw on it;
    all 4 agree on every other input → `splits` contains exactly one entry:
    `inputIndex` of `["120"]`, `input: ["120"]`, outcomes exactly
    `{ "value:120": 2, "throw": 2 }`; every other input absent from `splits`;
    `decidedRate` equals the hand-computed value.
12. **AC12 — intentProbe outcome keys (rev 2).** Scripted impls returning
    `undefined` on an input → those impls cluster under `value:undefined`;
    two impls throwing DIFFERENT error messages on the same input cluster
    together under the single key `throw` (message wording is not a split).
13. **AC13 — intentProbe viability screen (rev 2).** k=4: one impl is
    syntactically broken (throws on every input), three viable and in full
    agreement → `generated: 4`, `viable: 3`, `nonviable: 1`,
    `splits: []`, `decidedRate: 1` (the broken impl manufactured no split).
    Variant: ALL impls throw on every input → `viable: 0`,
    `decidedRate: 0` (fail closed), `splits: []`, no throw.
14. **AC14 — intentProbe empty inputs throws (rev 2).** `inputs: []` →
    descriptive error naming the field, before any model call (ledger empty).
15. **AC15 — intentProbe prompt verbatim + no contract (rev 2).** Captured
    requests: user content === `opts.prompt` verbatim (no rewrapping, no
    contract section injected by the instrument), system === the pinned
    neutral default when `opts.system` omitted, k requests total.
16. **AC16 — intentProbe metering (rev 2).** Ledger has k entries kind
    `gate.intent`; verdict `costUsd` equals their sum; a generation that
    fails all transient retries counts `generated`-excluded, cost 0 for that
    slot, run completes (mirrors AC3's exhausted-retry shape).

## Verifies-with

- Tests: `test/gate.test.ts` — AC1–AC16, offline, fake `MessagesClient`.
- Integration: gruntJudge calibration protocol — RAN, FAIL as gate
  (`reports/gate-calibration-verdict.md`, `reports/derive-calibration-verdict.md`).
  `intentProbe`'s first live run is E3 (God-gated,
  `specs/e3-intent-divergence.spec.md`).
- Falsifies / experiment link: **E3** — pre-registered: `intentProbe` must
  split on the duration-parse intent's known underdetermined inputs
  (`"120"`, `" 1h 30m "`, `"1.5h"`) that every introspective instrument
  missed. If prose-level divergence does NOT surface them, the behavioral
  pre-freeze line is in trouble too and the leg's verdict says so (the rev-2
  instrument is falsifiable, and E3 is its instrument).
