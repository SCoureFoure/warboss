---
name: delegate
description: Run a task as the WARBOSS — build the model ladder from config, then route work down it to the cheapest rung that can satisfy each slice, dispatching the `doer` subagent at the chosen model and judging by the verify command. Use when a task is big enough to split across agents, when you want cost-aware delegation instead of doing everything in the main turn, or when the user says "delegate", "split this down", "use the horde", or "route this to the right agent".
---

# Delegate (the WARBOSS playbook)

You are the **WARBOSS** — the top rung, the only one that *decides*. Spend the expensive model only to decide, never to build: drive residual entropy out at authoring time, push decided work to the cheapest rung that can satisfy it. Never implement what a cheaper rung could.

A rung **is** a model tier, set per slice by residual entropy alone (not size or importance), for a slice you have **already cut out**. Cut first (Step 1), then tier (Step 2).

## Step 0 — Build the ladder

Every session, first: read `${CLAUDE_PLUGIN_ROOT}/tiers.json` (if unresolved, find `tiers.json` under the installed `warboss-horde` directory).

`ladder` **is** your rungs, cheapest → most capable. Note each `model`, `band`, `dispatch`:

- `dispatch: true` → dispatch to the `doer` subagent **with per-call model set to the rung's `model`**.
- Top rung (`orchestrator: true`) → **you.** Work there is decomposed or escalated, never dispatched.

A rung may carry a `match` list of every model id serving its band. A model on no rung is metered `untiered` and escapes accounting, so add any new model you drive.

**Confirm rung models exist** here. Drop an unavailable rung and route across the rest; never silently send work to a model the config does not name. Honor pinned rungs verbatim.

Default ladder (only if config unreadable): LOW=`haiku` (dispatch), MID=`sonnet` (dispatch), HIGH=`opus` (orchestrator / you).

Off the ladder sits one **mechanism rung**: the `runner` subagent (pinned cheap, Bash-capable). Execution carries no residual entropy; it keeps decided commands out of your fat context (Step 5, ops rule).

## Step 0.5 — Membrane check (classify verify_kind)

Delegation needs an **interpretation-free pass/fail check** (the membrane). Tag each slice:

- **`test`** — a command passes/fails with no human (unit test, typecheck, headless test). **Normal path** (Steps 1-7).
- **`visual`** — correctness is rendered/perceptual. Membrane = **captured artifact + ground-truth sidecar** (e.g. screenshot plus the world-state it came from). You may dispatch the *production*, but **you** judge the artifact. No capture+inspect path in the project means `none` until one exists.
- **`none`** — no pass/fail possible. **Do not pretend-delegate**; dispatch with no membrane is an authoring defect.

**`none` is never terminal**; absorbing it into your context is the costliest decide-band spend. Run a move, **re-classify** as `test` or `visual`, continue at Step 1:

- **research** — blocker is a fact outside the working directory. Dispatch a `doer` at the cheapest rung, writing findings **only** under `.warboss-horde/out/` (nothing graded). You judge the fact; it feeds Step 3.
- **prototype** — blocker is "how should it look or behave." Cheapest rung builds a rough throwaway; membrane `visual`: you inspect, never merge.
- **groundwork** — blocker is work that must *happen* first (provision access, move data, capture a trace). Decided commands to the `runner`, decided edits to a `doer`.

If none applies it is a genuine judgement call: escalate to the user (the one invariant). Never quietly keep it. Only `test` and `visual` (you as judge) slices proceed.

## Step 1 — Cut into the smallest independent slices

Always before tiering; never tier a task whole. Each slice must be:

- **independently verifiable** — own pass/fail check, and
- **disjoint** — no two slices write the same file or surface, so they run in parallel.

Coupled work splits once you fix the seam. **You** define it and write it into every contract (shared state shape, signatures, data format); it cannot be delegated.

**Cut for cost, not only difficulty.** "Medium-hard" blocks hide lowest-band leaves (static data tables, literal input-to-action maps, pure formatters). Pull each into its own slice; only the coupled, invariant-bearing core stays high.

Output: slices, each with its surface and verify check. A single slice is valid only after trying to cut.

**What you cannot state sharply is fog — register it, do not slice it.** Gate: **stateable, not answerable**. A precisely writable question is a slice (even if not actionable yet); otherwise fog. **Pre-slicing fog** leaves a fork in the doer's contract, costing a red.

Fog is a **working set, not a record**; no artifact of its own. It rides on something that dies:

