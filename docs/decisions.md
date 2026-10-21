# Decisions

Settled forks. Where an entry here disagrees with a spec, this file wins until the spec is updated.

## Settled by the Leader

- **2026-10-08 — A `throws` case passes only on an implementation throw.** Timeout, sandbox crash, missing entry
  function, and an unserializable or absent child result all FAIL a `throws` case. `SandboxResult` failures carry
  `kind: "threw" | "timeout" | "no-entry" | "infra"`; only `"threw"` passes. A result with no `kind` fails.
  Lives in `src/runner.ts`, `src/sandbox.ts`, `src/sandbox-proc.ts`, `src/sandbox-child.mjs`.
- **2026-10-08 — `meanCostPerGreenSession` = total cost of ALL sessions / green count.** The spec
  (`specs/e1b-harness.spec.md`) wins over the earlier code, which divided only green sessions' cost. Money spent on
  failed sessions is part of what a green costs. Lives in `src/experiment/e1b.ts`.
- **2026-10-08 — Bash-gate warn mode emits no permission decision.** It sends the ops-rule text as
  `additionalContext` and leaves the normal permission flow untouched; it previously emitted
  `permissionDecision: "allow"`, which approved every main-agent Bash call. Lives in
  `plugins/warboss-horde/hooks/bash-gate.mjs`.

## Fiat to confirm

Chosen by the orchestrator to make a slice decidable. The Leader has not ruled on these.

- **`Contract.freeze` rejects non-plain values in examples** — `Date`, `Map`, `Set`, `RegExp`, class instances,
  functions, symbols. Reason: `JSON.stringify` flattens them, so two different examples could hash the same.
- **`Contract.freeze` rejects an object key named `$nonjson`.** The hash encodes `NaN`, `Infinity`, `-Infinity`,
  `-0`, nested `undefined`, and `bigint` as `{"$nonjson": "..."}`; the key is reserved so a literal cannot collide.
- **The four failure-kind names**, and classing an unserializable return value as `infra` (so a `throws` case whose
  implementation returns a function fails rather than passes).
- **Subagent meter appends a row only when the token total changed.** Re-fires with no growth add nothing.
- **`rescore` keeps its `?? 0` defaults for fields of an arm that is present.** Assumed to exist for older
  artifacts. Only a wholly missing arm fails the criteria.
- **A missing arm fails ALL criteria**, including any criterion that does not read that arm.
- **Bash-gate exempt command** = `node <path>/ledger.mjs` or `node <path>/dashboard.mjs`, with none of
  `; & | > < $( \`` or a newline outside quotes. Redirecting dashboard output with `>` is therefore denied; use
  `--out`.
- **Bash-gate subagent detection** = the transcript file's parent directory is named exactly `subagents`.
- **Dashboard time charts drop points with an unparseable `ts`.** Totals and tables still count those rows.
- **`ledger.mjs` still exits 1 on a malformed ledger line** for `summary` and `advise`. Left as is because a comment
  in the file says it is deliberate; the dashboard skips such lines instead. The two boards disagree here.
