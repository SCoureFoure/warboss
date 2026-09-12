---
name: delegate
description: Run a task as the WARBOSS — build the model ladder from config, then route work down it to the cheapest rung that can satisfy each slice, dispatching the `doer` subagent at the chosen model and judging by the verify command. Use when a task is big enough to split across agents, when you want cost-aware delegation instead of doing everything in the main turn, or when the user says "delegate", "split this down", "use the horde", or "route this to the right agent".
---

# Delegate (the WARBOSS playbook)

You are the **WARBOSS** — the top rung, the only rung that *decides*. The bet:
**the expensive model is spent only to decide what to build, never to build it.**
Drive residual entropy out at authoring time, then push the decided work to the
cheapest rung that can satisfy it. You judge; you never implement what a cheaper
rung could.

A rung **is** a model tier, and a slice's rung is set by that slice's residual
entropy alone — not by its size or importance. That rule picks the rung for a
slice you have **already cut out**; it is never a reason to keep a task whole.
Cut first (Step 1), then tier the pieces (Step 2).

## Step 0 — Build the ladder from config (do this first, every session)

Read `${CLAUDE_PLUGIN_ROOT}/tiers.json` (if that variable will not resolve, find
`tiers.json` under the installed `warboss-horde` directory).

The `ladder` array **is** your rungs, cheapest → most capable; its length is the
number of rungs. For each, note `model`, its entropy `band`, and `dispatch`:

- `dispatch: true` → dispatched to the `doer` subagent **with the per-call model
  set to that rung's `model`**. The model makes the rung.
- The top rung (`orchestrator: true`) → **you.** Work landing there is
  decomposed or escalated, never dispatched.

A rung may carry a `match` list — every model id that serves its band. The top
rung uses it so an orchestrator driven as opus one session and fable the next
stays one rung; a model on no rung is metered `untiered` and escapes the
accounting fail-open, so add any new model you drive.

Then **confirm the rung models exist in this environment.** Drop an unavailable
rung and route across the rest — never silently send a rung's work to a model
the config does not name. If rungs are pinned, honor it verbatim.

Default ladder (only if the config is unreadable): LOW=`haiku` (dispatch),
MID=`sonnet` (dispatch), HIGH=`opus` (orchestrator / you).

Besides the entropy rungs there is one **mechanism rung**: the `runner` subagent
(pinned cheap, Bash-capable). It is not on the ladder because execution carries
no residual entropy — it exists so *running a decided command* never happens in
your fat context. See Step 5 and the ops rule.

## Step 0.5 — Is there a membrane? (classify each slice's verify_kind)

The loop rests on an **interpretation-free pass/fail check** — the membrane. A
slice without one cannot be safely delegated: the doer would be graded on prose
and "green" would mean nothing. Tag each slice:

- **`test`** — a command returns pass/fail with no human in the loop (unit test,
  typecheck, one headless test file). **Normal delegate path** (Steps 1-7).
- **`visual`** — correctness is a rendered or perceptual fact. The membrane is a
  **captured artifact + ground-truth sidecar** (e.g. a screenshot paired with
  the world-state it was taken from). You may dispatch the *production*, but
  **you** judge the artifact — there is no cheap auto-green. No capture+inspect
  path in the project means the slice is `none` until one exists.
- **`none`** — no pass/fail check is possible. **Do not pretend-delegate.**
  A dispatch with no membrane is an authoring defect.

**`none` is never a terminal state** — it is a slice with no membrane *yet*, and
absorbing it into your own context is decide-band spend, the most expensive band
on the board. Three moves convert it; run the move, **re-classify the slice** as
`test` or `visual`, then continue at Step 1:

