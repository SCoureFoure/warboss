# Slice: research-levers (rung LOW — extraction only, no repo change)

Read these five files in `C:/Users/SCora/Documents/Repositories/warboss/.warboss-horde/out/`:
`research-official.md`, `research-community.md`, `research-thermo-fluid.md`, `research-flow-networks.md`, `research-ants.md`.

Write ONE file: `C:/Users/SCora/Documents/Repositories/warboss/.warboss-horde/out/levers.md`. Edit nothing else.

List every concrete, actionable lever the notes propose for cutting Claude Code / agent token cost or improving
cache efficiency. A lever is something one could configure, build or change in a workflow. Skip pure background
facts and analogies that name no action.

## Format — one markdown table, then nothing else

| # | lever | source | mechanism | claimed effect | kind | session behaviour change | status |

- `source`: file name + nearest heading, e.g. `research-official.md § Cache TTL`.
- `mechanism`: one sentence, your words, no longer than 25 words.
- `claimed effect`: the number the note gives, quoted exactly with its unit; `none stated` if no number.
- `kind`: exactly one of `config` (settings / env var), `hook` (Claude Code hook script), `workflow` (how the
  human or agent works), `harness` (warboss code).
- `session behaviour change`: `no` if the user and agent would not notice it during work; otherwise `yes: ` plus
  what changes, max 12 words.
- `status`: `done` if it matches one of these already-shipped items, else `open`:
  per-message pricing from the price sheet; idle relay (block once after >60 min idle, resume from disk);
  restart-at-N-calls counterfactual measured (not built); lowering BASH_MAX_OUTPUT_LENGTH /
  CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS evaluated and rejected; bash gate routing commands to a runner subagent;
  doer/runner subagent delegation at cheaper models.

Merge duplicates across files into one row (list both sources). Order rows: open before done, then by kind
(config, hook, workflow, harness).
