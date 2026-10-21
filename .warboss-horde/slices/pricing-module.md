# Slice: pricing-module (rung MID — subtle_invariant: boundary matching + per-message aggregation)

Forks: [intent] unknown model version prices as null (fail-closed, repo convention).
[intent] a message missing any required rate makes the model's est_usd null for that row.
[fiat] missing `cache_write_1h` on a price entry is an error (null), not a fallback to cache_write.

Root: `C:/Users/SCora/Documents/Repositories/warboss/plugins/warboss-horde/`. ESM `.mjs`, match the style of the
existing scripts (2-space indent, single quotes, short explanatory comments).

## 1. New file `scripts/pricing.mjs` — two named exports, nothing else exported

`priceForModel(pricing, model)` -> the entry object or `null`.
- `null`/empty/non-string `model`, or non-object `pricing` -> `null`.
- Lowercase both the id and each key. Skip keys starting with `$`.
- A key K matches id M when K occurs in M at some index i, and the remainder `M.slice(i + K.length)` is:
  `''`, or starts with `[`, or starts with `@`, or matches `/^-\d{8}(?=$|[\[@])/`.
  (So `opus-5` matches `claude-opus-5` and `claude-opus-5-20260101` but NOT `claude-opus-5-5` or `claude-opus-5-1`.)
  Check every occurrence of K in M, not only the first.
- Among matching keys the LONGEST wins. Return the entry only if it is a non-null object, else `null`.

`messageUsd(price, usage)` -> number (unrounded) or `null`.
- `price` not an object -> `null`.
- Token counts (missing -> 0): `in = usage.input_tokens`, `out = usage.output_tokens`,
  `read = usage.cache_read_input_tokens`, `create = usage.cache_creation_input_tokens`,
  `w1h = usage.cache_creation?.ephemeral_1h_input_tokens` (0 if absent), `w5m = max(0, create - w1h)`.
- `prompt = in + read + create`. Rates = `price`; but if `price.above` is an object and
  `prompt > price.above.prompt_tokens`, rates = `{ ...price, ...price.above }`.
- Required rates: `input, output, cache_read, cache_write, cache_write_1h`; if any is not a finite number -> `null`.
- Result: `(in*input + out*output + read*cache_read + w5m*cache_write + w1h*cache_write_1h) / 1e6`.

## 2. Wire both meters: `scripts/meter-orchestrator.mjs` and `scripts/meter-subagent.mjs`
In EACH file:
- Delete the local `priceForModel` and `usd` functions; `import { priceForModel, messageUsd } from './pricing.mjs';`
- `sumByModel(file, pricing)` takes the pricing table. Per deduped message it adds to the model accumulator:
  the existing four counts, plus `cache_creation_1h += usage.cache_creation?.ephemeral_1h_input_tokens || 0`, plus
  `usd += messageUsd(priceForModel(pricing, model), usage)`. If any message's `messageUsd` is `null`, the
  accumulator's `usd` becomes `null` and stays `null`. Start `usd` at `0`.
- Pass `pricing` at the call site (it is already loaded in `main`).
- The ledger row gets a new field `cache_creation_1h: u.cache_creation_1h`, placed right after `cache_creation`;
  `est_usd` becomes `u.usd === null ? null : Number(u.usd.toFixed(6))`.
- `tokens` is unchanged (input + output + cache_read + cache_creation). Change nothing else in the files: dedupe,
  placeholder skipping, subagent redirection, idempotency, never-throw behaviour all stay.
- Update the header comment line in `meter-subagent.mjs` that says "Match a full model id ... by substring" (it goes
  with the deleted function — remove it).

## 3. Existing test to update: `test/meter-orchestrator.test.mjs`
Line `const p = tiers.pricing.haiku;` -> `const p = tiers.pricing['haiku-4-5'];` and rename the test title
`'est_usd is priced from tiers.json pricing.haiku'` -> `"est_usd is priced from tiers.json pricing['haiku-4-5']"`.
No other test edits. Do NOT edit `test/pricing.test.mjs` (it is the acceptance test) or `tiers.json` (another slice).

## Acceptance (examples)
- `priceForModel({ 'opus-5': A, 'opus-5-5': B }, 'claude-opus-5-5[1m]')` -> B; `..., 'claude-opus-5-1')` -> null.
- `messageUsd({input:4,output:20,cache_read:0.2,cache_write:5,cache_write_1h:8}, {cache_creation_input_tokens:3e6,
  cache_creation:{ephemeral_1h_input_tokens:1e6}})` -> 18 (2e6*5 + 1e6*8, /1e6).
- above threshold at exactly `prompt_tokens` uses base rates; one token more uses `above` rates for ALL classes.
- A Haiku 5.5 transcript with one 50k-prompt message and one 150k-prompt message: row `est_usd` is the sum of the
  two per-message prices (base rates for the first, `above` rates for the second), never one aggregate price.
