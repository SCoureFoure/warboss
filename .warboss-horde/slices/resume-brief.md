# Slice: resume-brief (rung LOW)

Forks: [intent] ground truth only (git + horde files + TODO head), never a prose handoff. [fiat] the caps below.

Root: `C:/Users/SCora/Documents/Repositories/warboss/plugins/warboss-horde/`. ESM `.mjs`, 2-space indent, single
quotes, terse comments, Node built-ins only. Acceptance test: `test/resume-brief.test.mjs` — do NOT edit it.

## New file `scripts/resume-brief.mjs`
Header comment: prints a short ground-truth digest of the repo for a fresh session (`/warboss-horde:resume`), so a
session restarted after an idle gap boots from the work itself instead of re-reading an old transcript.

Arg `--cwd <dir>` (default `process.cwd()`). `git(args)` = `execFileSync('git', args, { cwd, encoding: 'utf8',
stdio: ['ignore', 'pipe', 'ignore'] })` in try/catch returning `null` on failure. Build sections in this order,
each as `'## Title\n' + body`, joined with `'\n\n'`, then print to stdout with a trailing newline:

1. `## Branch` — if `git(['rev-parse', '--abbrev-ref', 'HEAD'])` is null: body `(not a git repository)`, and
   skip section 2. Else body = the branch name (trimmed), a newline, then `git(['log', '--oneline', '-10'])` trimmed
   (omit the newline + log if the log is null or empty).
2. `## Working tree` — `git(['status', '--short'])`; split into non-empty lines (keep each line's leading
   characters exactly, do not trim the start); if there are none, body `(clean)`; else the first 30 lines, plus a
   final line `(+N more)` when more than 30 exist.
3. `## Recent slices` — only if `<cwd>/.warboss-horde/slices` exists: its `*.md` files whose name does not start
   with `_`, sorted by mtime newest first, first 10, one name per line without the `.md` extension. Omit the
   section if no files qualify.
4. `## Recent verdicts` — only if `<cwd>/.warboss-horde/verdicts.jsonl` exists: its last 8 parseable JSON lines,
   one per line formatted `${slice} ${verdict} r${round}` plus ` ${cause}` when `cause` is set. Omit if none.
5. `## TODO` — only if `<cwd>/TODO.md` exists: its first 40 lines.

If the final text exceeds 16000 characters, cut it to 16000 and append `\n…(truncated)`. Exit 0.
