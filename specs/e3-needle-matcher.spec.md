# Spec — E3 needle matcher rev 2 (kill the substring false positive in author-side attribution)

> Status: active · rev 1 · Feature: e3-needle-matcher · Added: 2026-06-13 · Maps to: E3 rev-2 (`archive/reports/e3-verdict.md` candidate #5 + §"Author arm").
> Source of truth for the E3 attribution defect the verdict found and proved.
> `evaluateE3Criterion`'s `surfacedByAuthor` is a case-insensitive SUBSTRING
> match over `E3_NEEDLES`. The decimal needle `"decimal"` substring-matched an
> UNRELATED intent-undecided escalation — *"Whether non-ASCII **decimal** digits
> like Unicode numeral characters are accepted"* (about digit base, not
> fractional hours) — and falsely credited the author arm with surfacing
> `"1.5h"`. The PASS survived (decimal is genuinely caught by the probe), but
> the **attribution did not**: an author-only configuration would have been
> *masked* by this false positive. This spec tightens the needle lists to
> specific phrases / input literals, audits all three lists for the same
> collision class, and re-scores the recorded E3 escalations so decimal's author
> credit correctly flips to `false`.
> Depends on: `specs/e3-intent-divergence.spec.md` (the evaluator and needle
> lists this revises — it is that spec's rev-2 needle amendment).

## Requirement

`E3_NEEDLES` is replaced with tightened lists: every needle is either (a) the
literal contested INPUT substring (`"120"`, `"1.5"`, `" 1h 30m "`) or (b) a
multi-word phrase that names the contested behavior unambiguously. No needle may
be a single generic token that also names a DIFFERENT ambiguity class (`"decimal"`
collides with digit-base; `"space"` collides with "namespace"; `"leading"` /
`"trailing"` collide with "leading zero"). `surfacedByAuthor` remains a
case-insensitive substring test, now safe because the needles are specific. The
criterion logic, candidate inputs, and probe side are unchanged. A regression
test re-scores the actual recorded E3 escalations and asserts decimal's author
credit is now `false`, while bare-number and whitespace stay `true`.

## Constraints (inherited)

- **Fail-up / never chase a PASS.** Tightening needles only narrows what counts
  as an author catch; it can only make the criterion HARDER to pass. Recall over
  precision is relaxed *toward precision* deliberately, and the verdict still
  overrules a needle miss IN PROSE, never in the computed criterion (unchanged
  rule from e3 rev 1).
- **Cost-metered / offline.** No model call; pure evaluator change.

## Decisions (pinned 2026-06-13)

### Tightened needle lists (pre-registered, replace e3 rev 1's)

```ts
const E3_NEEDLES: Record<string, readonly string[]> = {
  "bare-number": [
    "120",            // the contested input literal
    "bare number", "bare numeric",
    "unitless", "unit-less", "no unit", "without unit", "missing unit",
    "digits only", "number only", "numeric only", "number without a unit",
  ],
  "whitespace": [
    " 1h 30m ",       // the contested input literal (with its padding)
    "whitespace", "white space",
    "leading space", "trailing space", "surrounding space", "surrounding whitespace",
    "padded", "padding", "trim", "trimmed",
  ],
  "decimal": [
    "1.5",            // the contested input literal
    "fractional", "fraction of", "decimal point", "decimal hour",
    "non-integer", "non integer", "floating point", "fractional hour",
  ],
};
```

- **Dropped (collision class, per the verdict):** bare `"decimal"` (matched
  "non-ASCII decimal digits" — digit base, not fractional); bare `"space"`
  (matches "namespace"); bare `"leading"` / `"trailing"` (match "leading zero",
  a separate ambiguity); bare `"bare"` (too generic); bare `"float"` (kept only
  as `"floating point"`); `"fraction"` narrowed to `"fraction of"` / `"fractional"`
  (bare `"fraction"` is fine on-topic but `"fractional"` already covers it —
  keeping the specific forms). Each drop is justified by a concrete colliding
  escalation phrase, recorded here so the choice is auditable.
- The input literals (`"120"`, `" 1h 30m "`, `"1.5"`) guarantee a catch whenever
  an escalation quotes the contested input verbatim — the strongest, least
  ambiguous signal.

### Matcher (unchanged shape, now safe)

`surfacedByAuthor` stays: lowercase each escalation, lowercase each needle,
`includes`. With phrase/literal needles the substring test no longer
cross-contaminates ambiguity classes. (A word-boundary regex was considered and
rejected: the input literals `" 1h 30m "` and `"1.5"` contain spaces/dots that
make `\b` brittle; specific phrases are simpler and sufficient.)

### Re-scoring the recorded run (regression anchor)

The existing run `runs/e3-20260613T191532Z.json` recorded the escalations. The
rev-2 evaluator, applied to those exact escalation strings, MUST yield:

- `bare-number`: `surfacedByAuthor: true` (fiat escalation #4 contains
  `"bare"`→ now `"bare number"`/`"no unit"`; assert the recorded text still
  matches a tightened needle — if the recorded phrasing was only bare `"bare"`,
  the literal `"120"` or `"no unit"` must carry it; the test pins the actual
  recorded string).
- `whitespace`: `surfacedByAuthor: true` (escalation #5 contains `"whitespace"`).
- `decimal`: `surfacedByAuthor: false` (the only prior match was bare
  `"decimal"` in the Unicode-digits escalation, now dropped — no tightened
  decimal needle appears in any recorded escalation).

The criterion PASS/FAIL over the recorded run is recomputed for the verdict
addendum: with decimal author-credit removed, the two arms' genuine catches are
disjoint (author 2, probe 1) and the OR still covers 3/3 → PASS stands, now with
honest attribution.

### Other needle lists — audit result (pinned)

The audit of all three lists is the dropped-needle analysis above; no further
list exists in `e3.ts`. If a future task adds a known set, its needle list
inherits the same rule: literals + unambiguous phrases only, no generic token
that names another ambiguity class.

### Scope fence

Does NOT change candidate inputs, the probe arm, `decidedRate`, the criterion
boolean logic, or the artifact shape. `E3_NEEDLES` value and (if the recorded
phrasing requires) one regression assertion are the whole change.

## Acceptance criteria (Given / When / Then)

1. **AC1 — decimal false positive killed.** Escalations
   `["x: intent-undecided — whether non-ASCII decimal digits are accepted"]`
   (no other entry) → `evaluateE3Criterion(escalations, viableProbe)` marks
   `decimal` `surfacedByAuthor: false` (the dropped bare `"decimal"` no longer
   matches). With the SAME escalation under e3 rev 1 the result would have been
   `true` — assert the new value is `false`.
2. **AC2 — genuine decimal catch still works.** An escalation containing
   `"fractional hours are not pinned"` or the literal `"1.5"` → `decimal`
   `surfacedByAuthor: true`.
3. **AC3 — bare-number & whitespace unaffected.** Escalations
   `"…bare number with no unit…"` → `bare-number` true; `"…leading/trailing
   whitespace…"` → `whitespace` true (via `"whitespace"`); but an escalation
   about `"leading zeros"` with no whitespace term → `whitespace` `false`
   (the dropped bare `"leading"` no longer false-positives).
4. **AC4 — recorded-run regression.** Loading the escalations recorded in
   `runs/e3-20260613T191532Z.json` and re-running `evaluateE3Criterion` yields
   `bare-number` author `true`, `whitespace` author `true`, `decimal` author
   `false`; overall `pass: true` (3/3 by OR with the recorded probe split on
   `"1.5h"`). (Test reads the committed artifact; if the artifact is not present
   in CI, pin the recorded escalation strings as a fixture and note the source.)
5. **AC5 — needle hygiene invariant.** Every needle in `E3_NEEDLES` is either a
   contested input literal (`"120"`, `" 1h 30m "`, `"1.5"`) or contains a space /
   hyphen (a multi-word phrase) — assert no single bare generic token remains
   (grep/programmatic check over the lists).

## Verifies-with

- Tests: `test/e3.test.ts` — AC1–AC5, offline (extends the existing
  `evaluateE3Criterion` unit cases). No model call.
- Integration: none of its own; the corrected attribution is applied to the next
  live E3 re-run and recorded in `archive/reports/e3-verdict.md` as a rev-2 addendum
  (decimal now honestly probe-only).
- Falsifies / experiment link: n/a (evaluator-precision fix). It makes
  `surfacedByAuthor` trustworthy so the disjoint-arms claim (author 2 / probe 1,
  no overlap) rests on a matcher that cannot spuriously credit the author arm —
  the precondition for ever shipping an author-only configuration.
