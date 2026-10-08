# fix-bash-gate

First read `.warboss-horde/slices/_fix-protocol.md` and follow it exactly.

Forks: exact matching for the three bypasses = `intent`. Warn mode emits no permission decision = `intent` (owner
decision, 2026-10-08). The exact shell-operator list in rule 3 = `fiat`.

- files: `plugins/warboss-horde/hooks/bash-gate.mjs`, `plugins/warboss-horde/test/bash-gate.test.mjs`
- No spec file for this slice.

## Behavior — four changes inside `bash-gate.mjs`

1. **Subagent detection** (currently `String(hook.transcript_path || '').includes('subagents')`).
   Split `transcript_path` on `/` and `\`. The call is from a subagent iff the path has at least two segments and the
   segment immediately before the file name is exactly `subagents`.
2. **Inline escape** (currently `command.includes('WARBOSS_INLINE')`).
   Allowed iff the command, after leading whitespace is trimmed, matches `/^WARBOSS_INLINE=1\s/`.
3. **Exempt control-plane commands** (currently `ALLOW.some((re) => re.test(command))`).
   Exempt iff BOTH hold:
   - a. The trimmed command matches: `node`, whitespace, then one path token that is either double-quoted,
     single-quoted, or unquoted without spaces, whose text ends with `ledger.mjs` or `dashboard.mjs` and where the
     character before that file name is `/`, `\`, or the start of the token; then whitespace or end of string.
   - b. After deleting every `'...'` single-quoted span and every `"..."` double-quoted span from the command, the
     remainder contains none of: `;`  `&`  `|`  `` ` ``  `$(`  `>`  `<`  newline.
4. **Warn mode.** When the verdict is `warn`, write to stdout exactly one JSON object:
   `{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"warboss ops rule (warn mode): <REASON>"}}`
   with the existing `REASON` text. It MUST NOT contain the key `permissionDecision`. Deny mode output is unchanged.

Change nothing else: `findMarker`, mode parsing, `REASON`, and the non-Bash early return stay as they are. Update the
file's header comment only where it describes behavior you changed.

## Cases (in `plugins/warboss-horde/test/bash-gate.test.mjs`)

Use the helper the existing tests use to run the hook with a payload and environment. "Armed" means the same arming
the existing tests use (marker file or `WARBOSS_BASH_GATE=deny`). "Denied" means stdout JSON has
`permissionDecision: "deny"`. "Allowed" means stdout is empty. Main-agent `transcript_path` unless stated:
`/home/u/.claude/projects/p/abc.jsonl`.

| # | transcript_path | command | expect |
|---|---|---|---|
| 1 | `/home/u/.claude/projects/-work-subagents-lab/abc.jsonl` | `npm test` | denied |
| 2 | `/home/u/.claude/projects/p/abc/subagents/agent-1.jsonl` | `npm test` | allowed |
| 3 | `C:\Users\u\.claude\projects\p\abc\subagents\agent-1.jsonl` | `npm test` | allowed |
| 4 | `/home/u/subagents/projects/p/abc.jsonl` | `npm test` | denied |
| 5 | main | `WARBOSS_INLINE=1 npm test` | allowed |
| 6 | main | `npm test # WARBOSS_INLINE` | denied |
| 7 | main | `WARBOSS_INLINE=0 npm test` | denied |
| 8 | main | `echo x && WARBOSS_INLINE=1 npm test` | denied |
| 9 | main | `npm test; echo ledger.mjs` | denied |
| 10 | main | `cat ledger.mjs` | denied |
| 11 | main | `node /p/scripts/ledger.mjs summary && rm -rf x` | denied |
| 12 | main | `node /p/scripts/notledger.mjs summary` | denied |
| 13 | main | `node "/p/scripts/ledger.mjs" annotate latest '{"verdict":"green","slice":"a;b|c"}'` | allowed |
| 14 | main | `node "C:/Users/u/x/scripts/dashboard.mjs" --out board.html` | allowed |
| 15 | main | `node ledger.mjs summary` | allowed |
| 16 | main | `node /p/scripts/dashboard.mjs > out.html` | denied |

17. Warn mode: `WARBOSS_BASH_GATE=warn`, main transcript, command `npm test`. Stdout parses as JSON;
    `hookSpecificOutput.additionalContext` starts with `warboss ops rule (warn mode):`; the raw stdout string does
    not contain `permissionDecision`.

An existing test that asserts warn mode emits `permissionDecision: "allow"` is named by this contract: change it to
match case 17. Every other existing test must keep passing unchanged.
