# Slice: audit-e2-thinking (rung MID — subtle_invariant: file-order call counting with streamed-id dedup and compaction, fitted into the existing cost model)

Forks: [intent] thinking tokens come from `usage.output_tokens_details.thinking_tokens` (present in real transcripts).
[fiat] "referenced again" = a later assistant output contains a token that was novel when the result arrived.
[fiat] an image in a tool result costs a flat 1600 tokens. [fiat] text tokens = ceil(chars / 4).
[intent] a result is replayed only until the next compact boundary.

Root: `C:/Users/SCora/Documents/Repositories/warboss/plugins/warboss-horde/`. Edit ONLY `scripts/audit.mjs`.
Acceptance tests: `test/audit-e2.test.mjs` and `test/audit.test.mjs` (do NOT edit either). Every existing export,
CSV column and summary section stays as is; new columns go at the END.

## 1. Constants
- `TOKEN_RE = /[A-Za-z0-9_][A-Za-z0-9_.\/:-]{7,}/g` — a "token" is any match (length >= 8).
- `IMAGE_TOKENS = 1600`.

## 2. New export `toolLifetimes(text)` -> `[{ tool, sizeTokens, liveCalls, referenced }]`, one per tool_result block, in file order
Walk the JSONL lines in file order; skip blank and unparseable lines. Let `msg = rec.message`.
- **Call**: a record whose `msg.role === 'assistant'`, `msg.usage` is an object, `msg.model` does not start with `<`,
  and whose `msg.id` (fallback `rec.uuid`) has not been seen before. A repeated id is NOT a new call (streaming).
- **Compact boundary**: `rec.type === 'system' && rec.subtype === 'compact_boundary'`.
- **tool_use map**: every assistant content block `{type:'tool_use', id, name}` maps id -> name.
- **tool_result**: every content block `{type:'tool_result', tool_use_id, content}` in a `msg.role === 'user'` record.
  If the same `tool_use_id` was already counted, skip it.
  - `tool`: name via the map. `'Task'` -> `'Agent'`. Name in {Read, Bash, Grep, Glob, Agent} -> itself. Anything else,
    including an unknown id -> `'other'`.
  - result text: `content` if it is a string; if an array, the `text` of its `type:'text'` items joined with `'\n'`;
    `images` = count of `type:'image'` items (their data is never text). Otherwise empty text, 0 images.
  - `sizeTokens = Math.ceil(text.length / 4) + IMAGE_TOKENS * images`.
  - `liveCalls` = number of NEW calls appearing after this record and before the next compact boundary (or EOF).
  - `novel` = tokens of the result text not in the `seen` set at that moment; then add all its tokens to `seen`.
  - `referenced = true` iff some `novel` token occurs in assistant output in ANY later record (no boundary limit).
- **`seen` set** collects tokens from every content block processed so far: user string content, user `text` blocks,
  tool_result text, assistant `text` (`.text`), `thinking` (`.thinking`), and `tool_use` (`JSON.stringify(input)`).
- **Assistant output** (what can reference) = assistant `text`, `thinking`, and `tool_use` input JSON. User text and
  later tool results never reference.
- Must stay linear-ish on a 13 MB transcript: e.g. a first pass mapping token -> last line index where it appears in
  assistant output; a result is referenced iff a novel token's last index > the result's line index.

## 3. New export `lifetimeUsd(sizeTokens, liveCalls, r, w)` ($/MTok rates -> dollars)
`liveCalls >= 1 ? sizeTokens * (w + (liveCalls - 1) * r) / 1e6 : 0`. Examples: (1000,3,0.2,5)->0.0054;
(1000,1,0.2,5)->0.005; (1000,0,0.2,5)->0.

## 4. New export `sizeBucket(t)`
`t < 1000 '<1k'`; `t < 5000 '1k-5k'`; `t < 20000 '5k-20k'`; else `'>=20k'`.

## 5. Per session (in `main`/`analyse`; pass the file text or its lifetimes in — your choice)
- For each lifetime: `usd = lifetimeUsd(sizeTokens, liveCalls, r_eff, w_eff)` with the session's `r_eff`, `w_eff`.
- `tool_usd` = sum of usd; `dead_usd` = sum of usd where `referenced` is false.
- `think_tokens` = sum over calls of `usage.output_tokens_details.thinking_tokens || 0` (use each call's final usage,
  as `loadCalls` keeps); `out_tokens` = sum of `output`; `think_usd` = sum of `think * ratesFor(price, usage).output / 1e6`.
- Count calls where thinking_tokens > output_tokens as `think_gt_out` (summary only, not CSV).
- CSV: append, in this order, at the end: `tool_usd,dead_usd,think_tokens,out_tokens,think_usd`. Same formatting.
- Also keep, per session, per-tool and per-bucket aggregates (n, dead n, usd, dead usd) for the summary.

## 6. `summary.md` — append two sections; raise the line cap from 80 to 120
`## Dead tool output (E2)`:
- pooled `sum(tool_usd) / sum(usd_read + usd_write)` and `sum(dead_usd) / sum(usd_read + usd_write)` as percentages.
- A markdown table by tool (rows Read, Bash, Grep, Glob, Agent, other): `results | dead | usd | dead usd | dead % of read+write`.
- A markdown table by size bucket (rows `<1k`, `1k-5k`, `5k-20k`, `>=20k`), same columns.

`## Thinking share`:
- pooled `sum(think_tokens) / sum(out_tokens)`, `sum(think_usd) / sum(usd_output)`, `sum(think_usd) / sum(usd_total)`
  as percentages; total `think_usd` dollars; total `think_gt_out` count.

Dollars with 2 decimals, percentages with 1 decimal. A zero denominator prints `n/a`.
