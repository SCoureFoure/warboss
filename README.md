# warboss

> A machine that manufactures certainty, then spends the cheapest possible
> intelligence against it.

## The bet

Most agent systems try to win by making the model smarter. warboss bets the
opposite: **once intent is encoded densely enough, the model doing the work
barely has to be smart at all.** Intelligence moves out of the worker and into
two places — the *contract* that pins down what "correct" means, and the *loop*
that grinds against it until it's satisfied.

If that bet holds, the expensive model is needed only to **decide** what should
be built, never to build it. The building is handed to the cheapest model that
can still satisfy a sufficiently complete specification. The thing we are
actually trying to drive down is **correctness-per-dollar** — every run logs
tokens and cost from day one, because a correctness win that costs more than a
high-end one-shot would have isn't a win.

The whole project is built to **falsify that bet first**. If a cheap worker plus
an honest contract plus retry can't beat a single high-model attempt on
correctness-per-dollar, we want to learn it early and cheaply.

## The idea, in one picture

Between human intent and machine execution there is exactly one place where a
signal can be **interpretation-free**: an executable contract. Code that runs
either passes or it doesn't — it can't be misread, argued with, or drifted away
from. We call that frozen, executable layer the **membrane**.

```text
        intent  ──▶  WARBOSS decomposes it  ──▶   ╔═══════════════╗
     (the human)     into requirements +           ║   MEMBRANE    ║
                     acceptance examples           ║ frozen,       ║
                                                   ║ executable    ║
                                                   ║ contracts     ║
                                                   ╚═══════╤═══════╝
                                                           │ injected down the chain
                                              cheap workers ▼ grind against it
                                       generate ──▶ judge ──▶ retry ──▶ green
```

Above the membrane: deciding. Below it: doing. The membrane is the only thing
that crosses, and it crosses in a form that can't be corrupted.

## End to end, one task

A single intent travels the whole machine like this. The expensive model is only
ever spent in the top band; everything below the membrane runs cheap.

```text
  ┌─ DECIDE (high model, spent once) ───────────────────────────────────┐
  │                                                                      │
  │   intent ─▶ decompose ─▶ self-audit ─▶ admit? ─▶ FREEZE (hash-pin)   │
  │             │            error-       │  probe                       │
  │             │            coverage     │  agrees?                     │
  │             ▼            mandate       ▼                              │
  │      underdetermined?              NOT-READY ─▶ kick back to Leader      │
  │      escalate to Leader ──────────────────────────▶ (answer + re-author)│
  └────────────────────────────────────┬─────────────────────────────────┘
                                        │  frozen contract crosses the membrane
  ┌─ DO (cheapest viable model, metered) ▼ ─────────────────────────────┐
  │                                                                      │
  │     ┌──────────────────────────────────────────────┐                │
  │     │  generate ─▶ run against contract ─▶ judge     │                │
  │     │      ▲                                  │      │  every call    │
  │     │      │     fail: feedback = the why     │      │  → cost ledger │
  │     │      └──────────────◀───────────────────┘      │                │
  │     └──────────────────┬───────────────────────────┘                 │
  │                        ▼                                              │
  │              green · stalled · out of budget                         │
  └──────────────────────────────────────────────────────────────────────┘
```

Two facts make this honest rather than hopeful:

- The contract is **hash-frozen**: the runner refuses to execute against
  anything but its registered hash, so a worker can't quietly edit the goal.
- The worker is graded against a **hidden battery** that never appears in any
  prompt, feedback, or logged artifact — so "green" can't be gamed by reading
  the test.

## The horde (and why the hierarchy exists)

The roles borrow orc lore, but the structure is doing real work.

```text
LEADER (you) ─▶ WARBOSS ─▶ WARCHIEF ─▶ SERGEANT ─▶ GRUNT
  decide      author      carry       dispatch    do
```

- **You are Leader.** You speak only to your chosen champions — never to the horde.
- A **Warboss** interprets your goal and sets the contract. It never touches a
  grunt.
- **Warchiefs / Sergeants** carry frozen slices down the chain and dispatch the
  horde.
- **Grunts** are the cheapest models. Dogmatic doers, not planners — they receive
  a fully decided environment and execute it.

Three rules make this more than flavor:

1. **Talk to your neighbor only.** No rank speaks across or skips a layer. That's
   the noise-isolation mechanism: interpretation latitude collapses one hop at a
   time, and a bad reading at any layer can't propagate past its neighbor. (This
   is the "intention-decay" problem from the references, solved structurally —
   dense intent, bounded context, shape-the-environment-don't-instruct.)
2. **Model power follows task entropy, not rank.** Each rank's job is to break
   the complexity it's handed into smaller, lower-entropy chunks for the rank
   below. As work descends, less is left to interpret, so a cheaper model becomes
   viable — until the cheapest tier can satisfy the contract outright. The
   hierarchy is a **fractal**: add ranks or widen the horde as the work demands.
   (Tiers: LOW=haiku, MID=sonnet, HIGH=opus — a capability ladder, `src/models.ts`.)
