# Warboss — Working Plan

> Status: planning. Greenfield repo. This document is the current shared plan; it will be superseded as the framework moves from theory to lab.
> Rev 2 (2026-06-09): split E1 into E1a/E1b, added high-model baseline arm + cost logging, feedback-granularity variable, mechanical freeze, sandbox constraints, graded task ladder, contract-authorship experiment, caveman wire protocol scoped to Phase 6.

## Thesis

**Warboss** is a high-model judge/architect that converts human intent into an immutable, executable **contract membrane**, then dispatches cheap, dogmatic sub-agents that grind against that membrane until the contract reports green.

The bet: **agent capability below the membrane is fungible if the contract is dense enough.** A contract that is a sufficiently low-entropy encoding of intent removes interpretation latitude, so the lowest viable model can satisfy it. Intelligence lives in the contract and the loop — not in the grinding agent.

This is the [Agentic Hierarchy of Needs](references/base%20principles.md) applied as a runnable harness: the membrane (executable contracts) is the only interpretation-free signal between human intent and agent execution, and we are building the machine that manufactures and enforces it.

**The metric the bet is settled on is correctness-per-dollar.** Every experiment logs tokens and cost per run from day one. Correctness without cost data cannot confirm or falsify the thesis.

## Reference synthesis

Each reference contributes one piece of the harness (see `references/`):

