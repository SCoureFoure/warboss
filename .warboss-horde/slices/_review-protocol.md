# Review protocol (shared by every `review-*` slice)

This is a **research** slice. You gather facts; you do not fix anything.

## Hard rules

- Write exactly ONE file: the `output` path named in your slice contract. Create or overwrite it.
- Change NO other file in the repository. No edits to `src/`, `test/`, `specs/`, `plugins/`, docs.
- Read only the files in your slice's `scope` (plus any file a scoped file imports, when needed to confirm a claim).
- Every finding MUST cite a real `path:line` you actually read and quote the offending text verbatim (≤ 3 lines).
  A finding you cannot quote is not a finding — drop it.
- Do not report style, formatting, naming taste, or "could add more comments".
- Do not report something as a bug if a test in `test/` or a spec in `specs/` shows the behavior is intended;
  check before claiming.
- If you are unsure whether something is a defect or intended, list it under `## Open questions`, not `## Findings`.

## Output file format

```markdown
# <slice name>

## Findings

### F1 — <one-line claim>
- where: `path:line`
- severity: high | medium | low
- kind: bug | invariant | fail-open | drift | dead-code | cost | test-gap
- evidence: "<verbatim quote>"
- why: <one or two sentences: the concrete input or state that produces the wrong result>
- fix: <one or two sentences: the smallest change>
- check: <the test that would fail before the fix and pass after; or `none` if no pass/fail check is possible>

### F2 — ...

## Open questions
- `path:line` — <question>

## Files read
- <path>
```

- Order findings by severity, high first. At most 12 findings. Fewer real findings beat more weak ones.
- Severity `high` = wrong result, broken invariant, or silently corrupted metric. `medium` = wrong only on an
  edge input, or a gap that hides a future defect. `low` = dead code, stale text, minor waste.
- If you find nothing, write `## Findings` followed by `None.` — that is a valid result.

## Your final reply

At most 5 lines: the output path, the count of findings per severity, and the single most important finding's title.
Do not restate the findings.
