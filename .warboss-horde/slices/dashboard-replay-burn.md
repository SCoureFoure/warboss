# Slice: dashboard-replay-burn

## Files (touch ONLY this file)
`C:\Users\SCora\Documents\Repositories\warboss\plugins\warboss-horde\scripts\dashboard.mjs`

## Goal

A new card on the dashboard: **replay burn — orchestrator context growth**. It
makes the dominant cost term (the orchestrator transcript re-read on every call)
visible as a chart instead of an autopsy.

## Data model (read this carefully — it inverts the file's usual habit)

Ledger rows with `agent_type === 'warboss-orchestrator'` are **cumulative
snapshots**: the Stop meter appends one row per turn under the SAME `agent_id`
(and model). Everywhere else in the codebase these snapshots are DEDUPED to the
last row per (agent_id, model). **For this chart you must NOT dedup** — the
snapshot sequence IS the series. Group orchestrator rows by `(agent_id, model)`,
sort each group by `ts` ascending. Each group = one session series.

- x = snapshot index (turn number within the session).
- y = `cache_read` (the cumulative cache-read tokens field on the row). NOT
  `tokens`, NOT `est_usd`.
- per-turn delta (the "burn") = `y[i] - y[i-1]`, first delta = `y[0]`.

## Implementation

1. New function `burnChart(sessions)` modeled on the existing `costChart`
   (same SVG conventions: viewBox, pad, width 100%, polyline). One polyline per
   session series (cumulative `cache_read` vs snapshot index). Reuse the file's
   existing color variables/palette; `esc()` and `num()` for text.
2. Under the chart a one-line `<div class="sub">` legend: the latest session's
   last snapshot value (formatted with `num()`) and its average per-turn delta.
3. Wire it in `render()` as a new `card('replay burn — orchestrator context growth', ...)`
   placed immediately after the `'cumulative spend over time'` card.
4. Plumb the data minimally: extend `aggregate()` (or however rows already reach
   `render()`) to carry the orchestrator snapshot series — smallest change that
   fits the file's existing flow.
5. Empty state: if there are no orchestrator rows, or no session has ≥2
   snapshots, render `<p class="muted">No orchestrator snapshots yet — run with the Stop meter wired.</p>`
   inside the card (same pattern as `costChart`'s not-enough-points message).

## Acceptance criteria

1. `node --check plugins/warboss-horde/scripts/dashboard.mjs` exits 0.
2. Running the dashboard over a ledger that has ≥2 orchestrator snapshot rows
   for one `agent_id` produces HTML containing the exact string `replay burn`
   and a `<polyline` with ≥2 points inside that card.
3. With zero orchestrator rows, the card still renders, with the muted
   empty-state text — the script must not throw.
4. No existing card, function, or output is removed or renamed; the script
   still exits 0 over the repo's real ledger.

## Anti-misreading case (this fails the slice)

If you collapse snapshots to the last row per (agent_id, model) — the way the
summary/aggregate logic does — every session flattens to a single point and no
`<polyline` with ≥2 points can exist, failing criterion 2. The dedup habit is
the wrong reading here.

## Error/edge behavior

- Rows missing `cache_read` → treat as 0, keep the point.
- A single session with 1 snapshot among others with ≥2 → skip the 1-point
  session, chart the rest.