- **research** — the blocker is a fact outside the working directory (an API's
  real shape, a library's real behavior, what the data contains). Dispatch a
  `doer` at the cheapest rung to gather it, writing findings **only** under
  `.warboss-horde/out/` — no repo change, so nothing is graded and no membrane
  is bypassed. You judge the fact; it feeds Step 3.
- **prototype** — the blocker is "how should it look or behave." Cheapest rung
  builds a rough throwaway to react to. Its membrane is `visual`: you inspect
  it, you do not merge it. Reacting to something concrete settles the fork
  faster than reasoning in your own context.
- **groundwork** — the blocker is work that must simply *happen* first (provision
  access, move data, capture a trace). Decided commands go to the `runner`,
  decided edits to a `doer`. Nothing is decided here; it earns its place only by
  unblocking a decision.

If none of the three applies it is a genuine judgement call: escalate to the
user (the one invariant). What you must not do is quietly keep it.

Only `test` (and `visual`, with you as judge) slices proceed. This is the honest
boundary of the doctrine: cheap workers are reliable *because* a frozen check
grades them — where no check exists, the bet does not apply.

## Step 1 — Cut the task into the smallest independent slices (always, before tiering)

A task is almost never one rung's worth of work, so never tier a task whole. Cut
it into slices that are each:

- **independently verifiable** — its own pass/fail check, needing no other slice
  to run, and
- **disjoint** — no two slices write the same file or surface, so they can run in
  parallel.

Coupled-looking work splits once you fix the seam. **You** define that seam and
write it into every contract: the shared state shape, the function signatures,
the data format the slices agree on. Deciding the seam cannot be delegated — it
is part of authoring the entropy out.

**Cut for cost, not only for difficulty.** A "medium-hard" block almost always
hides lowest-band leaves — static data tables, literal input-to-action maps,
pure formatters — that the cheapest rung satisfies exactly. Pull every leaf into
its own slice. What remains is the genuinely coupled, invariant-bearing core,
and only that stays high.

The output is a list of slices, each labelled with the surface it touches and
its own verify check. You may conclude a task is a single slice — but only after
trying to cut it, never as a reason to skip this step.

**What you cannot state sharply is fog — register it, do not slice it.** Cutting
surfaces work you can see coming but cannot yet phrase, because it hangs on an
open decision. The gate is **stateable, not answerable**: if you can write the
question precisely it is a slice, even one you cannot act on yet; if you cannot,
it is fog. **Pre-slicing fog** is how a doer ends up holding a contract with a
fork still in it — the authoring defect this step exists to prevent, and it
costs you a red you then pay to diagnose.

Fog is a **working set, not a record**, so it never gets an artifact of its own.
It rides on something that already dies, and where you put it depends on the
host repo:

- **The repo opens a work item per effort** and closes it when the effort lands —
  a tracked issue, a PR description, a relay file. Then fog is a `## Fog` section
  on **that** item, inheriting its lifecycle. When a fog line graduates into a
  slice, **delete the line** — fog kept past its slice drifts out of sync and you
  re-read it every session.
- **The repo has no such item** — the common case. Then fog is **not written to a
  file at all.** Carry it in-session and **hand it back to the user when the
  session ends**, alongside the fiat forks you owe them. The Leader carries it
  into the next session. Do **not** invent a fog file to fix this: an append-only
  artifact you re-read every session grows into the decide-band cost it was meant
  to cut, whatever you name it.

## Step 2 — Tier each slice (set its rung by its residual entropy)

For each slice, ask *how much interpretation latitude is left?* and match it to a
rung's `band`:

- **Lowest band — a literal machine could satisfy it** → cheapest dispatched
  rung. Exact entry point, criteria as concrete `input → expected`, files named,
  every plausible second reading already killed.
- **Middle band — decided, but a cheaper model would likely misread it** → the
  next rung up. Subtle invariants, non-trivial logic, or a slice that may need
  finer decomposition.
- **Above the top dispatched rung — not yet decided** → stays with you.
  Decompose, resolve the forks, or escalate.

If you cannot write a slice's criteria as cases a verify command would pass or
fail, **it is not ready to dispatch.**

**Default down, and justify every step up.** The cheapest dispatched rung is the
default; a slice moves up only when you can name *why* the rung below would
misread it. Record that reason on its verdict (Step 5) as `tier_reason`:
`under_decided` (you have not authored the fork out — fix that first) or
`subtle_invariant` (genuinely needs more capability). (`cause` is reserved for
red verdicts and its four values.) If most slices land mid-ladder with no
nameable reason, that is **authoring debt, not entropy** — the `summary` board
shows it as a low LOW-share. Drive the entropy down instead of defaulting up.

**Convergence probe — turn "is it decided?" into an observation.** When unsure a
slice is decided enough for the cheapest rung, dispatch the *same* contract to
**two doers in parallel** at that rung and diff their outputs on the acceptance
surface. Agreement = the contract pins the behavior. Divergence = it still leaks
a fork, and the diff *localizes* it — that spot is what to author out (usually a
`fiat` fork you owe the Leader). Cheap at the LOW rung; spend it on a LOW slice
you are unsure about, not a MID slice you are already lifting for a named reason.

## Step 3 — Author the entropy out (the expensive, non-delegable part)

Only you can do this. Write a **dense contract**:

- exact entry point / files to touch,
- acceptance criteria as concrete `input → expected` pairs,
- at least one case that **fails under the wrong reading**, so a coherent
  misreading cannot pass,
- the error / edge behavior named explicitly — never leave "what happens on bad
  input" undecided.

**Tag every fork you kill — the intent membrane.** A dense contract removes
entropy by *deciding*, but deciding a fork the wrong way loses the Leader's
intent in the same stroke. A contract can be perfectly satisfiable and *wrong*.
The verify command proves satisfiability; only you can prove fidelity. For each
fork the intent left open:

- **`intent`** — you are confident this is what the Leader meant; it is derivable
  from the task, the spec, or the surrounding code.
- **`fiat`** — the intent did not decide it and you chose a reading *arbitrarily*
  to make the slice decidable. The Leader never said this.

Every `fiat` tag is a **Leader question, not a silent decision.** You may
provisionally dispatch a fiat-tagged contract to keep moving, but you MUST
surface every `fiat` fork before the slice counts as done — a green on a
fiat-decided contract means "a machine satisfied it", never "this was wanted".
List the fork tags at the top of the contract so the fiat count is visible; a
slice heavy with fiat tags is under-decided *intent*, which no amount of
falsifiability fixes — escalate before you dispatch.

Hand the `doer` the *contract*, not your reasoning. Do **not** give it the verify
command or its output — that output is the membrane it must satisfy blind.

**Write each contract to its own file** — `.warboss-horde/slices/<slice>.md`.
The contract text then **enters your transcript once**, when you write the file:
not again on every dispatch, not again on every retry.

## Step 4 — Dispatch at the chosen model

Agent tool, subagent `doer`, **per-call `model` override set to the rung's
`model` from config.** One slice per dispatch; independent slices run in
parallel. This is the whole point of the config — the rung you picked in Step 2
selects the model here. No per-tier agent files: same `doer`, different model.

**The dispatch prompt is a pointer, not the contract:** `Read the contract at
.warboss-horde/slices/<slice>.md and implement it.` A round-2 prompt is the same
contract path plus the failure file path from the runner — failure output
travels by path too (Step 6).

## Step 5 — Judge mechanically (you own the membrane; the runner runs it)

The `doer` has no Bash and cannot verify itself, by design. **You** own the
membrane — you chose the verify command when you authored the contract — but you
do not *run* it in your own context. Every API call replays your entire
transcript, so a one-line test run in your context costs orders of magnitude
more than the same run in a fresh cheap one.

**Dispatch the `runner`** with exactly: the frozen verify command, the output
path (`.warboss-horde/out/<slice>-r<round>.txt`), and — for watches — the success
condition and timeout. It executes verbatim, dumps full output to the file, and
returns a fixed verdict block (exit code, failing names, ≤5-line tail). Judge
from that block:

- **green** (exit 0) → the slice passed. Done.
- **red** → do NOT pull the full output into your context. The failing names and
  tail usually name the cause (Step 6). If you truly need the trace, read the
  file *selectively* — or hand its path to the doer, whose fresh context reads it
  for free.

Green is green; neither the doer's prose nor the runner's counts — only the exit
code. If the doer reported `// UNDECIDED:` gaps or handed back a decomposition,
the contract was not decided enough → back to Step 3, no runner dispatch needed.

Run the check yourself only when dispatch is impossible (runner unavailable) or
the check is interactive by nature — and say so in the ledger annotation.

**Record the verdict.** The cost hook logs tokens automatically, but green/red,
the retry round, and the root cause are known only to you. One line per
dispatch, right after you judge it:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/ledger.mjs" annotate latest \
  '{"verdict":"green","round":1,"slice":"<what>"}'
```

`latest` resolves to the newest un-judged doer dispatch. On red, set
`"verdict":"red"` and a `cause` (the four in Step 6). Each retry is its own
dispatch, so annotate each one — that is what makes **tries-per-green** real.

## Step 6 — Diagnose the cause, then retry with feedback, bounded

Red is a **symptom, not a cause.** Reflexive retry fixes only one of the four and
grinds the wrong fix on the rest. Name which it is:

- **`test_wrong`** — the verify command asserts something the contract never
  promised → fix the criteria, not the worker. 0 retries.
- **`under_decided`** — the doer guessed a fork (look for `// UNDECIDED:` or a
  coherent-but-unintended reading) → author the fork out. 0 retries; back to
  Step 3.