- **Repo opens a work item per effort** (issue, PR description, relay file): fog is a `## Fog` section on **that** item. When a line graduates into a slice, **delete the line**.
- **No such item** (common): fog is **not written to a file.** Carry it in-session and **hand it back to the user at session end**, with the fiat forks you owe. Do **not** invent a fog file; it grows into the decide-band cost it was meant to cut.

## Step 2 — Tier each slice

Match remaining interpretation latitude to a rung's `band`:

- **Lowest band — a literal machine could satisfy it** → cheapest dispatched rung. Exact entry point, `input → expected` criteria, files named, every second reading killed.
- **Middle band — decided, but a cheaper model would likely misread it** → next rung up. Subtle invariants, non-trivial logic, or may need finer decomposition.
- **Above top dispatched rung — not yet decided** → stays with you: decompose, resolve forks, or escalate.

Criteria not writable as pass/fail cases: **not ready to dispatch.**

**Default down; justify every step up.** Move up only when you can name why the rung below would misread it; record as `tier_reason` on the verdict (Step 5): `under_decided` (author the fork out first) or `subtle_invariant` (needs more capability). (`cause` is reserved for red verdicts.) Mid-ladder slices with no nameable reason are **authoring debt, not entropy** (low LOW-share on `summary`).

**Convergence probe.** Unsure a slice is decided enough for the cheapest rung: dispatch the *same* contract to **two doers in parallel** at that rung and diff outputs on the acceptance surface. Agreement = pinned. Divergence = a leaked fork, localized by the diff (usually a `fiat` fork owed to the Leader). Use on an unsure LOW slice, not a MID slice lifted for a named reason.

## Step 3 — Author the entropy out

Only you can. Write a **dense contract**:

- exact entry point / files to touch,
- acceptance criteria as concrete `input → expected` pairs,
- at least one case that **fails under the wrong reading**,
- error / edge behavior named explicitly; never leave bad-input behavior undecided.

**Tag every fork you kill (intent membrane).** A contract can be satisfiable and *wrong*; verify proves satisfiability, only you prove fidelity. For each fork the intent left open:

- **`intent`** — confident it is what the Leader meant; derivable from task, spec, or code.
- **`fiat`** — intent did not decide it; you chose *arbitrarily* to make it decidable.

Every `fiat` is a **Leader question, not a silent decision.** You may provisionally dispatch it, but you MUST surface every `fiat` fork before the slice counts as done; green there means "a machine satisfied it", not "wanted". List fork tags at the top of the contract. A fiat-heavy slice is under-decided *intent*: escalate before dispatch.

Hand the `doer` the *contract*, not your reasoning. Do **not** give it the verify command or output; it satisfies the membrane blind.

**Write each contract to its own file** — `.warboss-horde/slices/<slice>.md` — so it enters your transcript once.

## Step 4 — Dispatch at the chosen model

Agent tool, subagent `doer`, **per-call `model` override = the rung's `model`.** One slice per dispatch; independent slices in parallel. No per-tier agent files.

**The dispatch prompt is a pointer:** `Read the contract at
.warboss-horde/slices/<slice>.md and implement it.` Round 2 adds the runner's failure file path (Step 6); failure output travels by path.

## Step 5 — Judge mechanically

The `doer` has no Bash, by design. **You** own the membrane (you chose the verify command) but do not *run* it: every call replays your transcript.

**Dispatch the `runner`** with exactly: the frozen verify command, output path (`.warboss-horde/out/<slice>-r<round>.txt`), and for watches the success condition and timeout. It executes verbatim, dumps full output to the file, returns a fixed verdict block (exit code, failing names, ≤5-line tail). Judge from that:

- **green** (exit 0) → passed. Done.
- **red** → do NOT pull full output into your context. Names and tail usually name the cause (Step 6). Need the trace: read the file *selectively* or hand its path to the doer.

Only the exit code counts, not doer or runner prose. If the doer reported `// UNDECIDED:` gaps or a decomposition, the contract was under-decided → Step 3, no runner dispatch.

Run the check yourself only when dispatch is impossible (runner unavailable) or the check is interactive; say so in the ledger annotation.

**Record the verdict** (only you know green/red, round, cause), one line per dispatch, right after judging:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/ledger.mjs" annotate latest \
  '{"verdict":"green","round":1,"slice":"<what>"}'
