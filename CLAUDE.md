# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

warboss is a research harness testing one bet: **once intent is encoded densely
enough as an executable contract, the cheapest model can satisfy it** — so the
expensive model is spent only to *decide* what to build, never to build it. The
metric the whole project is judged on is **correctness-per-dollar**, so every
model call is metered. Read [README.md](README.md) and [duh_plan.md](archive/duh_plan.md)
for the full thesis; `duh_plan.md` supersedes the README where they disagree.

It is a Node ≥22 / TypeScript CLI + library. No GUI, no build step — `tsx` runs
`.ts` directly.

## Commands

```sh
npm run typecheck   # strict tsc --noEmit — run before declaring done
npm test            # full offline suite (tsx --test test/*.test.ts)
npm run smoke       # end-to-end; dispatches ONE real grunt if ANTHROPIC_API_KEY set, else offline-only
```

Run a single test file: `npx tsx --test test/contract.test.ts`
Filter by test name: `npx tsx --test --test-name-pattern "<regex>" test/*.test.ts`

**Live experiment runners** (cost real money — owner-gated, need `.env` with
`ANTHROPIC_API_KEY`): `npm run e1a | e1b | e2 | e3 | e4`, `npm run decompose`,
`npm run calibrate-gate | calibrate-derive`. They read the key via
`node --env-file=.env`. Do not invoke these without explicit owner approval —
they spend against the API and write verdicts to `reports/`.

## The membrane (the one invariant that governs everything)

The only interpretation-free signal between intent and execution is an
**executable contract** (`src/contract.ts`). A `Contract` is hash-frozen: the
hash is computed over the canonical form of `{requirement, entry, version,
examples}`. The runner (`src/runner.ts`) **refuses to execute** against any
contract whose hash ≠ the registered `expectedHash` (`ContractHashMismatch`).
Three rules ride on this and must never be broken:

1. **Hidden battery never leaks.** A task's held-out scoring cases live beside
   the task (`tasks/<x>/hidden-battery.json`), never on the `Contract` (which
   gets injected into grunt prompts). Feedback at any granularity reports only a
   *count* for hidden cases, never inputs/expected.
2. **Every model call goes through the `Ledger`** (`src/cost.ts`). There is no
   un-metered path to a model. `src/agent.ts` is the only place that calls the
   SDK, and it records cost on every call.
3. **Entropy is reduced at authoring time, not implementation time.** The grunt
   (`Agent` + `GRUNT_DOGMA`) is a deliberately dumb single `messages.create` —
   no tools, no loop. All decidedness burden lands on the author (the spec, or
   the warboss decompose prompt). A worker implementing a coherent misreading of
   an ambiguous sentence is the *author's* defect.

## Architecture — layers, bottom up

- **`contract.ts`** — the frozen membrane primitive (`Contract.freeze`, `.hash`,
  `.verify`).
- **`sandbox.ts` / `sandbox-proc.ts` / `sandbox-child.mjs`** — impl execution.
  `runImpl` uses `node:vm` (synchronous, NOT a security sandbox — fine for pure
  E1 impls). `runImplProc` spawns a `node --permission` child for real isolation;
  `judgeAsync` uses it.
- **`runner.ts`** — `judge()` verifies the hash, runs code against a battery,
  returns `{pass, vector, score, feedback}`. `Granularity` (`passfail|input|full`)
  controls how much the judge's *why* reveals — a first-class experimental knob.
- **`agent.ts`** — the grunt. One metered model call. `extractCode` pulls the
  first fenced block.
- **`models.ts`** — `TIERS` (LOW=haiku, MID=sonnet, HIGH=opus) with prices.
  **Tier follows task residual-entropy, not rank.** Update id + price together;
  a wrong price silently corrupts the metric.
- **`cost.ts` / `ledger-sink.ts`** — `Ledger.record()` computes USD from usage ×
  `ModelSpec` price. `jsonlFileSink` appends one crash-safe JSON line per call,
  keyed by request-id to reconcile against the Anthropic console.
- **`loop.ts`** — `runLoop`: generate → judge → feed `feedback` back → retry,
  bounded by `budget`. Detects stall (identical code twice) and exhaustion. This
  is the agentic loop; it lives ABOVE the agent, not inside it.
- **`gate.ts`** — admission instruments. **`convergenceProbe` is the ONLY real
  admission gate**: run K independent cheap generations against a frozen
  contract; if survivors don't agree on held-out probe cases, it's not decided
  enough to freeze. `gruntJudge` and `deriveCheck` are **falsified as gates —
  calibration-only**, do not reintroduce them as the admission decision.
  `intentProbe` is a pre-freeze, report-only divergence instrument (no `ready`).
- **`warboss.ts`** — the decompose pipeline: intent → `decompose()` (decompose →
  parse-with-one-reask → mechanical validate → self-audit → amend → freeze) →
  `admit()` (probe-only). rev-4 concepts: every requirement MUST carry a
  `resolutions[]` array flagging each chosen-but-undecided behavior as
  `intent|fiat`; `fiat` choices and intent-undecided audit gaps become
  **escalations** (Leader-facing kick-back questions). Error-behavior example
  (`throws`) is mandatory per requirement.
