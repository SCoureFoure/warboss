# review-drift

First read `.warboss-horde/slices/_review-protocol.md` and follow it exactly. This slice is mechanical: every
finding is a lookup that either matches or does not. Use kind `drift` or `test-gap` only.

- output: `.warboss-horde/out/review-drift.md`
- scope: `CLAUDE.md`, `README.md`, `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`,
  `specs/*.md`, `test/*.test.ts` (grep only), `.claude/skills/*/SKILL.md`, `.claude/settings.json`

## Checks — do each one, in order

1. **Dead links.** For every relative markdown link and every backticked repo path in `CLAUDE.md`, `README.md`, and
   `specs/README.md`: Glob for the target. Report each target that does not exist. One finding per source file,
   listing all its dead targets with the source line of each.
2. **Scripts.** For every `npm run <name>` mentioned in `CLAUDE.md`, `README.md`, and `.claude/skills/*/SKILL.md`:
   check `<name>` is a key under `scripts` in `package.json`. Report each missing name. Then the reverse: report each
   `package.json` script that no document mentions.
3. **Script targets.** For every file path that appears inside a `package.json` script value: Glob for it. Report
   each that does not exist.
4. **Acceptance criteria to tests.** For each `specs/*.spec.md`: collect every acceptance-criterion id (the pattern
   is the spec's own, usually `AC-<n>` or `AC<n>` or a prefixed form — use whatever ids the file defines). For each
   id, Grep `test/` for that id. Report, per spec, the ids that appear in no test file. If a spec defines no ids at
   all, report that as one finding for that spec.
5. **Source files without a spec.** For each file directly under `src/` and under `src/experiment/`: Grep `specs/`
   for the file's base name. Report the files no spec mentions, as one finding.
6. **Source files without a test.** For each file directly under `src/`, `src/experiment/`, and `src/hooks/`: Grep
   `test/` for an import of that file. Report the files no test imports, as one finding.
7. **Ignore coverage.** Read `.gitignore`. Report whether each of these is ignored: `.env`, `node_modules`,
   `reports/`, `.warboss-horde/out/`, `.warboss-horde/*.bak`, `.claude/settings.local.json`,
   `.claude/scheduled_tasks.lock`. List the ones that are NOT ignored in one finding.
8. **Architecture claims.** `CLAUDE.md` section "Architecture — layers, bottom up" names exported symbols in
   backticks (for example `convergenceProbe`, `decomposeRecursive`, `jsonlFileSink`). For each backticked symbol in
   that section, Grep `src/` for its definition. Report each symbol with no definition.
