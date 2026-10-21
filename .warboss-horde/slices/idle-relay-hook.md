# Slice: idle-relay-hook (rung LOW)

Forks: [intent] block once per idle gap (the warning must arrive BEFORE the expensive rewrite turn, or it saves
nothing). [fiat] default mode block, threshold 60 min, token floor 100000, marker dir under os.tmpdir().

Root: `C:/Users/SCora/Documents/Repositories/warboss/plugins/warboss-horde/`. ESM `.mjs`, 2-space indent, single
quotes, terse comments; mirror the structure of `hooks/bash-gate.mjs` (header comment, stdin read, fail-open).
Acceptance test: `test/idle-relay.test.mjs` — do NOT edit it.

## 1. New file `hooks/idle-relay.mjs` (UserPromptSubmit hook)
Header comment (normal English, ~10 lines): why — after an idle gap longer than the cache TTL the next turn
re-writes the whole prefix at the 1-hour write price, and a fresh session booted from the repo's ground truth is
cheaper (measured: idle relay ~15% of spend in the audit); what it does; the env knobs below.

Read all stdin, `JSON.parse` it as `hook`. Wrap everything in try/catch; on ANY error print nothing, exit 0.
Env (read at run time):
- `WARBOSS_IDLE_RELAY`: `'off'` -> print nothing; `'warn'` -> warn mode; anything else (incl. empty) -> block mode.
- `WARBOSS_IDLE_MINUTES` (number, default 60), `WARBOSS_IDLE_MIN_TOKENS` (number, default 100000).
  Use the default when the env value is empty or not a finite number.
- `WARBOSS_NOW` (ms since epoch; default `Date.now()` when empty or not finite).
- `WARBOSS_IDLE_STATE` (dir; default `path.join(os.tmpdir(), 'warboss-idle')`).

Steps:
1. If `String(hook.prompt || '').trimStart().startsWith('/')` -> print nothing.
2. `hook.transcript_path` must be an existing file, else print nothing.
3. Read at most the LAST 262144 bytes of the transcript (`fs.openSync` / `fs.readSync` at position
   `max(0, size - 262144)`). Split on `/\r?\n/`; if the read did not start at byte 0, drop the first (partial) line.
4. Scan lines from the END; `JSON.parse` in try/catch. The first record where `rec.message.role === 'assistant'`,
   `rec.message.usage` is an object, `rec.message.model` is a string not starting with `<`, and
   `Date.parse(rec.timestamp)` is finite, is `last`. None -> print nothing.
5. `gapMin = (now - Date.parse(last.timestamp)) / 60000`; `u = last.message.usage`;
   `P = input_tokens + cache_read_input_tokens + cache_creation_input_tokens + output_tokens` (missing -> 0).
   If `gapMin <= minutes` or `P < minTokens` -> print nothing.
6. Load `../tiers.json` (relative to this file's directory, like the meters) and
   `price = priceForModel(tiers.pricing, last.message.model)` imported from `../scripts/pricing.mjs`.
   `cost = price && Number.isFinite(price.cache_write_1h) ? P * price.cache_write_1h / 1e6 : null`.
7. `msg = 'warboss idle relay: ' + Math.round(gapMin) + ' min idle, so the prompt cache has expired. Resuming re-writes ~'
   + Math.round(P / 1000) + 'k tokens' + (cost === null ? '' : ' (~$' + cost.toFixed(2) + ' at API rates)')
   + '. Cheaper: /clear, then /warboss-horde:resume to boot from the repo\'s ground truth.'`
8. Warn mode: print `JSON.stringify({ systemMessage: msg })`.
9. Block mode: marker file = `path.join(stateDir, (hook.session_id || path.basename(hook.transcript_path)) + '.txt')`.
   If it exists and its content equals `last.timestamp` -> print nothing (already warned for this gap).
   Otherwise `mkdirSync(stateDir, { recursive: true })`, write `last.timestamp` to the marker, and print
   `JSON.stringify({ decision: 'block', reason: msg + ' Or send your prompt again to continue this session.' })`.
Always exit 0.

## 2. Register it in `hooks/hooks.json`
Add a top-level `"UserPromptSubmit"` array (place it before `"PreToolUse"`) with one entry:
`{ "hooks": [ { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/idle-relay.mjs\"", "timeout": 10 } ] }`.
Append to the end of the `$comment` string: ` UserPromptSubmit runs hooks/idle-relay.mjs: after an idle gap longer
than the cache TTL (default 60 min) on a prefix over 100k tokens it blocks the first prompt once with the re-write
cost and suggests /clear + /warboss-horde:resume; resending the prompt continues; WARBOSS_IDLE_RELAY=warn|off.`
(as one line, no line breaks inside the JSON string). Keep the file valid JSON; change nothing else.
