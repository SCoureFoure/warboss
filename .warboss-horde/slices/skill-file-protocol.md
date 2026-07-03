# Slice: skill-file-protocol

## Files (touch ONLY this file)
`C:\Users\SCora\Documents\Repositories\warboss\plugins\warboss-horde\skills\delegate\SKILL.md`

## Edit 1 — inside "## Step 3 — Author the entropy out (the expensive, non-delegable part)"

After the paragraph ending `that output is the membrane it must satisfy blind.`, add one new paragraph that states, in the file's own voice (second person, bold key phrases):

- Write each contract to its own file: `.warboss-horde/slices/<slice>.md` — one file per slice, the full contract in the file.
- The reason, which MUST include the exact phrase `enters your transcript once`: the contract text lands in the parent transcript only when the file is written — not again on every dispatch, and not again on every retry.

## Edit 2 — inside "## Step 4 — Dispatch at the chosen model"

After the paragraph ending `keep slices independent so they run in parallel.`, add one new paragraph that states:

- The dispatch prompt is a pointer, not the contract. It MUST include this example prompt verbatim (as inline code): `Read the contract at .warboss-horde/slices/<slice>.md and implement it.`
- It MUST include the exact sentence: `Hand the doer the path, not the text.`
- Retries reuse the same file: a round-2 prompt is the same contract path plus the failure file path from the runner — consistent with Step 6, which already says failure output travels by path.

## Acceptance criteria (a checker will grep for these)

1. `.warboss-horde/slices/<slice>.md` appears at least twice (once per edit).
2. Exact string `enters your transcript once` present.
3. Exact string `Hand the doer the path, not the text.` present.
4. Exact string `Read the contract at .warboss-horde/slices/<slice>.md and implement it.` present.
5. No `## ` heading added, removed, or reworded. No line outside the two new paragraphs changed.

## Anti-misreading case (this fails the slice)

If the added text instructs pasting the contract inline *in addition to* writing the file, that is the wrong reading. The text must say the dispatch prompt carries the path INSTEAD of the contract text — that is what criterion 3 pins.

## Error/edge behavior

If either anchor paragraph (the two "ending with" sentences above) cannot be found verbatim, do not guess a location — report the mismatch as an UNDECIDED gap and stop.