3. **Entropy is reduced at authoring time, never at implementation time.** All
   discipline lands on the rank that *writes* — every rule stated as a
   mechanical input → output, every sentence falsifiable by an example, every
   second reading killed by a case that fails under it. Grunts are left as
   simple machines; you control the author's prompt, not the worker's mind. (A
   worker that implements a coherent misreading of an ambiguous sentence is the
   author's defect — we learned this one the empirical way.)

## How the parts earn their place

Each idea in [`references/`](references/) contributes one organ of the machine
(the full synthesis is in [duh_plan.md](duh_plan.md)):

| Source | What it gives us |
| --- | --- |
| Agentic Hierarchy of Needs (the spine) | The membrane: the only interpretation-free signal between intent and execution. |
| AlphaProof Nexus | The loop: a reliable system from an unreliable generator + an honest judge + retry. The judge's *why* is part of the loop. |
| Fractal Views | Constant-size context per worker → small context → small model stays viable. |
| Shannon / compression | Why a frozen contract works: it's the lowest-entropy encoding of intent — a solved variable removed from the problem. |
| Intention-decay protocols | The transmission rules: dense intent, bounded context, shape the environment instead of micro-instructing. |
| Orc lore | The topology and the names. |

## Falsify-first: the experiment ladder

Build order is **falsify-first** — the earliest, cheapest experiments are the
ones most able to kill the thesis. Each rung had a pre-registered success
criterion and a real (small) live spend. Full detail in [duh_plan.md](duh_plan.md).

```text
  RUNG          QUESTION                                       VERDICT
  ────────────────────────────────────────────────────────────────────────────
  E1a   Does the contract collapse interpretation?         ✅ YES   modal agreement
        (same task, N runs, with vs without a contract)            0.97 vs 0.60;
                                                                   18/30 not even
                                                                   viable w/o it
  ────────────────────────────────────────────────────────────────────────────
  E1b   Cheap + honest judge + retry vs one expensive       ◑ LOOP WORKS
        shot?                                                 green 1.00 @ ~1.1
                                                              tries, 9.5× cheaper
                                                              per green. Score
                                                              plateau = contract
                                                              authoring debt, not
                                                              loop failure.
  ────────────────────────────────────────────────────────────────────────────
  E2    Does machine-authored beat human-authored on        ◑ ERROR PATH SOLVED
        the same grunt loop?                                  warboss error
                                                              coverage 1.000 vs
                                                              human 0.000. Happy-
                                                              path miss = intent
                                                              was underdetermined
                                                              → motivates E3.
  ────────────────────────────────────────────────────────────────────────────
  E3    Can warboss surface underdetermined semantics       ✅ PASS  all 3 known
        BEFORE freezing (instead of guessing)?                ambiguities surfaced
                                                              pre-freeze ($0.087).
  ────────────────────────────────────────────────────────────────────────────
  E4    Close the loop: Leader answers the escalations →       ✅ PASS  warboss 0.918
        warboss re-authors → re-run on a NEUTRAL oracle.      vs human 0.724 on a
                                                              neutral Leader battery
                                                              ($0.252).
  ────────────────────────────────────────────────────────────────────────────
        E1 ─▶ E2 ─▶ E3 ─▶ E4 chain CLOSED.
```

The headline: a cheap model behind a dense, machine-authored contract beats a
high model on covered correctness while costing ~10× less per green — and the
one place machine authoring lost (happy-path ambiguity) turned out to be intent
the human never decided, which the kick-back loop now surfaces and resolves
before anything freezes.

One thing the experiments *killed*: the idea of a cheap-model **readiness judge**
that just declares "READY / NOT-READY." It fails both ways (over-confident in one
form, over-skeptical in another). What survived as the actual admission gate is a
**convergence probe** — run K independent cheap generations against the contract;
if the survivors don't agree on held-out cases, the contract isn't decided enough
to freeze. The model that does the work votes on whether the work is decided.

## How to use

warboss ships in two halves, and which one you want depends on what you're after:

| You want to… | Install | Needs |
| --- | --- | --- |
| **Use the delegation doctrine in your own Claude Code** | the **`warboss-horde` plugin** | nothing but Claude Code |
| **Run the research harness** (membrane, loop, gate, live experiments) | clone this repo | Node ≥ 22; an API key only for live runs |

The plugin is the part most people install — it's the thesis packaged as a
reusable Claude Code skill. The harness is the lab the thesis was proven in;
clone it only if you want to run or extend the experiments themselves.

### A. Use the delegation doctrine — install the plugin

The `warboss-horde` plugin turns Claude Code into the WARBOSS: it reads a model
ladder, routes each slice of work to the cheapest model that can satisfy it, and
dispatches a single generic `doer` subagent at that model. No Node, no API key,
no clone — it runs inside Claude Code.

**1. Add the marketplace and install** (in any Claude Code session):

```text
/plugin marketplace add SCoureFoure/warboss
/plugin install warboss-horde@warboss-marketplace
```

**2. Delegate a task.** Once installed, run the skill on any task big enough to
split up:

```text
/warboss-horde:delegate add a rate limiter to the /upload route, 10 req/min per IP
```

The WARBOSS will author the entropy out of your task, pick a rung from the
ladder, dispatch the `doer` at that model, and judge the result against a verify
command (your tests / typecheck). It only escalates back to you for forks it
can't decide from the code or spec.

**3. (Optional) Tune the ladder.** The ladder lives in `tiers.json` inside the
installed plugin. Each entry is a rung, ordered cheapest → most capable; **N
models = N rungs.** Edit a rung's `model` to pin it (alias `haiku|sonnet|opus`,
or a full id like `claude-haiku-4-5-20251001`), or add/remove rungs to change the
ladder's shape. The highest rung is the WARBOSS itself (`orchestrator: true`) —
work that lands there is decomposed or escalated, never dispatched.

