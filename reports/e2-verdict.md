# E2 verdict — contract-authorship (human vs warboss), rev 1

> Run: 2026-06-12 · task `duration-parse` · LOW tier (haiku-4-5) grunt loop ·
> N=30 per source planned · `--granularity full`.
> Warboss source: `runs/decompose-20260612T132205Z.json` (live decompose,
> HIGH tier, **$0.1632**). Human source: `tasks/duration-parse/task.json`.
> **Outcome: criterion UNMEASURABLE as specced — contamination guard blocked
> scoring before any grunt session ran. Grinding cost $0.00.**

## What happened

`runE2` aborted at the pre-flight contamination audit
([e2.ts:328](../src/experiment/e2.ts#L328)), before the ledger/agent were
even constructed (line 336+), so **zero grinding dollars were spent** — only
the $0.1632 authoring decompose.

```
Error: Contamination in prompt[1]: hidden case "zero-seconds" input "0s" appears in prompt
```

`prompt[1]` is the **warboss** prompt. The warboss-authored contract carries
**34 examples (22 `throws`)** — exactly the dense error coverage the thesis
predicts. But that density collided with the held-out hidden battery:

| hidden case | input | warboss example that leaked it |
| --- | --- | --- |
| `zero-seconds` | `"0s"` | `zero-value` |
| `reversed-order` | `"30m1h"` | `reordered-segments` |
| `negative` (throws) | `"-1h"` | `error-leading-sign` |

**Human contract: 0 collisions** (5 hand-picked examples, disjoint from the
12-case battery by construction).

## Reading

This is a genuine finding, not a code defect. The contamination guard is
mandatory — it stops a grunt from being scored on inputs its own prompt
already contained (teaching-to-the-test inflation). The guard fired because
warboss authored densely and, having no knowledge of the held-out set,
re-derived three of its inputs verbatim.

So the E2 ≥0.90× criterion is **unmeasurable against a fixed battery that
warboss's authoring can overlap**. The sparse human contract never collides
*because* it is sparse — the very asymmetry E2 was built to test (dense error
authoring) is what trips the guard. The prediction (warboss `meanErrorScore`
>> human's null lifts hidden score past E1b's 0.750 plateau) was not falsified;
it was simply not reached.

The contract inspection still confirms the thesis mechanism qualitatively:
warboss authored 22 error-path examples (max-safe-integer overflow, non-string
inputs, fullwidth/Arabic-Indic digits, internal whitespace, stray chars,
unknown units, signs) for a function whose human contract pins **no** error
behavior at all.

## Spec gap → E2 rev 2

The held-out hidden battery must be **contamination-disjoint from any
contract a source may author**, not just from the two contracts shipped today.
Candidate rev-2 fixes (planner's call):

1. **Generate the hidden battery AFTER authoring**, excluding every input
   present in either source contract — then the guard can never fire on a
   legitimately-authored contract and the score is the real comparison.
2. Or treat a warboss-vs-hidden collision as a **scored event** (the grunt is
   credited 0 on the leaked case, not aborted) — but this changes the guard's
   meaning and risks masking real contamination; rejected unless 1 is
   infeasible.
3. The contamination audit itself is correct and stays.

Until rev 2, the ≥0.90× number is undefined. Authoring economics datum stands:
warboss authored a 34-example contract for **$0.1632** vs the human's
hand-written 5.

## Cost ledger

| Phase | Cost |
| --- | --- |
| Authoring (decompose, HIGH) | $0.1632 |
| Grinding (N×2 sessions, LOW) | $0.0000 (never dispatched) |
| **Total** | **$0.1632** |

> Procedural note: `--max-requirements 1` is a post-validation cap, NOT a
> prompt constraint ([warboss.ts:306](../src/warboss.ts#L306)) — the model
> first decomposed `parseDuration` into 6 sub-requirements and the run
> fail-closed rejected. A single requirement was obtained by adding a
> `--context` SCOPE CONSTRAINT instructing one atomic requirement. Decompose
> cannot be forced to a requirement count via the cap alone; the intent must
> be shaped. (decompose-run rev 2 candidate: surface `maxRequirements` into
> the decompose prompt.)
