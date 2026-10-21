# test-dashboard

First read `.warboss-horde/slices/_fix-protocol.md` and follow it exactly.

Forks: tests for documented flags and the dedupe/skip rules = `intent`. Dropping unparseable-`ts` points from the
time charts (instead of failing the whole board) = `fiat`.

- files: `plugins/warboss-horde/test/dashboard.test.mjs` (new file), `plugins/warboss-horde/scripts/dashboard.mjs`
  (ONLY the change in "Behavior change" below)
- Read (do not edit): `plugins/warboss-horde/test/meter-subagent.test.mjs` for spawn and temp-dir helper style.
- If a case in "Cases" contradicts what the script does (other than cases 12-13, which the behavior change makes
  true), STILL write the test exactly as stated and list that case in your reply.

## Behavior change (the only edit to `dashboard.mjs`)

`costChart` computes `new Date(t0).toISOString()` (near line 323). When a costed row's `ts` does not parse, `t0` or
`t1` is `NaN` and `toISOString()` throws `RangeError`, which kills the whole dashboard.

Make every time-axis chart ignore points whose `ts` is unparseable:

- In `costChart`, build `pts` as the costed points whose `new Date(p.ts).getTime()` is not `NaN`. The existing
  "fewer than 2 points" message then covers the degenerate case.
- Read `burnChart` and `burnLegend`. If either calls `new Date(...)` on a row `ts` and then `toISOString()`, or does
  arithmetic that would put `NaN` into an SVG attribute, apply the same filter there. If neither does, leave them
  unchanged and say so in your reply.

Totals, tables, and every non-chart figure still include those rows. Change nothing else.

## Harness

Spawn `node plugins/warboss-horde/scripts/dashboard.mjs <args>` with `spawnSync`. Fresh temp directory per test.
A "doer row" is
`{"ts":"2026-01-01T00:00:0<n>.000Z","source":"hook","session_id":"s","agent_type":"warboss-horde:doer","agent_id":"a<n>","model":"claude-haiku-4-5","tier":"LOW","tokens":110,"input":100,"output":10,"cache_read":0,"cache_creation":0,"est_usd":0.01}`
with a distinct `<n>` per row unless stated.

With `--out`, the script prints to stderr
`dashboard: wrote <path> (<P> project[s], <D> dispatches)`. Cases assert on `<P>` and `<D>` through that line.
Before writing those assertions, read `aggregate` in `dashboard.mjs` and confirm that each doer row with a distinct
`agent_id` adds exactly 1 to `totals.dispatches`. If it does not, leave `// UNDECIDED:` at the top of the test file
and report what `totals.dispatches` counts.

## Cases

1. `--file <ledger>` with 2 doer rows → exit 0; stdout contains `<html` and `</html>`.
2. `--file <ledger> --out <tmp>/board.html` → exit 0; stdout is empty; the file exists and contains `</html>`;
   stderr matches `/\(1 project, 2 dispatches\)/`.
3. Dedupe by `(agent_id, model)`, last line wins: lines `a1` tokens 111111, `a1` tokens 333333 (same model), `a2`
   → stderr reports `2 dispatches`.
4. Rows without `agent_id` never merge: two identical lines with the `agent_id` key removed → stderr reports
   `2 dispatches`.
5. Malformed line skipped: one doer row then a line `{"model":` → exit 0; stderr reports `1 dispatches`.
6. `--file` pointing at a path that does not exist → exit 1; stderr contains `dashboard: no ledger at`.
7. `--root <empty temp dir>` → exit 1; stderr contains `no .warboss-horde/ledger.jsonl found under`.
8. Discovery and skip list: under `<R>` create `.warboss-horde/ledger.jsonl` (1 doer row),
   `sub/proj/.warboss-horde/ledger.jsonl` (1 doer row), `node_modules/pkg/.warboss-horde/ledger.jsonl` (1 doer row),
   `.git/x/.warboss-horde/ledger.jsonl` (1 doer row). Run `--root <R> --out <tmp>/b.html` → stderr matches
   `/\(2 projects, 2 dispatches\)/`; the written HTML contains `sub/proj`.
9. `.warboss-horde` directory without a `ledger.jsonl` is not a project: `<R>/a/.warboss-horde/` (empty) and
   `<R>/b/.warboss-horde/ledger.jsonl` (1 doer row) → `(1 project, 1 dispatches)`.
10. HTML escaping of ledger text: one doer row whose `model` is `claude-haiku-4-5<img src=q onerror=1>` and whose
    `agent_type` is `warboss-horde:doer<b>x</b>` → exit 0; stdout does not contain `<img src=q` and does not contain
    `<b>x</b>`.
11. HTML escaping of verdict text: `<tmp>/.warboss-horde/ledger.jsonl` with one doer row `a1`, and beside it
    `verdicts.jsonl` with `{"ts":"2026-01-01T00:00:09.000Z","agent_id":"a1","verdict":"green","round":1,"slice":"<i>s</i>","cause":"<u>c</u>"}`.
    Run `--file` on that ledger → exit 0; stdout contains neither `<i>s</i>` nor `<u>c</u>`.
12. Unparseable `ts` on one row: three doer rows (`est_usd` 0.01 each) with `ts` values valid, `"garbage"`, valid
    → exit 0; stdout contains `</html>`; stderr does not contain `RangeError`.
13. Unparseable `ts` on every row: three doer rows all with `ts: "garbage"` → exit 0; stdout contains `</html>`.
14. Missing verdicts file is fine: `--file` on a ledger with no sibling `verdicts.jsonl` → exit 0 (covered by case 1;
    add an explicit assertion there that no `verdicts.jsonl` exists in the temp directory).