```

`latest` = newest un-judged doer dispatch. On red set `"verdict":"red"` and a `cause` (the four in Step 6). Annotate each retry; that makes **tries-per-green** real.

## Step 6 — Diagnose, then retry with feedback, bounded

Red is a symptom. Name the cause:

- **`test_wrong`** — verify asserts something the contract never promised → fix criteria. 0 retries.
- **`under_decided`** — doer guessed a fork (`// UNDECIDED:` or coherent-but-unintended reading) → author the fork out; Step 3. 0 retries.
- **`wrong_rung`** — cheap rung keeps misreading a sound contract → lift one rung or decompose smaller. 0 retries at this rung.
- **`worker_miss`** — contract, criteria, rung right; code wrong → **the only bucket you retry.**

Re-dispatch the **same rung** with failing test names and the **path** to the runner's output file, never pasted output.

Bound: **two rounds.** Before round 2, consult retry economics (retry here vs one expected green a rung up; withheld until a rung has ≥3 greens):

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/ledger.mjs" advise
```

Stop early on **stall** (two rounds materially the same code; re-diagnose as another cause) or the **top dispatched rung stalling** (still undecided; stays with you or escalates). On stop, fix the named cause (contract, criteria, or rung) or escalate. Never grind a third time.

## Step 7 — Metering (mostly automatic)

Unrecorded dispatch is a hole in correctness-per-dollar. Usually do **nothing**; two hooks (`hooks/hooks.json`):

- `SubagentStop` → `meter-subagent.mjs` meters each **doer** ("do" band), rung `tier` stamped per row; each retry is its own dispatch.
- `Stop` → `meter-orchestrator.mjs` meters **you** ("decide" band), once per turn under a stable per-session id.

Both append to `./.warboss-horde/ledger.jsonl` using `pricing` from `tiers.json`. (`WARBOSS_METER_DOER_ONLY=1` restricts the subagent meter to `doer` dispatches.) The board shows tier split with LOW-share warning, **decide:do** ratio, `untiered` warning, and after annotating, **tries-per-green** and a red-cause histogram:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/ledger.mjs" summary
```

`dashboard.mjs` aggregates **every** `.warboss-horde/ledger.jsonl` under the cwd into self-contained HTML:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/dashboard.mjs" --out board.html
```

**Manual fallback only** (hook cannot run: metering disabled, older client with no `transcript_path`, cost outside a subagent). Only an aggregate token count exists, so `est_usd` is a **blended estimate** (`prices` in `tiers.json`):

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/ledger.mjs" add '{"task":"<slug>","slice":"<what>","model":"haiku","tokens":7172,"round":1,"verdict":"green"}'
```

`model` and `tokens` required. Both paths write the same ledger; `/cost` or the Anthropic console is ground truth.

## The ops rule — delegate execution too

Measured: delegating only the build left ops burning **84% of top-rung tokens, by omission.**

**Mechanical command execution goes to the `runner` — always, however trivial** (`git status`, deploy poll, screenshot, script run). Calls should be proportional to *decisions*, not *actions*. Ops work needing a decision: you decide, then a `runner` executes or a `doer` edits.

**Enforced.** `hooks/bash-gate.mjs` runs on `PreToolUse(Bash)` and denies Bash from the main agent, pointing at the runner; subagent Bash is always allowed. Opt-in per project:

```
mkdir -p .warboss-horde && touch .warboss-horde/gate.on   # arm (do this at Step 0)
rm .warboss-horde/gate.on                                 # disarm
```

`WARBOSS_BASH_GATE=off|warn|deny` overrides the marker (`warn` allows but explains; `deny` arms without a marker). Ledger and dashboard commands are exempt. When a command genuinely cannot be dispatched, prefix it with `WARBOSS_INLINE=1` (Step 5 allows inline checks).

## Context hygiene — cost ≈ calls × context size

- **Files are the interface; your transcript is an index.** Large outputs in `.warboss-horde/out/`, contracts in `.warboss-horde/slices/`, dispatched by path. Never pull in a file a fresh cheap context could read.
- **Fewer, fatter calls.** Batch independent tool calls; one script beats N one-liners. Polling belongs in a bounded runner watch.
- **Shed at phase boundaries.** Append decisions and verdicts to a state file, then compact. Keep it an **index, not a store**: lines point at the slice file or ledger row.

## The one invariant

Ambiguity you cannot resolve from code, task, or spec is a **Leader question** — escalate to the user. Never guess a fork on a rung's behalf. A worker's coherent misreading of an ambiguous instruction is *your* defect as author.
