# Slice: none-conversion-routes (B)

## Files (touch ONLY these)
- `plugins/warboss-horde/skills/delegate/SKILL.md`
- `plugins/warboss-horde/test/delegate-doctrine.test.mjs` (new, shared with slice A)

## Why (the measured motivation)

Board at authoring time: LOW is **41% of doer dispatches but 2% of tokens** —
the cheap rung gets crumbs — while `decide:do` runs `10.34:1`. Step 0.5 currently
ends the `none` bucket with "handle inline, or escalate." *Handle inline* is
decide-band spend by instruction: the most expensive band absorbs exactly the
work that has no membrane. This slice adds the moves that **convert** a `none`
slice into a judgeable one so it can leave the decide band.

**Additive only.** The rule "do not pretend-delegate a `none` slice" is preserved
verbatim — you never delegate a `none`; you convert it first, then re-classify.

## Edit 1 — inside "## Step 0.5 — Is there a membrane? (classify each slice's verify_kind)"

After the `none` bullet (the one ending `A dispatch with no membrane is an
authoring defect.`) and BEFORE the paragraph beginning `Only \`test\` (and
\`visual\`, with you as judge) slices proceed.`, insert one lead-in paragraph plus
a three-item bulleted list plus one closing paragraph, stating:

- Lead-in: `none` is never a terminal state — it is a slice with no membrane
  *yet*. Absorbing it into your own context is decide-band spend, the most
  expensive band on the board. Three moves convert it; run the move, then
  `re-classify the slice` as `test` or `visual` and continue at Step 1.
- **research** — blocker is a fact outside the working directory. Dispatch a
  `doer` at the cheapest rung, findings written **only** under
  `.warboss-horde/out/` — no repo change, nothing to grade, no membrane bypassed.
  You judge the fact; it feeds Step 3 authoring.
- **prototype** — blocker is "how should it look / behave." Cheapest rung builds
  a rough throwaway to react to. Membrane is `visual`: you inspect it, you do not
  merge it.
- **groundwork** — blocker is work that must simply happen first (provision
  access, move data, capture a trace). Decided commands to the `runner`, decided
  edits to a `doer`. Nothing is decided here; it earns its place by unblocking a
  decision.
- Closing: if none of the three applies, it is a genuine judgement call —
  escalate to the user (the one invariant). What you must not do is quietly keep it.

## Acceptance criteria (the checker greps for these)

1. Exact string `` `none` is never a terminal state `` present.
2. Exact string `re-classify the slice` present.
3. All three route names present as bold list items: `**research**`,
   `**prototype**`, `**groundwork**`.
4. Exact string `.warboss-horde/out/` present in the research bullet.
5. The pre-existing sentence `A dispatch with no membrane is an authoring
   defect.` is still present, unmodified.
6. The pre-existing sentence beginning `Only \`test\` (and \`visual\`, with you as
   judge) slices proceed.` is still present, unmodified, and still appears AFTER
   the inserted block.
7. The file's `## ` heading list is byte-identical, in order, to the 12 headings
   present before the edit.

## Anti-misreading case (this fails the slice)

Wrong reading #1: treating the three routes as permission to **dispatch a `none`
slice directly** ("research is a doer dispatch, so `none` is delegable after
all"). AC5 pins the opposite — the routes produce a membrane; they do not waive
one. A research dispatch is allowed *because it changes no repo file and is
therefore not being graded*, which is why AC4 pins the `.warboss-horde/out/`
confinement.

Wrong reading #2: replacing "handle inline, or escalate" with the routes.
Escalation stays as the terminal move for a genuine judgement call — the closing
paragraph must preserve it.

## Error/edge behavior

If the anchor sentences in Edit 1 are not found verbatim, do not guess a
location — report the mismatch as an UNDECIDED gap and stop.
