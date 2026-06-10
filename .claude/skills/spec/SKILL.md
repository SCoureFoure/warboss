---
name: spec
description: >
  Capture or build a warboss harness feature against a durable spec, then leave it
  covered by tests. Runs the loop: SPEC → REUSE-SCAN → CRITERIA→TESTS → BUILD →
  VERIFY → DEPOSIT. Works two ways — reverse-engineer an existing module into a
  spec, or build a new feature spec-first. Trigger when the user says
  "/spec <feature>", "write a spec for X", "capture X as a spec", "spec-driven", or
  asks to turn a requirement into a regression test.
---

You are running the spec-driven loop for the **warboss** harness. A "spec" is the
durable source of truth for one harness feature: requirement + constraints +
pinned decisions + acceptance criteria. Every feature leaves two artifacts — a
**spec** (`specs/<feature>.spec.md`) and **tests** (`node:test` regression
guardrail). The spec pile is an *output*, not a precondition.

> **Specs ≠ contracts.** A spec governs a feature of the harness we build. A
> `Contract` (`src/contract.ts`) is the runtime membrane the harness freezes for
> grunts. This skill produces specs, not runtime contracts.

## Two entry paths, one output

- **Spec-in** — the user hands an explicit requirement. Consume it → spec → tests.
- **Explore-out** — vague request, or behavior discovered while reading code or
  running `npm run smoke`. Discover intended behavior, write it down, cover it.

Both converge on `{spec in specs/, regression test in test/}`.

## The loop

```
1. SPEC
   - Spec-in:     consume the given requirement.
   - Explore-out: read the module(s) it touches + run `npm run smoke` / `npm test`
                  to confirm code matches reality. Pin vague forks with AskUserQuestion.
   - WRITE specs/<feature>.spec.md  (template in specs/README.md)
   - Surface the decisions the spec forces ("is it supposed to do that?") and get a
     ruling BEFORE encoding behavior as correct — that ruling is the spec's value.

2. REUSE-SCAN
   - Find existing primitives to wire — do NOT rebuild. The Phase-1 core already
     exists: models.ts, cost.ts (Ledger), contract.ts, sandbox.ts, runner.ts,
     agent.ts. Restate the inherited thesis constraints the feature rides on
     (cost-metered, membrane immutability, hidden-battery-never-leaks, node:vm is
     not a security sandbox, grunt-is-a-doer) in the spec's Constraints section.

3. CRITERIA → TESTS
   - Each acceptance criterion → ONE test at the cheapest layer that proves it:
     pure unit (no network) > injected-fake unit > live smoke.
   - The agent layer is unit-tested by injecting a fake MessagesClient (see
     test/agent.test.ts) — never hit the live API in `npm test`.
   - Prefer the failing test before the code (red→green) when building new.

4. BUILD to spec.

5. VERIFY
   - `npm run typecheck` (strict tsc) + `npm test` (node:test) — both green.
   - `npm run smoke` when the change touches the freeze→judge→meter path.
   - Live model calls (ANTHROPIC_API_KEY) only when behavior genuinely needs a
     real generation; keep the default test path offline and deterministic.

6. DEPOSIT
   - spec + tests in the SAME change set. Update the index table in specs/README.md.
```

## Roles as gates (not headcount)
- **Implementer** — builds to spec.
- **Validator** — adversarial pass: hunt coverage gaps, harden the regression
  tests, distrust the implementer's assumptions. Spawn a subagent only when the
  user asks or the surface genuinely warrants fan-out.
- **Spec** — the contract both answer to.

## Worked example
`specs/membrane-core.spec.md` (AC1–AC15) + its tests in `test/*.test.ts` —
the Phase-1 primitives reverse-engineered into a spec through this loop.

## Notes
- New behavior riding an existing module still gets its own AC / spec amendment —
  don't bundle silently. The spec is where "same feature or new one?" is answered.
- Map each spec to its PLAN phase in the header (`Maps to:`), so the spec pile and
  the build order stay legible against each other.
