# Slice: ledger-owner (rung LOW)

Forks: [intent] one session still writes one ledger — the walk-up starts from the session's root (starting cwd
and its existing fallbacks), never from the live cwd. [intent] the owner marker is a `.warboss-horde` DIRECTORY.

Root: `C:/Users/SCora/Documents/Repositories/warboss/plugins/warboss-horde/`. Edit ONLY `scripts/ledger-path.mjs`
and `scripts/ledger.mjs`. Acceptance tests (do NOT edit): `test/ledger-owner.test.mjs`, `test/ledger-path.test.mjs`,
and every other existing test under `test/`.

## 1. `scripts/ledger-path.mjs` — new export `ownerDir(start)` (ROUND 2: the walk is bounded by the git root)
Round 1 walked up unbounded and was captured by a stray `C:\Users\<user>\.warboss-horde` above every temp dir and
every repo. The walk must never leave the git repository that contains `start`.
- `s = path.resolve(start)`. First find the repo root: the nearest ancestor of `s` (inclusive) where
  `path.join(dir, '.git')` EXISTS (directory OR file — worktrees and submodules use a `.git` file). If there is no
  such ancestor up to the filesystem root, return `s` (no walk-up outside a repo).
- Then walk `dir` from `s` upward to the repo root INCLUSIVE: the first `dir` where `path.join(dir, '.warboss-horde')`
  is a directory (`fs.statSync(...).isDirectory()` in try/catch; any error = not a directory) is returned.
- No owner between `s` and the repo root (inclusive): return `s`.
- Never examine directories above the repo root.

## 2. `ledgerFileFor(hook, env)` — apply `ownerDir` to every non-override branch
- `WARBOSS_LEDGER` branch: unchanged (no walk-up).
- starting-cwd branch: `path.resolve(ownerDir(root), '.warboss-horde', 'ledger.jsonl')`.
- final fallback: `path.resolve(ownerDir(hook.cwd || process.cwd()), '.warboss-horde', 'ledger.jsonl')`.
- Update the file's header comment: root = starting cwd, resolved upward to the nearest directory owning
  `.warboss-horde/` (so a session started in a subdirectory uses its project's ledger).

## 3. `scripts/ledger.mjs` — `ledgerPath(args)`
- `args.file` and `WARBOSS_LEDGER` branches unchanged.
- Default: `path.resolve(ownerDir(process.cwd()), '.warboss-horde', 'ledger.jsonl')`, importing `ownerDir` from
  `./ledger-path.mjs`. `verdictsPath` keeps deriving from `ledgerPath`, so verdicts follow automatically.
