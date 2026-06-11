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

## The horde (and why the hierarchy exists)

The roles borrow orc lore, but the structure is doing real work.

```text
GOD (you) ─▶ WARBOSS ─▶ WARCHIEF ─▶ SERGEANT ─▶ GRUNT
```

- **You are God.** You speak only to your chosen champions — never to the horde.
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

## Broad strokes to get there

Build order is **falsify-first** — the earliest, cheapest experiments are the
ones most able to kill the thesis. Full detail in [duh_plan.md](duh_plan.md).

1. **Membrane primitive** *(done)* — a contract that freezes by content hash and
   a runner that refuses to execute against anything but its registered hash.
   Plus the cheap-model worker layer and a cost ledger on every call.
2. **E1a — does the contract collapse interpretation?** *(run live — settled.)*
   Same task, many runs, with and without a frozen contract. The contract
   crushed the fan-out: modal agreement 0.97 with the contract vs 0.60 without
   (E1a-r2, N=30×4, $0.59). Bonus finding: without a contract, 18/30 cheap-model
   outputs weren't even viable implementations.
3. **E1b — does cheap + honest + retry beat one expensive shot?** *(harness
   built on the product loop; live dispatch is a spend decision.)* The
   retry-against-the-membrane loop now lives in `src/loop.ts` as durable
   infrastructure — generate → judge → retry until green, stall, or budget,
   every attempt metered.
4. **Warboss decomposition** *(built offline; first live run pending)* — the
   high model authors the contracts (`src/warboss.ts`: decompose → mechanical
   validation → self-audit → one amend → freeze), with an error-coverage
   mandate enforced mechanically so it can't poison the membrane by
   under-specifying. Hardened process sandbox (`node --permission`, vm-in-child)
   is in place for when tasks gain I/O.
5. **Scale the horde** — fractal context + the Sergeant/Warchief layers, so many
   contracts can run at once with constant-size context per worker.

The readiness-gate idea is now built (`src/gate.ts`): before dispatching work,
ask the cheap tier itself *"can you do this as specified?"* — a one-call
READY/NOT-READY judge that fails closed, backstopped by a convergence probe
(K independent generations; if survivors don't agree on held-out cases, the
contract isn't decided enough). The model that does the work judges whether
the work is decided enough; admission (`admit`) wires both in front of the
horde. Calibration against live data is pending.

## Where it stands

The machine's organs are built and covered by 133 offline tests: membrane core,
retry loop, readiness gate, process sandbox, and the warboss decomposition
pipeline. E1a ran live and settled rung 1 of the thesis (the contract collapses
interpretation). Three live spends are queued behind a God decision: the E1b
economics run, gate calibration, and the first live decomposition.

The repo runs spec-driven and eats its own cooking: every harness feature
deposits a durable spec in [`specs/`](specs/) plus a regression test (via the
[`/spec`](.claude/skills/spec/SKILL.md) loop), work moves between ranks only
through [HANDOFF.md](HANDOFF.md) frozen-spec work items, and every model call —
including our own build loop's — lands in a cost ledger.

```sh
npm install
cp .env.example .env   # add ANTHROPIC_API_KEY (only needed for live runs)

npm run typecheck      # strict tsc
npm test               # node:test — the whole machine, offline (133 tests)
npm run smoke          # full stack; dispatches one real grunt if a key is set
```

| Where | What |
| --- | --- |
| [duh_plan.md](duh_plan.md) | Thesis, architecture, experiment design — the living plan. |
| [HANDOFF.md](HANDOFF.md) | The relay: planner writes work items down, implementer reports back. |
| [specs/](specs/) | Durable source of truth per harness feature, paired with tests. |
| [src/](src/) | The core layers — contract, sandbox, runner, cost ledger, agent, loop, gate, warboss. |
| [references/](references/) | The source ideas the machine is assembled from. |

---

*Status: lab — rung 1 settled, economics rung next. Duh Plan supersedes this
README where they disagree.*
