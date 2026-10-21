# Slice: audit X0 — full prefix attribution

Forks: none open. All behaviour is pinned by the acceptance test below (intent: owner asked for this experiment).

## Contract = the test file

`plugins/warboss-horde/test/audit-x0.test.mjs` is the full acceptance contract. Read it first; every expected value
there is normative. Do not edit the test file.

## Touch only

`plugins/warboss-horde/scripts/audit.mjs`. Match its style (terse ESM, `export function`, comment density).
Do not change any existing export's behaviour: `test/audit.test.mjs` and `test/audit-e2.test.mjs` must still pass,
including the CSV assertion `cols.slice(-5)` (so add NO CSV columns).

## Add these exports

1. `prefixAttribution(text)` -> array of `{ cls, sizeTokens, liveCalls, authored }`, one per block entering the
   prefix, in arrival order. Model it on `toolLifetimes` (same record parsing, same call counting and de-dup by
   `msg.id || rec.uuid`, same skip of `<`-prefixed models, same compact-boundary flush: `liveCalls = calls at flush -
   calls at arrival`, then the pending list is cleared; final flush at end of file). Size = `Math.ceil(chars / 4)`;
   tool_result size exactly as `toolLifetimes` (text parts joined by `\n`, plus 1600 per image).
   - Assistant record: if this is the call's first record AND the call's FINAL usage (last record with that id)
     has `output_tokens_details.thinking_tokens > 0`, emit `thinking` sized by that count first. Then per block:
     `text` -> `assistant_text`; `thinking` blocks -> nothing; `tool_use` -> class by name below, size
     `Math.ceil(JSON.stringify(input).length / 4)`. All assistant entries have `authored: true`.
     De-dup: a tool_use whose `id` was seen before emits nothing; a text block whose (message id + JSON of the
     block) was seen before emits nothing.
   - tool_use classes: `Write` -> path = `input.file_path` with `\` replaced by `/`; matches
     `/(^|\/)\.warboss-horde\/slices\//` -> `use:Write:slices`, else matches `/(^|\/)\.warboss-horde\//` ->
     `use:Write:horde`, else `use:Write:src`. `Edit`, `MultiEdit`, `NotebookEdit` -> `use:Edit`. `Agent`, `Task`
     -> `use:Agent`. `Bash` -> `use:Bash`. Anything else (incl. Read, Grep, Glob) -> `use:other`.
   - User record: string content, or each `text` block -> `user_text`. `tool_result` (de-dup by `tool_use_id`) ->
     class by the originating tool_use name: `Read` -> `result:Read:horde` if its `file_path` matches the
     `.warboss-horde/` regex above (after `\` -> `/`), else `result:Read:src`; `Agent`/`Task` -> `result:Agent`;
     `Bash`, `Grep`, `Glob` -> `result:<name>`; anything else or unknown id -> `result:other`. `authored: false`.
2. `attributionUsd(entries, { r, w, out })` ($/MTok) -> plain object keyed by class (only classes present):
   `{ n, tokens, lifeUsd, authUsd }`; `lifeUsd` sums `lifetimeUsd(size, liveCalls, r, w)`; `authUsd` sums
   `size * out / 1e6` for authored entries, 0 otherwise.
3. `groupOf(cls)` -> `file | exec | search | reasoning | user | other` per the table in the test; unknown -> `other`.
4. `x0Verdict(share)` -> `'PASS'` if share >= 0.4, `'KILL'` if share < 0.2 or not a finite number, else `'MIDDLE'`.

## Wire into `analyse` / `main`

- `main`: pass `prefixAttribution(fileText)` into `analyse` as a new 4th argument.
- `analyse`: compute `s.attr = attributionUsd(entries, { r: s.r_eff, w: s.w_eff, out })` where
  `out = s.out_tokens > 0 ? s.usd_output * 1e6 / s.out_tokens : price.output` (compute after the thinking loop).
- Summary: append a section AFTER `## Thinking share`, before the 120-line slice, exactly these line shapes:
  ```
  (blank)
  ## Prefix attribution (X0)
  (blank)
  - coverage (attributed lifetime / (read+write)): 12.3%
  - file share: 41.0% -> PASS
  - group file: $1.2345 (41.0%)        <- one line per group in order file, exec, search, reasoning, user, other
  (blank)
  | class | blocks | tokens | lifetime usd | authoring usd | total usd | share |
  | --- | --- | --- | --- | --- | --- | --- |
  | use:Write:slices | 1 | 52 | $0.0003 | $0.0010 | $0.0013 | 4.2% |   <- one row per class present, total usd desc
  ```
  Pooled across all sessions. `total = lifeUsd + authUsd`; share and group % are of the pooled attributed total
  (all classes, life + auth); file share = group `file` / that total (use `x0Verdict` on the fraction). Coverage =
  pooled lifeUsd / pooled (usd_read + usd_write). Percent format: one decimal (`p1`). Dollars: 4 decimals.