| Source | Contribution |
| --- | --- |
| **AHN** (our theory) | Spine. Membrane = only interpretation-free signal. 6 layers: Intent → Requirements → Contracts (membrane) → Implementation → State → Infra. Freeze-to-direct. Layers are roles, not files. |
| **AlphaProof Nexus** | The loop. Reliable output from an unreliable generator + an honest judge + retry. Intelligence in the loop, not the model. The judge's *why* (feedback signal) is part of the loop, not an afterthought. *(The ELO tournament is **not** core — see below.)* |
| **Fractal Views** | Constant-size context per agent (reroot at focus, prune by fractal value) → small context → small model viable. |
| **Shannon / compression** | Why immutable contracts work. A frozen contract is the lowest-entropy encoding of intent — a solved variable removed from the entropy budget. Compression = prediction = intelligence. |
| **Hive image + Orc lore** | Topology and role names: Warboss → Sergeant → Grunt. |
| **Intention-decay protocols** | Transmission rules: dense intent, bounded context, continuous injection into agent buffers, stigmergy (shape the environment, don't micro-instruct), redundant role specialization. |
| **Caveman** | The wire protocol — compressed instruction format = the info-density principle made concrete for inter-layer messages. Scoped to **Phase 6** (was previously unscoped — references with no phase invite creep). |

## Architecture

```
            HUMAN INTENT  (below membrane — human only)
                 │
   ┌─────────────▼──────────────┐
   │ WARBOSS (high model)        │  decompose intent → requirements
   │  - sets the contract        │  → acceptance examples → CONTRACTS
   │  - owns nothing it grinds   │
   └─────────────┬──────────────┘
   ═══ MEMBRANE: frozen executable contracts (immutable, low-entropy) ═══
                 │  injected directly into grunt buffers
   ┌─────────────▼──────────────┐
   │ SERGEANTS (mid model)       │  own a contract slice, dispatch grunts,
   │  - orchestrate the loop     │  fractal-prune context per grunt
   └─────────────┬──────────────┘
   ┌─────────────▼──────────────┐
   │ GRUNTS (lowest model)       │  generate impl → judged vs membrane
   │  - dogmatic, base behavior  │  → retry until green
   │    embedded, cannot touch   │
   │    contracts                │
   └────────────────────────────┘
```

**Core loop (no tournament):**

```
grunt generates → membrane judges (pass/fail + feedback) → retry-in-place until green
```

A single cheap grunt iterating against an executable contract that cannot lie. The ELO tournament (N parallel generations + reseed from best) is demoted to an **optional escalation** only if retry-in-place stalls — it is not a core mechanism.

### Loop mechanics (decided up front, not discovered in the lab)

- **Feedback granularity is a first-class variable.** On failure, what does the grunt see? Options: (a) bare pass/fail, (b) failing input only, (c) input + expected + actual. Default for covered contract cases: **(c)** — the AlphaProof loop works because the judge says *why*. The hidden battery is **never** leaked into feedback under any setting. Feedback richness gets its own arm in E1b — it may matter more than model tier.
- **Retry budget:** explicit, default max 5 attempts per grunt per contract.
- **Stall detection:** identical implementation produced twice in a row = stuck. Stop, don't burn tokens. Stall triggers escalation (tier bump, or tournament if enabled).
- **Cost logging:** every generation and every judge run logs model, tokens in/out, wall time, and dollar cost. Non-negotiable, day one.

### Mechanisms, mapped to references

1. **Decompose** (warboss): intent → requirement + ≥1 concrete acceptance example. *(AHN bootstrap rule: every requirement carries an acceptance example before any test/impl.)*
2. **Freeze** (membrane): example → executable contract. Frozen = solved variable. Immutable from below; amendments walk down from intent, never up from implementation. **Freeze is mechanical, not policy:** contract object carries a content hash + version; the runner refuses to execute against a contract whose hash does not match its frozen registration. ~20 lines, and it converts membrane immutability from documented intent into an enforced property — our own thesis applied to ourselves.
3. **Inject, don't instruct** (decay doc): grunt receives contract slice + base-behavior dogma in its buffer; warboss shapes *what is frozen*, not turn-by-turn orders.
4. **Fractal context** (Fractal Views): each grunt sees its local subtree rerooted at its focus, pruned to near-constant size → smallest viable model.
5. **Specialize on the fly**: a "specialized sub-agent" = base template + injected contract slice. No bespoke prompts; specialization *is* the frozen constraint set.

### The grunt is a doer, not a planner

A grunt **shouldn't have to interpret** — not because it is incapable, but because interpretation is the planner's job and the grunt is not the planner. Interpretation happens *above* the membrane (warboss/sergeant decompose intent until it is decided). The grunt receives a decided environment and executes it. "Stupid enough" is therefore **not a property of the grunt or the prose — it is a measurable property of the contract: residual interpretation latitude ≈ 0.** Make that true and the grunt cannot interpret, because nothing is left to interpret.

Three levers enforce this, in order of power:

1. **Grunt-readiness gate (admission check).** No task is dispatched to a grunt until its contract's residual latitude is proven low. Cheap probe: generate K diverse impls at high temperature → keep the ones that pass the frozen contract → run survivors against held-out probes. If survivors **disagree** on any plausible input, the contract is underspecified → **block dispatch, kick back to the contract author.** This is the membrane applied to ourselves: we do not trust a contract until we have shown that impls satisfying it converge. **E1a is the calibration instrument for this gate** — it turns "interpretation latitude" into a number we can threshold on.
2. **Mechanical surface-narrowing.** Each removes a dimension of choice before the grunt sees anything: a frozen **type signature** (pins input/output shape), the **pure-function** constraint (no I/O = no behavioral choices), and **acceptance examples** as canonical anchors.
3. **Fail-up dogma (behavioral embed).** The grunt's base behavior: *when the contract does not decide something, do not guess — report the gap.* A grunt that hits an undecided fork **escalates underspecification upward**; it never resolves ambiguity itself. This is what keeps grunts simple creatures.

Guarantee chain: **warboss decomposes until latitude → 0 → readiness gate proves it → grunt receives a decision-free environment → fail-up dogma catches any residual fork.** The grunt is never asked to be smart; the contract is asked to be complete.

Two consequences this pins down:
- **Coverage is a gate, not a metric** (Corollary D): an underspecified contract is not dispatched, full stop.
- **"Underspecified" is detectable pre-dispatch** — by the readiness gate — not discovered by a grunt failing strangely later.

## Decisions (2026-06-09)

- **Stack:** TypeScript + Claude Agent SDK.
- **First vertical slice:** E1a — interpretation variance with vs without a frozen contract (single-shot, no retry).
- **Theming:** role names only (Warboss / Sergeant / Grunt as identifiers; everything else neutral).
- **Tournament/ELO:** not core. Cited only as evidence that low-tier models work under a tight harness.
- **Execution safety (E1 scope):** grunt-produced impls run in `node:vm` with a hard timeout (grunts *will* write infinite loops). **Constraint, written down so it cannot silently break: all E1 tasks must be pure functions — no I/O, no imports, no globals.** Imports are stripped before execution. A worker thread is *not* a sandbox (shared process; `require('fs')`, `child_process`, network all reachable) — a real sandbox (isolated-vm or permission-stripped child process) is required **before Phase 4**, when tasks stop being pure functions.

## Build order

Build to falsify first. If a cheap grunt + honest membrane + retry does not beat a high-model one-shot on correctness-per-dollar, the thesis is wrong — and we learn it cheaply, early.

| Phase | What | Proves |
| --- | --- | --- |
| **1** | Membrane primitive: contract object (hash-frozen) + executable runner (no agents) | Contracts execute and freeze mechanically |
| **2a** | **E1a** — single-shot variance study across arms | A frozen contract collapses interpretation variance |
| **2b** | **E1b** — retry-in-place loop vs membrane | Cheap model + honest check + retry beats high-model one-shot on correctness-per-dollar |
| **3** | Tournament + ELO *(optional escalation)* | Only if retry-in-place stalls |
| **4** | Warboss decomposition: intent → requirements → contracts. Includes **E2: contract authorship** (see below). Real sandbox lands here. | Hierarchy runs end-to-end; warboss-authored contracts don't poison the membrane |
| **5** | Fractal context + sergeant layer | Scale: constant-size context, multi-contract orchestration |
| **6** | Caveman wire protocol: compressed contract/instruction injection vs verbose | Same pass rate at meaningfully fewer tokens, or cut it |

## E1 — first experiment (split into E1a / E1b)

E1 previously conflated two questions: interpretation variance (a property of single independent generations) and loop convergence (a property of retry against the membrane). Different questions, different designs. E1a runs first — cheaper, and it tests AHN's core empirical claim cleanly.

### E1a — variance (single-shot, no retry)

**Question:** does a frozen executable contract collapse interpretation variance across independent agent runs?

**Setup:**
- One task with genuine interpretation latitude (pilot candidate: parse a duration string to seconds — `"1h30m"`, `"90s"`, ambiguous edge cases).
- **Arm A (no contract):** N independent grunt runs, prose requirement only.
- **Arm B (frozen contract):** same N runs, same prose + frozen acceptance-example contract injected.
- **Arm C (partial contract):** same, but contract covers only a subset of cases — tests Corollary D (partial contracts may *hurt* uncovered cases).
- **Arm D (high-model baseline):** N runs, high model, prose only, one-shot. **This is the arm the thesis is actually settled against** — without it, "beats one-shot" is untestable and only the variance claim survives.
- Arms A–C use the same cheap model tier — isolate the contract variable. Arm D isolates the model variable.
- **N ≥ 30 per arm.** Below ~20–30, variance numbers are noise.

**Pre-registered success criteria (written before any run, to prevent post-hoc squinting):**
1. **Variance collapse:** Arm B behavioral clusters ≤ 2; Arm A clusters ≥ 5 (cluster = identical pass/fail vector on the hidden battery).
2. **Correctness:** Arm B mean hidden-battery pass rate exceeds Arm A by ≥ 15 points on covered-case-adjacent behavior.
3. **Corollary D check:** Arm C pass rate on *uncovered* cases ≤ Arm A pass rate on the same cases (i.e., partial contract hurts where it's silent).
4. **Economics (with E1b):** Arm B (cheap, with retry from E1b) total cost-to-green < Arm D cost at equal-or-better hidden-battery pass rate. If Arm D wins on correctness-per-dollar, the thesis is falsified as stated.

**Measure:**
1. **Behavioral variance** — run all impls against a hidden held-out battery (edge cases no arm was told about). Hidden cases never appear in any prompt, any feedback, or any logged artifact a grunt could see — contamination audit is part of the harness.
2. **Correctness** — mean pass-rate per arm, covered vs uncovered split.
3. **Drift signature** — cluster impls by behavior. Hypothesis: Arm A fans out; Arm B collapses to ~1 cluster.
4. **Cost** — tokens and dollars per run, per arm.

**Saturation risk:** duration parsing may be too easy — a modern cheap model may hit ~95% in every arm, washing out the contract effect. Duration parse stays as the pilot, but the task ladder is pre-picked with graded difficulty so there is headroom for variance to show:

| Rung | Task | Why this difficulty |
| --- | --- | --- |
| 1 | Duration-string → seconds | Pilot. Genuine prose ambiguity (`"1h90m"`? negative? `"1.5h"`?), but small. |
| 2 | CSV parser with RFC-4180 quoting edge cases | Quoted newlines, escaped quotes, empty fields — cheap models reliably fumble corners. |
| 3 | Small state machine (e.g., order-lifecycle with illegal-transition rejection) | Multi-constraint; prose underdetermines transition table. |

If all arms saturate on rung 1, move up a rung before drawing conclusions.

### E1b — the loop (retry-in-place)

**Question:** does cheap-model + membrane + retry beat the high-model one-shot on correctness-per-dollar?

**Setup:** Arm B configuration from E1a, plus the retry loop: generate → judge → feedback → retry, budget 5, stall detection on. Sub-arms on **feedback granularity**: (a) bare pass/fail, (b) failing input only, (c) input + expected + actual.

**Measure:** retries-to-green distribution, stall rate, total cost-to-green, hidden-battery pass rate of the final green impl, all per feedback sub-arm. Compare cost-to-green + correctness against E1a Arm D.

**Minimal scaffold:**

```
warboss/
  src/
    contract.ts        // {requirement, examples[], check(), frozen, hash, version}
    runner.ts          // verifies hash, executes check vs impl → pass/fail + feedback + score
    grunt.ts           // 1 cheap-model call: prose (+contract) (+feedback) → impl
    sandbox.ts         // node:vm + timeout + import-strip (E1); real isolate before Phase 4
    cost.ts            // per-run token/dollar ledger
    experiment/
      e1a.ts           // N × arms A-D, hidden battery, variance/correctness/cost
      e1b.ts           // retry loop, feedback sub-arms, cost-to-green
  tasks/
    duration-parse/    // requirement.md, examples.json, hidden-battery.json
    csv-quoting/       // rung 2 (pre-built, used only if rung 1 saturates)
    state-machine/     // rung 3
```

No sergeant/warboss layer for E1 — only grunt + membrane.

## E2 — contract authorship (Phase 4, pre-committed now)

E1 contracts are human-written. Production contracts come from warboss decomposition — and that is where the thesis most plausibly dies: a warboss that writes *partial* contracts triggers Corollary D, making the membrane worse than nothing on uncovered behavior. Do not discover this in production.

**Design:** same intent given to (a) human contract author, (b) warboss. Both contract sets drive the E1b loop with the same grunt tier. Measure hidden-battery pass rate of final impls, coverage of the hidden battery by each contract set, and cost. **Pre-registered criterion:** warboss-authored contracts must reach ≥ 90% of the human-authored hidden-battery pass rate, or warboss decomposition needs a coverage-audit step (e.g., adversarial example generation pass) before the hierarchy is trusted end-to-end.

## Open questions

- Sandbox hardening details for Phase 4+ (isolated-vm vs permission-stripped child process vs container) — decision deferred until tasks require I/O.
- Where the feedback-granularity winner from E1b gets baked in: per-contract config vs global default.
- Whether stall-escalation goes tier-bump-first or tournament-first (Phase 3 decides, data from E1b stall rate informs).