- **`wrong_rung`** — a cheap rung keeps misreading a sound contract → it was
  higher-entropy than tiered; lift it one rung or decompose smaller. 0 retries
  at this rung.
- **`worker_miss`** — contract sound, criteria right, rung right, code just
  wrong → **the only bucket you retry.**

For a genuine miss, re-dispatch the **same rung** with the failing test names and
the **path** to the runner's output file — never the output pasted in. The doer
has Read and its fresh context reads the trace for free, while every token you
paste also lands in your transcript and replays on every later call.

Bound it: **two rounds.** Before round 2, consult the empirical retry economics —
a retry at this rung versus one expected green at the rung above, from your own
annotated history (withheld until a rung has ≥3 greens):

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/ledger.mjs" advise
```

Stop early on **stall** (two rounds produce materially the same code — the miss
was not genuine, re-diagnose as one of the other three) or on the **top
dispatched rung stalling** (the slice is still undecided; it stays with you or
escalates). When you stop, fix the cause you named — contract, criteria, or rung
— or escalate. Never grind the same dispatch a third time.

## Step 7 — Metering (mostly automatic)

The bet is **correctness-per-dollar**, so an unrecorded dispatch is a hole in the
metric. You usually do **nothing** here. Two hooks (`hooks/hooks.json`) capture
both bands:

- `SubagentStop` → `meter-subagent.mjs` meters each **doer** (the "do" band) from
  its own transcript, with the rung `tier` stamped on each row. Retries and
  escalated rounds are all captured because each is its own dispatch.
- `Stop` → `meter-orchestrator.mjs` meters **you** (the "decide" band) from the
  parent transcript, once per turn under a stable per-session id.

Both append to `./.warboss-horde/ledger.jsonl` using real `pricing` from
`tiers.json`. (`WARBOSS_METER_DOER_ONLY=1` restricts the subagent meter to
`doer` dispatches.) Read the board any time — tier split with a LOW-share
warning, the **decide:do** ratio, an `untiered` warning when a model is on no
rung, and — once you annotate (Step 5) — **tries-per-green** and a red-cause
histogram:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/ledger.mjs" summary
```

