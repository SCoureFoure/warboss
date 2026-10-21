# Slice: trim-delegate-skill (rung MID — subtle_invariant: must keep every rule while cutting words; graded by WARBOSS review, verify_kind visual)

Forks: [intent] goal is fewer prompt tokens with zero rule loss. [fiat] target size <= 55% of current characters.

Source (read only): `C:/Users/SCora/Documents/Repositories/warboss/plugins/warboss-horde/skills/delegate/SKILL.md`.
Write ONE new file: `C:/Users/SCora/Documents/Repositories/warboss/.warboss-horde/out/delegate-SKILL.trimmed.md`.
Do not edit the source.

## Must keep, verbatim
- The YAML frontmatter block exactly as it is.
- Every shell command and code block (paths, flags, JSON) character for character.
- Every step heading (`## Step 0 ...` through `## Step 7 ...`, `## The ops rule ...`, `## Context hygiene ...`,
  `## The one invariant`) — headings may be shortened only after the em dash.
- Every named term and enum value: rung, band, dispatch, orchestrator, match, runner, doer, verify_kind values
  (`test`, `visual`, `none`), the three conversion moves (research, prototype, groundwork), fog, `intent` / `fiat`,
  convergence probe, `tier_reason` values (`under_decided`, `subtle_invariant`), the four red causes (`test_wrong`,
  `under_decided`, `wrong_rung`, `worker_miss`), `.warboss-horde/slices/`, `.warboss-horde/out/`, `gate.on`,
  `WARBOSS_INLINE=1`, `WARBOSS_BASH_GATE`, `WARBOSS_METER_DOER_ONLY`, `// UNDECIDED:`, two-round retry bound, stall.

## Must keep, in meaning (may be reworded shorter)
Every MUST / never / only / always rule and every numbered decision rule. If a sentence states a rule, keep the rule.

## Cut
- Motivation and justification prose ("the bet", "why this matters", measured anecdotes) — keep at most one clause
  per section saying why.
- Repetition: a rule stated in two places stays in one (the more specific place).
- Filler, hedges, rhetorical framing.

## Acceptance (the WARBOSS checks)
1. Character count of the new file <= 55% of the source's.
2. Every item in "Must keep, verbatim" is present (grep-able).
3. A side-by-side read finds no dropped rule.

At the very end of your reply (not in the file), list each rule you merged or reworded heavily, one line each, so
the reviewer can check those first.
