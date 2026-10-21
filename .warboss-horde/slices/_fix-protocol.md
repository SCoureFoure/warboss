# Fix protocol (shared by every `fix-*` slice)

Repository root: `C:/Users/SCora/Documents/Repositories/warboss`. Read `CLAUDE.md` section "Conventions" first.

## Hard rules

- Edit ONLY the files your slice contract lists under `files`. Other slices are editing other files at the same
  time; touching a file outside your list corrupts their work.
- Implement exactly the `Behavior` and `Cases` in your contract. Do not add features, refactors, or renames beyond it.
- Every case in `Cases` becomes one test (or one assertion block) in the named test file. Match the style of the
  neighboring tests in that file: same runner (`node:test`), same assert import, same naming pattern.
- Do not delete or weaken an existing assertion unless your contract names it. If an existing test contradicts your
  contract and the contract does not name it, stop and report it — do not change it.
- When the contract names a spec file: append one acceptance criterion per new test to that spec's existing
  acceptance-criteria list, continuing its numbering and matching its wording style, and put that criterion id in
  the test name the same way neighboring tests do. Change no other spec text unless the contract says so.
- If the contract leaves something undecided, or the code does not match what the contract assumes, do NOT guess.
  Leave a `// UNDECIDED: <question>` comment at the spot and say so in your reply.
- You cannot run commands. Do not claim tests pass.

## Your final reply

At most 6 lines: files changed, tests added (names), and any `UNDECIDED` or contradicted-test items.
