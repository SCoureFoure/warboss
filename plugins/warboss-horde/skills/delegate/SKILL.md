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

Ranks are not lore — a rung **is** a model tier. The rung a slice goes to is set
by that slice's residual entropy alone — not by how big or important the slice
is. That rule picks the rung for a slice you have **already cut out**; it is never
a reason to keep a task whole. Always cut the task into slices first (Step 1),
then tier each slice (Step 2).

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

## Step 0.5 — Is there a membrane? (classify each slice's verify_kind)

The whole loop rests on an **interpretation-free pass/fail check** — the membrane.
Before slicing for cost, decide how each piece is even *judgeable*, because a slice
with no membrane cannot be safely delegated (the doer would be graded on prose, and
"green" would mean nothing). Tag each slice:

- **`test`** — a command returns pass/fail with no human in the loop (unit test,
  typecheck, a single headless test file). **Normal delegate path** (Steps 1-7).
- **`visual`** — correctness is a rendered/perceptual fact (a screenshot, a layout,
  a sound). The membrane is then a **captured artifact + ground-truth sidecar** the
  WARBOSS inspects (e.g. a screenshot paired with the world-state it was taken from).
  You may dispatch the *production*, but **you** judge the artifact — there is no
  cheap auto-green. If the project has no such capture+inspect path, treat the slice
  as `none` until one exists.
- **`none`** — no pass/fail check is possible (exploratory, asset wrangling, a
  judgement call). **Do not pretend-delegate.** Handle inline, or escalate the
  decision to the user. A dispatch with no membrane is an authoring defect.

Only `test` (and `visual`, with you as judge) slices proceed. This is the honest
boundary of the doctrine: it makes cheap workers reliable *because* a frozen check
grades them — where no check exists, the bet doesn't apply.

## Step 1 — Cut the task into the smallest independent slices (always, before tiering)

Run this on every task before you tier anything. A task is almost never one
rung's worth of work, so never tier a task whole — cut it first, then decide on
the pieces.

Cut the task into slices where each slice is both:

- **independently verifiable** — it has its own pass/fail check that needs no
  other slice to run, and
- **disjoint** — no two slices write the same file or the same surface, so they
  can run in parallel.

Coupled-looking work splits once you fix the seam. **You** define that seam and
write it into every slice's contract: the shared state shape, the function
signatures, the data format the slices agree on. Deciding the seam is your job
and cannot be delegated — it is part of authoring the entropy out.

Cut for cost, not only for difficulty. A task that reads as one "medium-hard"
block almost always hides lowest-band leaves — static data tables, literal
input-to-action maps, pure formatters — that the cheapest rung can satisfy
exactly. Pull every such leaf into its own slice so it routes to the cheapest
rung. What is left after the leaves are out is the genuinely coupled,
invariant-bearing core; only that part stays at a higher rung.

The output of this step is a list of slices, each labelled with the surface it
touches and its own verify check. Tier them in Step 2. You may conclude a task is
a single slice — but only after trying to cut it, never as the reason to skip
this step.

## Step 2 — Tier each slice (set its rung by its residual entropy)

For each slice from Step 1, ask: *how much interpretation latitude is
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