- **`kickback.ts`** — production kick-back wiring: `renderDecisionBlock`,
  `buildAnswerQueue`, `loadOwnerAnswers`. Pure/offline. Turns escalations into an
  owner-answer queue, validates the hand-filled queue, folds decisions back into
  a fresh decompose.
- **`experiment/`** — the falsify-first ladder E1a → E1b → E2 → E3 → E4 plus
  calibration runners. Each rung has a pre-registered success criterion; verdicts
  land in `reports/`.

## The horde (comms topology)

`LEADER → WARBOSS → WARCHIEF → SERGEANT → GRUNT`. Each rank talks **only to its
neighbor** (noise isolation — a bad reading can't skip a layer). Ranks absorb
entropy by *decomposing* for the rank below, not by being the one that finally
satisfies a dense contract. Rank ≠ tier.

## How work is done here (spec-driven, eats its own cooking)

Every harness feature deposits a durable spec in [specs/](specs/) **plus a
regression test in the same change set** — driven by the `/spec` skill
(`.claude/skills/spec/SKILL.md`): `SPEC → REUSE-SCAN → CRITERIA→TESTS → BUILD →
VERIFY → DEPOSIT`. Read [specs/README.md](specs/README.md) before adding a
feature. Key rules:

- Acceptance criteria map **1:1 to tests** at the cheapest layer that proves them
  (pure unit > injected-fake unit > live smoke).
- Every normative sentence (MUST/never/only) names the AC that fails when
  violated. Rules over order/state get one AC **per distinct transition**, not
  one for the happy path.
- A *spec* governs the harness we build; a *contract* is the runtime membrane the
  harness freezes for grunts. Don't conflate them.

Work moves between ranks through [HANDOFF.md](archive/HANDOFF.md) frozen-spec work items
(the lab-phase relay; closed work is in [archive/](archive/)).
The `run-warboss` skill (`.claude/skills/run-warboss/SKILL.md`) covers building,
running, and dispatching real grunts / live experiments.

## Delegating work (run the harness's own thesis on yourself)

This repo's bet — *expensive model decides, cheapest model does, entropy is
removed at authoring time* — is also how work should be delegated **inside this
harness**, and it ships as a reusable Claude Code plugin: **`warboss-horde`**
(`plugins/warboss-horde/`, listed in `.claude-plugin/marketplace.json`). You (the
main agent) are the WARBOSS — the top, deciding rung. The plugin gives you one
generic `doer` subagent (`agents/doer.md`, `model: inherit`), a config-driven
ladder (`tiers.json` — N models = N rungs), and the `/warboss-horde:delegate`
skill that encodes the loop below. Dispatch the `doer` at the rung's model via the
Agent tool's per-call `model` override; the model makes the rung, not separate
agent files. The mapping:

| warboss | here |
| --- | --- |
| executable contract (membrane) | the **verify command** — `npm test` / `npm run typecheck` / a single test file. Pass/fail, no interpretation. |
| frozen acceptance examples | the ACs you hand the doer as concrete `input → expected` pairs |
| hidden battery | tests the doer **does not** run (it has no Bash) — you judge with them |
| judge → feedback → retry | you run the verify command; on red, re-dispatch the doer with the failure output |
| residual-entropy → tier | the rung (and its model) you pick from `tiers.json` for each slice |
| escalate fiat to Leader | ambiguity you can't resolve from code/spec → ask the user, never guess |

**The loop, when a task is decided enough to delegate** (run `/warboss-horde:delegate`):

1. **Author the entropy out first** (this is the expensive, non-delegable part).
   Write the task as a dense contract: exact entry point / files, ACs as concrete
   `input → expected`, and kill any second reading with a case that fails under
   it. If you can't make it falsifiable, it's not ready to dispatch — decompose
   further or escalate to the user.
2. **Dispatch to `doer`** via the Agent tool, with the per-call `model` set to the
   rung you picked from `tiers.json`. Hand it the contract, not your reasoning. Do
   not give it the verify command output up front — that's the membrane it must
   satisfy blind.
3. **Judge mechanically.** Run `npm run typecheck` then the relevant tests
   yourself. Green is green; the doer's prose doesn't count.
4. **Retry with feedback**, bounded. On red, re-dispatch with the exact failure
   output. If two rounds produce materially the same code (stall) or the doer
   reports `// UNDECIDED:` gaps, **stop** — that's an authoring defect, not a
   worker failure. Fix the contract or escalate, don't grind.

**Tier follows residual entropy, not task size.** A gnarly, underdetermined slice
stays with you (the top rung) or goes to a MID rung; only push to the cheapest
rung what a literal machine could satisfy. A worker implementing a coherent
misreading of an ambiguous sentence is **your** defect as author — same rule the
harness enforces on grunts (`GRUNT_DOGMA`).

Spec-feature work still goes through the `/spec` skill; this delegation loop is
for the implementation step *after* a feature's ACs are decided.

## Conventions

- ESM throughout (`"type": "module"`); imports use explicit `.ts` extensions.
- Strict TypeScript; prefer `readonly`, exact-optional fields built via
  conditional spread (`...(x !== undefined ? {x} : {})`) rather than `x: undefined`.
- Fail-closed everywhere a gate or parser is uncertain: malformed/ambiguous is
  **never** a green light.
- `.env` is git-ignored and only needed for live runs; typecheck and the offline
  suite need no key.
