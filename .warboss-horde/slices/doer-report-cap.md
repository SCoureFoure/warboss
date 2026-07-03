# Slice: doer-report-cap

## Files (touch ONLY this file)
`C:\Users\SCora\Documents\Repositories\warboss\plugins\warboss-horde\agents\doer.md`

## Edit — the "## Output" section only

Keep the existing intro line and bullet list exactly as they are. After the bullet list (before the final `No essays.` paragraph), add one short paragraph stating:

- The final report is **at most 10 lines** — the exact string `at most 10 lines` MUST appear.
- The reason MUST appear: the report lands in the parent transcript and is re-read on every later orchestrator call.
- If the detail will not fit (a long UNDECIDED list, a decomposition, caveats), write the detail to `.warboss-horde/reports/<slice>.md` and put that path in the report instead of inlining the detail. The literal path pattern `.warboss-horde/reports/<slice>.md` MUST appear.
- The cap applies to the final message only — files you write may be as detailed as needed. This sentence (or an equivalent stating cap ≠ file detail) MUST appear.

## Acceptance criteria (a checker will grep for these)

1. Exact string `at most 10 lines` present.
2. Exact string `.warboss-horde/reports/<slice>.md` present.
3. Frontmatter untouched — the line `tools: Read, Write, Edit, Glob, Grep` and the line `model: inherit` are byte-identical to before.
4. The `## Dogma` section is byte-identical to before.
5. `No essays.` paragraph still present, still last.

## Anti-misreading case (this fails the slice)

Reading the cap as applying to files the doer writes (i.e. telling it to truncate report files to 10 lines) is wrong — criterion 4 of the edit list kills it: files may be as detailed as needed; only the returned message is capped.

## Error/edge behavior

If the "## Output" section or the `No essays.` paragraph is not found verbatim, report the mismatch as an UNDECIDED gap and stop — do not pick another location.
