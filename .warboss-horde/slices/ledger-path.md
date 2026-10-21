# Slice: ledger-path (rung LOW)

Forks: [fiat] the ledger root is the session's STARTING cwd (first `cwd` in the parent transcript) ("one session, one
ledger"); not yet confirmed by the Leader. [intent] `WARBOSS_LEDGER` still overrides; old fallbacks remain.

Root: `C:/Users/SCora/Documents/Repositories/warboss/plugins/warboss-horde/`. ESM `.mjs`, 2-space indent, single
quotes, short comments, same style as `scripts/pricing.mjs`.

## 1. New file `scripts/ledger-path.mjs` — one named export
`ledgerFileFor(hook, env)` -> absolute path string. `hook` may be `{}`; `env` is an env-like object.
Steps, first hit wins:
1. If `env.WARBOSS_LEDGER` is a non-empty string -> return `path.resolve(env.WARBOSS_LEDGER)`.
2. Find the parent transcript. Only if `hook.transcript_path` and `hook.session_id` are both non-empty strings:
   candidates in order
   a. `path.join(path.dirname(hook.transcript_path), hook.session_id + '.jsonl')`
   b. `path.resolve(path.dirname(hook.transcript_path), '..', '..', hook.session_id + '.jsonl')`
   Take the first candidate that exists as a file. Read AT MOST its first 65536 bytes (use `fs.openSync` +
   `fs.readSync` into a 65536-byte buffer, then `toString('utf8', 0, bytesRead)`). Split on `/\r?\n/`; for each line
   in order, `JSON.parse` inside try/catch (skip bad lines, including a truncated last line); the first record
   whose `cwd` is a non-empty string gives `root`. Return `path.resolve(root, '.warboss-horde', 'ledger.jsonl')`.
3. Otherwise -> `path.resolve(hook.cwd || process.cwd(), '.warboss-horde', 'ledger.jsonl')`.
Any filesystem error in step 2 -> fall through to step 3 (never throw).

## 2. Use it in both meters: `scripts/meter-orchestrator.mjs` and `scripts/meter-subagent.mjs`
In each `main()`, replace the existing expression
```
const ledgerFile = process.env.WARBOSS_LEDGER
  ? path.resolve(process.env.WARBOSS_LEDGER)
  : path.resolve(hook.cwd || process.cwd(), '.warboss-horde', 'ledger.jsonl');
```
with `const ledgerFile = ledgerFileFor(hook, process.env);` and add
`import { ledgerFileFor } from './ledger-path.mjs';` beside the existing `./pricing.mjs` import.
Keep the `fs.mkdirSync(path.dirname(ledgerFile), { recursive: true })` line. Change nothing else.
In each file's header comment, the `WARBOSS_LEDGER  override ledger file path` env-knob line stays; add one line
under the env knobs: `// Ledger location: the session's starting cwd (scripts/ledger-path.mjs), not the live cwd.`

## Do not edit
`test/ledger-path.test.mjs` (acceptance test), `tiers.json`, `scripts/pricing.mjs`, any other test.

## Examples
- parent transcript lines `{type:'summary'}`, `{cwd:'/s'}`, `{cwd:'/l'}`; hook.cwd `/l` -> `/s/.warboss-horde/ledger.jsonl`.
- hook.transcript_path `<p>/sess-1/subagents/agent-1.jsonl`, parent at `<p>/sess-1.jsonl` -> parent's first cwd.
- parent missing -> hook.cwd. First cwd only after byte 65536 -> hook.cwd. `ledgerFileFor({}, {})` -> process.cwd().