```jsonc
// tiers.json — default 3-rung ladder
"ladder": [
  { "rung": 1, "tier": "LOW",  "model": "haiku",  "dispatch": true  },  // near-zero entropy → cheapest
  { "rung": 2, "tier": "MID",  "model": "sonnet", "dispatch": true  },  // decided but subtle
  { "rung": 3, "tier": "HIGH", "model": "opus",   "dispatch": false }   // undecided → stays with you
]
```

The rule that governs it all: **tier follows a task's residual entropy, not its
size.** Only push to the cheapest rung what a literal machine could satisfy;
anything still open stays with the WARBOSS or escalates to you.

### B. Run the research harness — clone the repo

The harness is a Node ≥ 22 / TypeScript CLI + library. There is **no build
step** — `tsx` runs `.ts` directly.

```sh
git clone https://github.com/SCoureFoure/warboss.git
cd warboss
npm install

npm run typecheck      # strict tsc --noEmit — run before declaring done
npm test               # full offline suite (node:test, ~294 tests) — no key needed
```

Everything above runs **offline with no API key.** To exercise the full stack or
the live experiments, add a key:

```sh
cp .env.example .env   # then add ANTHROPIC_API_KEY
npm run smoke          # end-to-end; dispatches ONE real grunt if a key is set, else offline-only
```

**Live experiment runners cost real money** and are owner-gated — they spend
against the API and write verdicts to [`reports/`](reports/). Run them only on
purpose: `npm run e1a | e1b | e2 | e3 | e4`, plus `npm run decompose` and
`npm run calibrate-gate | calibrate-derive`.

## Where it stands

The machine's organs are built and covered by **294 offline tests**: membrane
core, the retry loop, the readiness/convergence gate, a process-isolated sandbox,
the warboss decomposition pipeline, and the full kick-back loop (escalation →
owner answers → re-author). The falsification ladder E1→E2→E3→E4 has **run live
and closed** in the thesis's favor on the first task (`duration-parse`).

Current frontier (Leg 8): the kick-back loop's **production wiring** is built and
green offline; what remains are three small, owner-gated live runs — re-confirming
the live escalation→re-author drain, an E4 re-run that scores the decimal-hours
class, and **replicating E4 on a second task** (`parse-range`) to show the result
generalizes.

The repo runs spec-driven and eats its own cooking: every harness feature
deposits a durable spec in [`specs/`](specs/) plus a regression test (via the
[`/spec`](.claude/skills/spec/SKILL.md) loop), work moves between ranks only
through [HANDOFF.md](HANDOFF.md) frozen-spec work items, and every model call —
including our own build loop's — lands in a cost ledger.

## Repo map

| Where | What |
| --- | --- |
| [plugins/warboss-horde/](plugins/warboss-horde/) | The installable plugin: the `/delegate` doctrine, the `doer` subagent, and `tiers.json`. |
| [duh_plan.md](duh_plan.md) | Thesis, architecture, experiment design — the living plan. |
| [HANDOFF.md](HANDOFF.md) | The relay: planner writes work items down, implementer reports back. |
| [specs/](specs/) | Durable source of truth per harness feature, paired with tests. |
| [reports/](reports/) | Live-run verdicts (E1a, E1b, E2, E3, E4, gate calibrations). |
| [src/](src/) | The core layers — contract, sandbox, runner, cost ledger, agent, loop, gate, warboss, kickback. |
| [references/](references/) | The source ideas the machine is assembled from. |

---

*Status: lab — E1→E2→E3→E4 chain closed on task 1; multi-task replication next.
Duh Plan supersedes this README where they disagree.*
