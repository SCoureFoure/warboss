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

Two rules make this more than flavor:

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
2. **E1a — does the contract collapse interpretation?** Run the same task many
   times with and without a frozen contract; measure how much the outputs fan
   out. The contract should crush the variance.
3. **E1b — does cheap + honest + retry beat one expensive shot?** Add the
   retry-against-the-membrane loop and settle the correctness-per-dollar bet
   head-to-head against a high-model one-shot.
4. **Warboss decomposition** — let the high model author the contracts, and prove
   it doesn't poison the membrane by under-specifying.
5. **Scale the horde** — fractal context + the Sergeant/Warchief layers, so many
   contracts can run at once with constant-size context per worker.

A question already pinned for the readiness gate: before dispatching work, ask
the cheap tier itself *"can you do this as specified?"* If it can, the task is
grunt-ready and needs no further decomposition; if it balks, that's the
under-specification signal. The model that does the work judges whether the work
is decided enough.

## Where it stands

Phase 1 is built and covered by tests. The repo runs spec-driven: every harness
feature deposits a durable spec in [`specs/`](specs/) plus a regression test, via
the [`/spec`](.claude/skills/spec/SKILL.md) loop.

```sh
npm install
cp .env.example .env   # add ANTHROPIC_API_KEY (only needed for live runs)

npm run typecheck      # strict tsc
npm test               # node:test — the membrane core, offline
npm run smoke          # full stack; dispatches one real grunt if a key is set
```

| Where | What |
| --- | --- |
| [duh_plan.md](duh_plan.md) | Thesis, architecture, experiment design — the living plan. |
| [HANDOFF.md](HANDOFF.md) | The relay: planner writes work items down, implementer reports back. |
| [specs/](specs/) | Durable source of truth per harness feature, paired with tests. |
| [src/](src/) | The core layers — contract, sandbox, runner, cost ledger, agent. |
| [references/](references/) | The source ideas the machine is assembled from. |

---

*Status: planning → lab. Greenfield. Duh Plan supersedes this README where they
disagree.*
