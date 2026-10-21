# Slice: audit-idle (rung MID — subtle_invariant: extends the cost model; existing tests must keep passing)

Forks: [intent] the relay trigger is the observable idle gap (> 60 min between consecutive calls), not an observed
miss — a hook can see the gap, not the miss. [intent] a gap > 60 min means the 1-hour cache is gone, so the
idle-aware baseline rewrites the full prefix there. [fiat] the combined lever uses the session's own `best_seg_H`.

Root: `C:/Users/SCora/Documents/Repositories/warboss/plugins/warboss-horde/`. Edit ONLY `scripts/audit.mjs`.
Acceptance test: `test/audit.test.mjs` (do NOT edit). Every existing behaviour and export stays as is.

## 1. `simulate(calls, { segment, handoff, r, w, starts, rewrites })` — two new optional options
- `starts`: array of indices. Segment start set = { multiples of `segment` } ∪ `starts` (index 0 is always a start).
  Each start `a` re-seeds exactly like a multiple-of-segment start: `Q_j = max(B, P_j - P_a + B + (a > 0 ? handoff : 0))`
  for j from a up to the next start.
- `rewrites`: array of indices. At a rewrite index j that is NOT a start: `W_j = Q_j` (full write), Q unchanged.
  A rewrite index that is also a start changes nothing.
- Omitted options behave exactly as today. Indices outside `0..calls.length-1` are ignored.

## 2. New export `idleIndices(calls, minGapMs = 3600000)`
Indices k >= 1 where `calls[k].ts` and `calls[k-1].ts` are both finite numbers and `ts_k - ts_{k-1} > minGapMs`.

## 3. CLI additions (per session; all costs from `simulate` are divided by 1e6 for dollars as today)
Let `idle = idleIndices(calls)`, and r_eff / w_eff as today.
- `idle_gaps` = `idle.length`.
- `baseIdle = simulate(calls, { segment: Infinity, handoff: 0, r, w, rewrites: idle })`.
- `model_err = baseIdle / 1e6 / (usd_read + usd_write + usd_input) - 1` (empty field if the denominator is 0).
  This is the balance check: how well the modeled input-side cost matches the priced actual.
- For each H in [5000, 15000, 30000]:
  - `relay = simulate(calls, { segment: Infinity, handoff: H, r, w, starts: idle })`;
    `idle_saving_H = baseIdle > 0 ? 1 - relay / baseIdle : 0`; `idle_usd_H = (baseIdle - relay) / 1e6`.
  - `combo = simulate(calls, { segment: best_seg_H ?? Infinity, handoff: H, r, w, starts: idle })`;
    `combo_saving_H = baseIdle > 0 ? 1 - combo / baseIdle : 0`; `combo_usd_H = (baseIdle - combo) / 1e6`.
- CSV: append, after the existing columns and in this order: `model_err,idle_gaps`, then for each H:
  `idle_saving_H,idle_usd_H,combo_saving_H,combo_usd_H`. Same number formatting as today.

## 4. `summary.md` — append two sections (keep the whole file <= 80 lines)
`## Balance check (E0)`: median `model_err`, and pooled `sum(baseIdle)/1e6 / sum(usd_read+usd_write+usd_input) - 1`.
`## Idle relay (gap > 60 min)`: number of sessions with `idle_gaps >= 1`, total idle gaps; for each H: pooled
idle saving `sum(baseIdle - relay) / sum(baseIdle)` and total `idle_usd_H` dollars; pooled combo saving and total
`combo_usd_H` dollars. Dollar figures with 2 decimals, savings as percentages with 1 decimal.
