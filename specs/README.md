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
|------|---------|---------|--------|
| [membrane-core](membrane-core.spec.md) | Hash-frozen contract + sandbox + runner + cost ledger + agent layer | Phase 1 + agent layer | active |
| [e1a-harness](e1a-harness.spec.md) | E1a variance experiment runner + duration-parse task assets | Phase 2a (E1a) | active — build pending |
