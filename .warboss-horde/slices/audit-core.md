# Slice: audit-core (rung MID — subtle_invariant: counterfactual cost model must match the test arithmetic exactly)

Forks: [fiat] miss threshold = cache_creation > 0.5 x prefix (strictly greater). [fiat] restart model re-seeds the
prefix at B + handoff and keeps the session's own later growth (compaction drops included). [intent] parent
transcripts only (no subagent files) this round. [intent] dollar weights come from tiers.json via pricing.mjs.

Root: `C:/Users/SCora/Documents/Repositories/warboss/plugins/warboss-horde/`. ESM `.mjs`, 2-space indent, single
quotes, terse comments, same style as `scripts/pricing.mjs`. Node built-ins only.
Acceptance test: `test/audit.test.mjs` — do NOT edit it. Do not edit tiers.json or other tests.

## 1. `scripts/pricing.mjs`: add and use `ratesFor`
Add `export function ratesFor(price, usage)`: `price` not an object -> `null`. Compute
`prompt = input_tokens + cache_read_input_tokens + cache_creation_input_tokens` (missing -> 0). If `price.above` is
an object and `prompt > price.above.prompt_tokens` return `{ ...price, ...price.above }`, else return `price`.
Refactor `messageUsd` to call `ratesFor` (behaviour unchanged; `test/pricing.test.mjs` must still pass).

## 2. New `scripts/audit.mjs` — named exports + CLI
Header comment: one paragraph saying it is the offline transcript audit (E1 restart counterfactual, E3 cache-miss
classification) and how to run it.

`loadCalls(text)` -> array of calls. Parse each line (`/\r?\n/`) with try/catch, skip bad lines. Use
`msg = rec.message`; keep only `msg.role === 'assistant'` with an object `msg.usage` and a model not starting with
`<`. Key = `msg.id || rec.uuid`. Order = first appearance of the key. Usage = the LAST line's usage for that key;
`ts` = `Date.parse(rec.timestamp)` of the FIRST line for that key (`null` if not a finite number).
Each call: `{ id, ts, model, input, output, read, create, create1h, P, usage }` where
`input=usage.input_tokens`, `output=usage.output_tokens`, `read=usage.cache_read_input_tokens`,
`create=usage.cache_creation_input_tokens`, `create1h=usage.cache_creation?.ephemeral_1h_input_tokens` (missing -> 0),
`P = input + read + create`, `usage` = the raw usage object.

`fitLine(ys)` -> `{ slope, r2 }`, least squares of ys on x = 0..n-1. n < 2 -> `{ slope: 0, r2: 0 }`. If ys has zero
variance, r2 = 0 (slope as computed, i.e. 0).

`simulate(calls, { segment, handoff, r, w })` -> modeled input-side cost (output tokens excluded).
Let `B = calls[0].P`. Segments start at indices 0, segment, 2*segment, ... (`segment = Infinity` -> one segment).
For call j in the segment starting at a: `Q_j = max(B, calls[j].P - calls[a].P + B + (a > 0 ? handoff : 0))`.
Write tokens: at j = a, `W_j = Q_a`; for j > a, `W_j = max(0, Q_j - Q_{j-1})`.
Cost = sum over j of `r * (Q_j - W_j) + w * W_j`. Empty calls -> 0.

`optimum(calls, { handoff, r, w })` -> `{ nStar, bestSegment, bestCost, baseCost, saving }`.
`g = fitLine(calls.map(c => c.P)).slope`; `nStar = g > 0 ? Math.sqrt(2 * (w / r) * (B + handoff) / g) : null`.
`baseCost = simulate(..., segment: Infinity)`. Brute force every integer segment 2..calls.length;
`bestSegment` = argmin (ties -> smallest), `bestCost` its cost. If calls.length < 2: bestSegment = null,
bestCost = baseCost. `saving = baseCost > 0 ? 1 - bestCost / baseCost : 0`.

`classifyMisses(calls)` -> array of `{ k, gapMs, bucket, create }` for every k >= 1 with
`calls[k].create > 0.5 * calls[k].P`. `gapMs = ts_k - ts_{k-1}` when both are numbers, else `null`.
bucket: null -> `'unknown'`; `< 5 min` -> `'<5m'`; `<= 60 min` -> `'5-60m'`; else `'>60m'`.

## 3. CLI (runs only when the file is executed directly: compare `process.argv[1]` resolved to this file's path)
Args: `--root <dir>` (default `path.join(os.homedir(), '.claude', 'projects')`), `--out <dir>` (default
`.warboss-horde/out/audit` under `process.cwd()`), `--min-calls <n>` (default 20).
Files: every `*.jsonl` that sits directly inside a directory that sits directly inside root (`root/<proj>/<x>.jsonl`).
Nothing deeper (so `subagents/` files are excluded). For each: `calls = loadCalls(text)`; skip if
`calls.length < minCalls`. `model` = most frequent call model (ties -> first seen). `price = priceForModel(tiers.pricing, model)`
(tiers.json next to the script's parent dir: `../tiers.json`); skip the session if null (count it as `skipped_unpriced`).
Per session, class dollars: for each call, `rt = ratesFor(price, call.usage)`;
`usd_read += read*rt.cache_read/1e6`, `usd_write += ((create-create1h)*rt.cache_write + create1h*rt.cache_write_1h)/1e6`,
`usd_input += input*rt.input/1e6`, `usd_output += output*rt.output/1e6`; `usd_total` = sum.
Effective rates: `r_eff = usd_read*1e6 / sum(read)` (if sum(read) = 0 use `price.cache_read`),
`w_eff = usd_write*1e6 / sum(create)` (if 0 use `price.cache_write`). These r/w feed `optimum`/`simulate`
(units: the result is then in dollars x 1e6 / 1e6 — i.e. divide simulate's output by 1e6 to get dollars, since
r and w are $/MTok and P is tokens). Misses: `miss_count`, and per bucket `miss_usd_<b> = sum (w_eff - r_eff) * create / 1e6`
with column names `miss_usd_lt5m`, `miss_usd_5to60m`, `miss_usd_gt60m`, `miss_usd_unknown`.
For handoff H in [5000, 15000, 30000]: columns `nstar_H`, `best_seg_H`, `saving_H` from `optimum`.

Write `<out>/sessions.csv` (mkdir -p): header then one row per analysed session, comma-separated, no quoting
(replace any comma in `file` with `;`). Columns in order: `file,model,n,B,Pmax,g,r2,usd_read,usd_write,usd_input,
usd_output,usd_total,r_eff,w_eff,miss_count,miss_usd_lt5m,miss_usd_5to60m,miss_usd_gt60m,miss_usd_unknown`, then for
each H: `nstar_H,best_seg_H,saving_H`. `file` = path relative to root with `/` separators. Numbers: integers as-is,
others `toFixed(4)`; null -> empty field.

Write `<out>/summary.md`, at most 60 lines: sessions analysed / skipped_short / skipped_unpriced; total dollars by
class with % of total; medians of n, B, g, r2; for each H: median nstar, median best_seg, median saving, and pooled
saving `1 - sum(bestCost)/sum(baseCost)`; the same median saving for sessions with n >= 60; total miss dollars per
bucket and as % of total dollars. Print the summary path to stdout. Exit 0.
