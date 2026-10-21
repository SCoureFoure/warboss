# Slice: price-table (rung LOW)

Forks: none (all values transcribed from the Anthropic price sheet fetched 2026-10-21).

## File to edit
`C:/Users/SCora/Documents/Repositories/warboss/plugins/warboss-horde/tiers.json` — replace ONLY the value of the
top-level `"pricing"` object. Do not touch `prices`, `ladder`, `doer`, `runner`, or the top-level `$comment`.
Keep the file valid JSON, 2-space indent, one model entry per line as in the current file.

## New `"pricing"` object, exactly these keys in this order
Every entry has exactly these fields: `input, output, cache_read, cache_write, cache_write_1h` ($/MTok).
`cache_write` is the 5-minute cache write.

| key | input | output | cache_read | cache_write | cache_write_1h |
|---|---|---|---|---|---|
| fable-5-1 | 10 | 50 | 0.25 | 12.5 | 20 |
| fable-5 | 10 | 50 | 1 | 12.5 | 20 |
| mythos-5-1 | 10 | 50 | 0.25 | 12.5 | 20 |
| mythos-5 | 10 | 50 | 1 | 12.5 | 20 |
| opus-5-5 | 4 | 20 | 0.2 | 5 | 8 |
| opus-5 | 5 | 25 | 0.5 | 6.25 | 10 |
| opus-4-8 | 5 | 25 | 0.5 | 6.25 | 10 |
| opus-4-7 | 5 | 25 | 0.5 | 6.25 | 10 |
| opus-4-6 | 5 | 25 | 0.5 | 6.25 | 10 |
| opus-4-5 | 5 | 25 | 0.5 | 6.25 | 10 |
| opus-4-1 | 15 | 75 | 1.5 | 18.75 | 30 |
| opus-4 | 15 | 75 | 1.5 | 18.75 | 30 |
| sonnet-5-5 | 2 | 10 | 0.1 | 2.5 | 4 |
| sonnet-5 | 2 | 10 | 0.2 | 2.5 | 4 |
| sonnet-4-6 | 3 | 15 | 0.3 | 3.75 | 6 |
| sonnet-4-5 | 3 | 15 | 0.3 | 3.75 | 6 |
| sonnet-4 | 3 | 15 | 0.3 | 3.75 | 6 |
| haiku-5-5 | 0.1 | 0.5 | 0.01 | 0.125 | 0.2 |
| haiku-4-5 | 1 | 5 | 0.1 | 1.25 | 2 |
| haiku-3-5 | 0.8 | 4 | 0.08 | 1 | 1.6 |

`haiku-5-5` additionally carries, after its five fields, an `above` object:
`"above": { "prompt_tokens": 100000, "input": 0.5, "output": 2.5, "cache_read": 0.05, "cache_write": 0.625, "cache_write_1h": 1 }`

The FIRST key inside `"pricing"` is `"$comment"`, with exactly this string:
"Per-class $/MILLION-tokens from the Anthropic price sheet fetched 2026-10-21 (see .warboss-horde/out/research-official.md). Used by both automatic meters via scripts/pricing.mjs, which prices EACH message: keys match a model id case-insensitively, longest key wins, and a key must end at a version boundary (end of id, '[', '@', or '-YYYYMMDD'), so an unlisted version prices as null instead of borrowing a neighbour's rate. cache_write is the 5-minute write, cache_write_1h the 1-hour write. `above` swaps in its rates when one request's prompt (input + cache read + cache write) exceeds prompt_tokens. Add every new model id here before driving it."

Numbers are JSON numbers (not strings). No other keys. Do not add aliases like "opus" or "haiku".