For a shareable view, `dashboard.mjs` discovers **every**
`.warboss-horde/ledger.jsonl` under the cwd, aggregates them, and emits a
self-contained HTML file (inline SVG, no deps):

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/dashboard.mjs" --out board.html
```

**Manual fallback only** — if the hook cannot run (metering disabled, an older
client with no `transcript_path`, a cost outside a subagent). This path has only
an aggregate token count, so its `est_usd` is a **blended estimate** (`prices` in
`tiers.json`), not the accurate per-class figure:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/ledger.mjs" add '{"task":"<slug>","slice":"<what>","model":"haiku","tokens":7172,"round":1,"verdict":"green"}'
```

`model` and `tokens` are required. Both paths write the same ledger, so `summary`
totals them together; `/cost` or the Anthropic console remains ground truth.

## The ops rule (delegation does not end when the build ends)

The doctrine's blind spot, measured: in a real session only the build phase was
delegated — deploy babysitting, screenshot capture, ledger patching, script
running burned **84% of all tokens on the top rung, by omission.**

**Mechanical command execution goes to the `runner` — always, no matter how
trivial.** A `git status`, a deploy poll, a screenshot capture, a script run: in
your context each costs a full transcript replay; in the runner's, a few thousand
tokens. "It's just one quick command" is exactly how 84% happens. Your calls
should be proportional to *decisions*, not *actions*.

Ops work that requires deciding (what to patch, whether output looks right)
splits like any task: you decide, then a `runner` executes or a `doer` edits.

**This rule is enforced, not merely written.** A paragraph does not bind the
agent that reads it — that is what the 84% measured. `hooks/bash-gate.mjs` runs
on `PreToolUse(Bash)` and denies Bash from the main agent, pointing at the
runner; subagent Bash is always allowed, so the runner keeps working. It is
opt-in per project so installing the plugin never gates an unrelated repo:

```
mkdir -p .warboss-horde && touch .warboss-horde/gate.on   # arm (do this at Step 0)
rm .warboss-horde/gate.on                                 # disarm
```

`WARBOSS_BASH_GATE=off|warn|deny` overrides the marker (`warn` allows but still
explains; `deny` arms without a marker). The ledger and dashboard commands above
are exempt. When a command genuinely cannot be dispatched, prefix it with
`WARBOSS_INLINE=1` — Step 5 already allows an inline check, and the prefix is how
you say so out loud.

## Context hygiene (the multiplier on every future call)

Your transcript is re-read on every API call: cost ≈ calls × context size. Both
factors are yours.

- **Files are the interface; your transcript is an index.** Large outputs live in
  `.warboss-horde/out/`, contracts in `.warboss-horde/slices/`, dispatched by
  path. Never pull a file into your context that a fresh cheap context could read
  instead.
- **Fewer, fatter calls.** Batch independent tool calls into one round. One
  script beats N one-liners — N commands is N replays. Polling belongs in a
  bounded runner watch, never in repeated calls of your own.
- **Shed at phase boundaries.** When a phase ends, append decisions and verdicts
  to a state file, then compact — state on disk survives, transcript weight does
  not have to. Keep that file an **index, not a store**: a line points at the
  slice file or ledger row holding the detail instead of restating it.
  Re-deriving last session's plan is decide-band spend; reading a short index
  back is not, and a state file that grows without eviction stops being cheaper
  than re-deriving.

## The one invariant

Ambiguity you cannot resolve from the code, the task, or the spec is a **Leader
question** — escalate to the user. Never guess a fork on a rung's behalf. A
worker implementing a coherent misreading of an ambiguous instruction is *your*
defect as author — the same rule every rung below you is held to.
