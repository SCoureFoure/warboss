---
name: run-warboss
description: Build, run, and drive warboss — the judge/architect contract-membrane machine. Use to run, start, build, typecheck, smoke-test, or exercise warboss; to run its offline test suite; or to dispatch a real grunt / live experiment (E1–E4). No GUI — it is a Node/TypeScript CLI + library driven by src/smoke.ts (offline) and npm test.
---

# Run warboss

warboss is a **Node/TypeScript CLI + library** (no GUI, no server, no window).
The "app" is the machine itself: freeze an executable contract, judge an impl
against it, dispatch cheap grunts in a retry loop, meter cost. You drive it two
ways, both verified on Linux/Windows with Node 22:

- **Offline (free, default agent path):** `src/smoke.ts` is the off-the-shelf
  end-to-end harness — freezes a contract, judges good/bad impls, bounds an
  infinite loop in the sandbox, proves hash-freeze rejection. No API key, no spend.
- **Internals (free):** `npx tsx --test test/<file>.test.ts` imports and exercises
  any core layer directly. The 294-test suite is the direct-invocation surface most
  PRs touch.
- **Online (spends real $, owner-gated):** `npm run smoke` / the E1–E4 experiment
  runners dispatch real model calls. **Do not run unprompted.**

All paths below are relative to the repo root (the unit).

## Prerequisites

- **Node ≥ 22** (`engines.node: ">=22"`). Verified on `v22.15.1`.
- No OS packages needed — pure JS/TS, no native modules, no xvfb. Windows + Linux both fine.

```bash
node --version    # must be >= 22
npm install       # deps: @anthropic-ai/sdk, tsx, typescript, @types/node
```

## Build

No compile step — `tsx` runs TypeScript directly. "Build" = typecheck.

```bash
npm run typecheck   # tsc --noEmit, strict. Clean = no output.
```

## Run — agent path (offline, free) — DO THIS FIRST

Drive the full core stack with **no API key** by invoking the harness WITHOUT
the env file (this forces the offline branch; `npm run smoke` loads `.env` and
goes online if a key is present):

```bash
node --import tsx src/smoke.ts
```

Expected tail (verified this session):

```text
[offline] mechanical freeze rejects a hash mismatch
  ok — runner refuses to execute against an unregistered hash

[online] skipped — set ANTHROPIC_API_KEY to dispatch a grunt.

SMOKE PASS (offline).
```

If you see `SMOKE PASS (offline).`, the contract / runner / sandbox / hash-freeze
layers all work on this machine.

## Run — internals / test suite (offline, free)

The whole machine, offline — 294 tests (~4s):

```bash
npm test                                  # tsx --test test/*.test.ts
npx tsx --test test/contract.test.ts      # one layer (direct-invocation path)
```

Confirm via the TAP summary lines, not exit code (see Gotchas):

```text
# pass 294
# fail 0
```

## Run — online (spends real money — owner-gated, do NOT run unprompted)

These dispatch real Anthropic model calls and cost money. Require
`ANTHROPIC_API_KEY` in `.env`. Run only when the user explicitly authorizes.

```bash
npm run smoke    # offline checks + dispatches ONE real grunt, prints cost ledger
npm run e1a      # experiment runners — each a small metered live spend
npm run e1b      # (see reports/ for past verdicts and $ amounts)
npm run e2
npm run e3       # ~$0.087 last run
npm run e4       # ~$0.252 last run
```

## Gotchas

- **`rtk` noise on stdout.** An `rtk` hook prepends a line like
  `[rtk] /!\ No hook installed — run rtk init -g ...` to command output. It is
  not a warboss error — strip/ignore the first line when parsing.
- **`rtk` reports false-FAIL on TAP output.** When commands run through the `rtk`
  proxy, warboss's TAP test output can be misread as a failure. Trust the
  `# pass N` / `# fail 0` summary lines, not the proxy's verdict.
- **`npm run smoke` ≠ offline.** It loads `.env` via `--env-file`; if a key is
  present it goes online and spends money. For a free run use
  `node --import tsx src/smoke.ts` (no `--env-file`).
- **`.env` may already hold a live key** (174B present in this checkout). Assume
  any `--env-file=.env` script can spend. Force offline by omitting the env file.
- **No build artifacts.** `tsx` executes `.ts` directly; there is no `dist/`. A
  missing-file error means a wrong path, not a missing build.

## Troubleshooting

- **`SyntaxError` / `Unknown file extension ".ts"`** → invoke through `tsx`:
  `node --import tsx <file>.ts` or `npx tsx <file>.ts`, never bare `node file.ts`.
- **`ANTHROPIC_API_KEY` missing on an online run** → add it to `.env`
  (`cp .env.example .env`, then fill the key). Only needed for the online/E-runs.
- **Tests look like they failed but `# fail 0`** → it's the `rtk` false-FAIL; the
  run passed.
