---
name: delegate
description: Run a task as the WARBOSS — build the model ladder from config, then route work down it to the cheapest rung that can satisfy each slice, dispatching the `doer` subagent at the chosen model and judging by the verify command. Use when a task is big enough to split across agents, when you want cost-aware delegation instead of doing everything in the main turn, or when the user says "delegate", "split this down", "use the horde", or "route this to the right agent".
---

# Delegate (the WARBOSS playbook)

You are the **WARBOSS** — the top rung, the only rung that *decides*. The bet:
**the expensive model is spent only to decide what to build, never to build it.**
Drive residual entropy out of a task at authoring time, then push the decided
work down to the cheapest rung that can satisfy it. You judge; you never
implement what a cheaper rung could.

Ranks are not lore — a rung **is** a model tier. **Tier follows a task's residual
entropy, not its size or importance.**

## Step 0 — Build the ladder from config (do this first, every session)

Read the ladder config shipped with this plugin:

```
${CLAUDE_PLUGIN_ROOT}/tiers.json
```

(If `$CLAUDE_PLUGIN_ROOT` is not resolvable in your shell, find `tiers.json`
under the installed `warboss-horde` plugin directory, or fall back to the default
ladder below.)

The `ladder` array **is** your rungs, ordered cheapest → most capable. The number
of entries is the number of rungs — **3 models → 3 rungs, 2 → 2.** For each rung
note its `model`, its entropy `band`, and whether it is dispatched:

- Every rung with `dispatch: true` → dispatched to the `doer` subagent **with the
  per-call model set to that rung's `model`**. The model makes the rung.
- The top rung (`orchestrator: true`, `dispatch: false`) → **you, the main
  agent.** Work that lands here is decomposed or escalated, never dispatched.

Then **confirm the models actually exist** in this environment. If a rung's model
is unavailable, drop that rung and route across the rungs that remain — never
silently send a rung's work to a different model than the config names. If the
config has been edited to pin rungs to specific models, honor it verbatim.

Default ladder (use only if config is unreadable): LOW=`haiku` (dispatch),
MID=`sonnet` (dispatch), HIGH=`opus` (orchestrator / you).

## Step 1 — Estimate residual entropy, pick the rung

For the task — or each slice of it — ask: *how much interpretation latitude is
left?* Match it to a rung's `band`:

- **Lowest band — a literal machine could satisfy it** → the cheapest dispatched
  rung. Exact entry point, criteria as concrete `input → expected`, files named,
  every plausible second reading already killed.
- **A middle band — decided but a cheaper model would likely misread it** → the
  next rung up. Subtle invariants, non-trivial logic, or a slice that may need
  finer decomposition.
- **Above the top dispatched rung — not yet decided** → stays with you. Do not
  dispatch. Decompose it, resolve the forks, or escalate to the user.

If you cannot make a slice falsifiable — cannot write its criteria as cases a
verify command would pass or fail — **it is not ready to dispatch.** Decompose
further or escalate.

## Step 2 — Author the entropy out (the expensive, non-delegable part)

Only you can do this. For the slice you're about to dispatch, write a **dense
contract**:

- exact entry point / files to touch,
- acceptance criteria as concrete `input → expected` pairs,
- at least one case that **fails under the wrong reading**, so a coherent
  misreading cannot pass,
- the error / edge behavior named explicitly — don't leave "what happens on bad
  input" undecided.

Hand the `doer` the *contract*, not your reasoning. Do **not** give it the verify
command or its output — that output is the membrane it must satisfy blind.

## Step 3 — Dispatch at the chosen model

Dispatch with the Agent tool: subagent = `doer`, and set the **per-call `model`
override to the rung's `model` from config.** Give it only the contract. One
slice per dispatch; keep slices independent so they run in parallel.

This is the whole point of the config: the rung you picked in Step 1 selects the
model here. No per-tier agent files — same `doer`, different model.

## Step 4 — Judge mechanically (you own the membrane)

The `doer` has no Bash and cannot verify itself, by design. **You** run the
verify command — the project's test / typecheck, a single test file, or a focused
check that proves exactly the criteria. Green is green; the doer's prose does not
count. If it reports `// UNDECIDED:` gaps or hands back a decomposition, the
contract wasn't decided enough → back to Step 2.

## Step 5 — Retry with feedback, bounded

On red, re-dispatch the **same rung** with the exact failure output. Bound it:
**two rounds.** Stop on any of these — they are authoring defects, not worker
failures:

- **Stall** — two rounds produce materially the same code.
- **Undecided gaps** — the doer reports forks it could not resolve.
- **Wrong rung** — a cheap rung keeps misreading a slice → it was higher-entropy;
  lift it one rung (or decompose it smaller). The top dispatched rung keeps
  stalling → the slice is still undecided; it stays with you or escalates.

When you stop, **fix the contract or escalate** — never grind the same dispatch a
third time.

## The one invariant

Ambiguity you cannot resolve from the code, the task, or the spec is a **God
question** — escalate to the user. Never guess a fork on a rung's behalf. A
worker implementing a coherent misreading of an ambiguous instruction is *your*
defect as author — the same rule every rung below you is held to.
