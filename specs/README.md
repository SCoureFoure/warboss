# Specs

Durable source of truth for the **harness's own behavior**. One file per
feature: `specs/<feature>.spec.md`. Each spec pairs with regression tests (the
guardrail). Pattern borrowed from the food-journal repo's spec loop.

> **Two layers, kept distinct.** A *spec* here governs a feature of the harness
> we are building (the ledger, the sandbox, the e1a runner). A *contract*
> (`src/contract.ts`) is the runtime membrane the harness freezes for grunts.
> Specs describe how we build; contracts are what we build with. Don't conflate.

The spec pile is an **output**, not a precondition — it fills as features are
touched. Two entry paths converge here:

- **spec-in** — an explicit requirement is consumed → spec → tests.
- **explore-out** — behavior discovered while reading code or running the smoke
  test → written down → covered by tests → captured as spec.

Run the loop with the **`/spec`** skill (`.claude/skills/spec/SKILL.md`):
`SPEC → REUSE-SCAN → CRITERIA→TESTS → BUILD → VERIFY → DEPOSIT`.

## Rules

- Every non-trivial feature deposits `{spec, test}` in the same change set.
- Acceptance criteria map **1:1** to tests at the cheapest layer that proves
  them: pure unit (`node:test`, no network) > injected-fake unit > live `smoke`.
- New behavior on an existing module gets its own AC / spec amendment — never
  bundle silently. The spec is where "same feature or new one?" is answered.
- **Entropy is reduced at authoring time, not at implementation time** (H-6
  lesson). The implementer is a simple machine; the spec author carries the
  burden of decidedness:
  - Every normative sentence (MUST / never / only) names the AC that fails
    when it is violated. An unmapped clause means the spec is not ready to
    freeze.
  - If a rule has two grammatical readings, the AC set must kill the wrong
    one (H-6: "two consecutive attempts that BOTH produced code" survived
    both readings — no AC exercised the failed-gen-between-twins sequence).
  - Rules over order or state (retries, resets, sequences) get one AC per
    distinct transition, not one AC for the happy path.
- Honor inherited thesis constraints and restate the ones a feature rides on in
  its **Constraints** section:
  - **Cost-metered.** Every model call goes through the `Ledger` — no un-metered
    path. Correctness-per-dollar is the metric the thesis is settled on.
  - **Membrane immutability.** A frozen `Contract` is hash-pinned; the runner
    refuses to execute against an unregistered hash.
  - **Hidden battery never leaks.** Held-out cases never appear in any prompt,
    feedback, or logged artifact a grunt could see.
  - **`node:vm` is not a security sandbox.** Adequate only for pure, synchronous
    E1 impls; must be replaced before Phase 4 (tasks gain I/O).
  - **Grunt is a doer, not a planner.** The agent layer is a single
    `messages.create`; the generate→judge→retry loop lives above it.

## Template

```markdown
# Spec — <feature title>

> Status: active · Feature: <slug> · Added: <YYYY-MM-DD> · Maps to: PLAN Phase <n> / <component>
> Source of truth for <what behavior>.

## Requirement
<one paragraph: what the feature does and why>

## Constraints (inherited)
- <the thesis invariants this feature rides on — see Rules above>

## Decisions (pinned <date>)
- <each fork resolved: defaults, edge-case rulings, layering choices>

## Acceptance criteria (Given / When / Then)
1. AC1 — <happy path>
2. AC2 — <edge / failure>
3. ... (one per distinct behavior; new behavior = new AC)

## Verifies-with
- Tests: <path> — <which ACs>
- Falsifies / experiment link: <e.g. E1a success criterion>, or n/a
```

## Index

| Spec | Feature | Maps to | Status |
| ------ | ------- | ------- | ------ |
| [membrane-core](membrane-core.spec.md) | Hash-frozen contract + sandbox + runner + cost ledger + agent layer | Phase 1 + agent layer | active |
| [e1a-harness](e1a-harness.spec.md) | E1a variance experiment runner + duration-parse task assets (rev 3: modal-share C1 + rescore) | Phase 2a (E1a) | active |
| [e1b-harness](e1b-harness.spec.md) | E1b feedback-granularity sub-arms (rev 2: loop delegated to loop-core, dead-run guard) | Phase 2b (E1b) | active |
| [loop-core](loop-core.spec.md) | Retry-in-place loop: generate → judge → feedback → retry, budget, stall, cost-to-green | Phase 2b (core loop) | active |
| [readiness-gate](readiness-gate.spec.md) | Admission check (rev 2: convergence probe = the only gate; `intentProbe` pre-freeze divergence instrument; introspective judges demoted to calibration-only) | Lever 1 (grunt-readiness gate) | active |
| [sandbox-hardening](sandbox-hardening.spec.md) | Process-isolated execution (`node --permission` child) + `judgeAsync` | Phase 4 precondition | active |
| [warboss-decomposition](warboss-decomposition.spec.md) | Intent → requirements → frozen contracts + gate admission; error-coverage mandate (rev 4: fiat-flagging `resolutions`, audit-gap escalation, probe-only admission, prompt-injected requirement cap) | Phase 4 (E2 substrate) | active |
| [e2-contract-authorship](e2-contract-authorship.spec.md) | Human- vs warboss-authored contract driving the same grunt loop; hidden-score happy/error split; pre-registered E2 criterion | Phase 4 (E2) | active |
| [gate-judge-derive](gate-judge-derive.spec.md) | `deriveCheck` mechanical-enumeration readiness instrument + calibration runner (gruntJudge rework) | Lever 1 (gate rework) | active |
| [e3-intent-divergence](e3-intent-divergence.spec.md) | E3: pre-freeze surfacing of underdetermined semantics — rev-4 fiat/escalation flags + `intentProbe` vs the three known E2 misses; pre-registered all-three-surfaced criterion | Phase 4 follow-on (E2 consequence) | active |