**Default down, and justify every step up.** The cheapest dispatched rung is the
default; a slice only moves UP a rung when you can name *why* the rung below would
misread it. When you tier a slice above the cheapest rung, record that reason on
its eventual verdict as `cause` (Step 5) using the same vocabulary as a red:
`under_decided` (you haven't authored the fork out yet — fix that first),
`subtle_invariant`/`wrong_rung` (genuinely needs more capability). If most slices
land MID with no nameable reason, that is **authoring debt, not entropy** — the
`summary` board will show it as a low LOW-share. Drive the entropy down instead of
defaulting up.

## Step 3 — Author the entropy out (the expensive, non-delegable part)

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

## Step 4 — Dispatch at the chosen model

Dispatch with the Agent tool: subagent = `doer`, and set the **per-call `model`
override to the rung's `model` from config.** Give it only the contract. One
slice per dispatch; keep slices independent so they run in parallel.

This is the whole point of the config: the rung you picked in Step 2 selects the
model here. No per-tier agent files — same `doer`, different model.

## Step 5 — Judge mechanically (you own the membrane)

The `doer` has no Bash and cannot verify itself, by design. **You** run the
verify command — the project's test / typecheck, a single test file, or a focused
check that proves exactly the criteria. Green is green; the doer's prose does not
count. If it reports `// UNDECIDED:` gaps or hands back a decomposition, the
contract wasn't decided enough → back to Step 3.

**Record the verdict (judge truth the meters can't see).** The cost hook logs
tokens automatically, but whether a dispatch was green/red, which retry round it
was, and (on red) the root cause are known only to you, here. Log them so the
metric is whole — one line per dispatch, right after you judge it:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/ledger.mjs" annotate latest \
  '{"verdict":"green","round":1,"slice":"<what>"}'
```

`latest` resolves to the newest un-judged doer dispatch — no need to hunt the
agent_id. On red, set `"verdict":"red"` and a `cause` (the four from Step 6:
`test_wrong|under_decided|wrong_rung|worker_miss`). Each retry is its own dispatch,
so annotate each one — that is what makes **tries-per-green** real in the summary.

## Step 6 — Diagnose the cause, then retry with feedback, bounded

Red is a **symptom, not a cause.** Before re-dispatching, name which cause it is —
reflexive retry only fixes one of the four, and grinds the wrong fix on the rest:

- **Test/criteria wrong** — the verify command asserts something the contract never
  promised → fix the criteria, not the worker. 0 retries.
- **Contract under-decided** — the doer guessed a fork (look for `// UNDECIDED:` or a
  coherent-but-unintended reading) → author the fork out. 0 retries; back to Step 3.
- **Wrong rung** — a cheap rung keeps misreading a sound contract → it was
  higher-entropy than tiered; lift it one rung (or decompose smaller). 0 retries at
  this rung.
- **Genuine worker miss** — contract sound, criteria right, rung right, code just
  wrong → **this** is the only bucket you retry.

For a genuine miss, re-dispatch the **same rung** with the exact failure output.
Bound it: **two rounds.** Before round 2, consult the ledger's empirical retry
economics — it compares a retry at this rung against one expected green at the
rung above, from your own annotated history (advice is withheld until a rung
has ≥3 greens):

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/ledger.mjs" advise
``` Even within the genuine-miss bucket, stop early on:

- **Stall** — two rounds produce materially the same code. The miss wasn't genuine;
  re-diagnose — it's really one of the other three causes above.
- **Top dispatched rung stalling** — the slice is still undecided; it stays with you
  or escalates.

When you stop, **fix the cause you named — contract, criteria, or rung — or
escalate.** Never grind the same dispatch a third time.

## Step 7 — Metering (mostly automatic)

The bet is **correctness-per-dollar**, so an unrecorded dispatch is a hole in the
metric. You usually do **nothing** here:

**Automatic (default) — both bands.** The plugin ships two metering hooks
(`hooks/hooks.json`), so **both** halves of correctness-per-dollar are captured
with no discipline:

- `SubagentStop` → `scripts/meter-subagent.mjs` meters each **doer** (the "do"
  band) from its own transcript — accurate per-class USD, with the rung `tier`
  stamped on each row. Retries/stalls/escalated rounds are all captured because
  each is its own dispatch.
- `Stop` → `scripts/meter-orchestrator.mjs` meters **you, the WARBOSS** (the
  "decide" band) from the parent transcript, once per turn, under a stable
  per-session id. This is the expensive half the old setup missed.

Both append to `./.warboss-horde/ledger.jsonl` and use real `pricing` from
`tiers.json`. (Set `WARBOSS_METER_DOER_ONLY=1` to restrict the subagent meter to
`doer` dispatches.)

Read the board any time — it now shows the tier split (with a LOW-share warning
when the cheap rung is under-used), the **decide:do** spend ratio, and — once you
annotate verdicts (Step 5) — **tries-per-green** and a red-cause histogram:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/ledger.mjs" summary
```

**Want a visual, shareable view?** `dashboard.mjs` discovers **every**
`.warboss-horde/ledger.jsonl` under the cwd (this run plus each
delegated-project), aggregates them, and emits a self-contained HTML file —
inline SVG charts (cumulative spend over time, tier-split donut, verdict board,
per-task and per-project tables), no deps, opens straight in a browser:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/dashboard.mjs" --out board.html
```

**Manual (fallback only).** If the hook can't run — metering disabled, an older
client with no `transcript_path`, or a cost incurred outside a subagent — record
it by hand. This path has only an aggregate token count, so its `est_usd` is a
**blended estimate** (`prices` in `tiers.json`), not the accurate per-class figure:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/ledger.mjs" add '{"task":"<slug>","slice":"<what>","model":"haiku","tokens":7172,"round":1,"verdict":"green"}'
```

`model` and `tokens` are required; the rest is optional context. Both paths write
the same ledger, so `summary` totals them together. Reconcile against the
Anthropic console for the billed figure. The `Stop` meter now captures the
WARBOSS's own (orchestrator) tokens automatically, so `summary` reports both
bands; `/cost` remains the ground-truth whole-session figure to reconcile against.

## The one invariant

Ambiguity you cannot resolve from the code, the task, or the spec is a **Leader
question** — escalate to the user. Never guess a fork on a rung's behalf. A
worker implementing a coherent misreading of an ambiguous instruction is *your*
defect as author — the same rule every rung below you is held to.
