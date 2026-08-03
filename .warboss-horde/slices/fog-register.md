# Slice: fog-register (A)

## Files (touch ONLY these)
- `plugins/warboss-horde/skills/delegate/SKILL.md`
- `plugins/warboss-horde/test/delegate-doctrine.test.mjs` (new)

## Why (the measured motivation)

Board at authoring time: `decide:do = 10.34:1`, `5,194,246 decide-tok per green`,
13/13 green with **zero** reds. The horde does not fail at doing — it overspends
at deciding. Plan state currently lives only in the orchestrator transcript and
dies at compaction, so each session re-derives it. `STATE.md` is already named in
Context hygiene as an "e.g." with no shape; this slice gives it one and adds the
missing bucket: work you can see coming but cannot yet state as a slice.

**Additive only.** No existing rule is reversed. Step 1's cut criteria, Step 2's
tiering, Step 3's fiat policy are all untouched.

## Where fog lives (rev 2 — the correction)

Rev 1 put fog in a new `.warboss-horde/STATE.md` carrying `## Decisions`,
`## Fog`, `## Verdicts`. That was wrong three ways, and the review caught it:

1. **Two lifecycles in one file.** Decisions want to be durable and curated; fog
   is a working set that empties. Merged, neither rule can hold.
2. **A second plan-of-record.** `archive/HANDOFF.md` (+ `HANDOFF-archive.md`) is
   already the per-leg work item, archived on close. `## Decisions` duplicated
   it, and `## Verdicts` duplicated `verdicts.jsonl`.
3. **Born immortal.** Wayfinder's map is bounded by its *destination* — it dies
   when the effort lands. Rev 1 dropped the destination as low-ROI and kept the
   index, removing the only thing that ended the file. Append-only + read-every-
   session means the artifact meant to cut decide-band spend grows into it.

Rev 2: fog hangs off **the effort's work item**, inheriting a lifecycle instead
of inventing one. Stated by role, not by path — the plugin installs standalone,
so `archive/HANDOFF.md` cannot appear in the doctrine as a hardcoded location.

## Edit 1 — inside "## Step 1 — Cut the task into the smallest independent slices"

After the paragraph ending `never as the reason to skip this step.`, add ONE new
paragraph in the file's own voice (second person, bold key phrases) stating:

- Work surfaced while cutting that cannot yet be phrased as a slice is **fog**;
  register it, do not slice it.
- The gate, verbatim: `stateable, not answerable` — a question you can phrase
  precisely is a slice (even a blocked one); one you cannot is fog.
- Pre-slicing fog is what hands a doer a contract with a fork still in it.
- Fog is written to the `## Fog` section of `the work item that governs this
  effort` — whatever the repo opens per effort and archives on close (here, a
  `HANDOFF.md` item). It is a `working set, not a record`.
- Graduation evicts: when a fog line becomes a slice, `delete the line`.

## Edit 2 — inside "## Context hygiene (the multiplier on every future call)"

Extend the existing **Shed at phase boundaries** bullet — keep its current
sentence intact, append: the state file is an `index, not a store` (a line points
at the slice file or ledger row holding detail), and a state file that grows
without eviction stops being cheaper than re-deriving.

## Acceptance criteria (the checker greps for these)

1. Exact string `stateable, not answerable` present.
2. Exact string `## Fog` present.
3. Exact string `index, not a store` present.
4. Exact string `Pre-slicing fog` present.
5. Exact string `the work item that governs this effort` present.
6. Exact string `working set, not a record` present.
7. Exact string `delete the line` present.
8. **Absent**: `STATE.md` anywhere inside Step 1 (fog gets no standalone file),
   and `## Decisions` / `## Verdicts` anywhere in the file (no second
   plan-of-record, no duplicated verdict store). The pre-existing Context-hygiene
   mention of a state file is a resident this slice does not evict.
9. The file's `## ` heading list is byte-identical, in order, to the 12 headings
   present before the edit — none added, removed, reordered, or reworded.

## Anti-misreading case (this fails the slice)

Adding a **new `## ` step** for fog (e.g. `## Step 1.5 — Fog`) is the wrong
reading and fails AC9. Fog is not a new phase in the loop — it is a bucket inside
cutting plus a section on a work item that already existed. The slice is additive
to two existing sections, not a new rung of the ladder.

Second wrong reading: making fog *block* dispatch. Nothing here gates Step 4.
Registering fog changes what survives compaction, not what may be dispatched.

Third wrong reading (the one rev 1 committed): giving fog its own durable file.
Any new append-only artifact that is read every session fails AC8 — it recreates
the immortal-index problem regardless of what it is named.

## Error/edge behavior

If either anchor (`never as the reason to skip this step.` / the
**Shed at phase boundaries** bullet) is not found verbatim, do not guess a
location — report the mismatch as an UNDECIDED gap and stop.
