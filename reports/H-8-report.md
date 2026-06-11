# H-8 Report: Process-isolated execution

## Done: files changed

- **Created** `src/sandbox-child.mjs` — child process worker: reads JSON from stdin, runs code in node:vm, writes `##RESULT##<JSON>` to stdout
- **Created** `src/sandbox-proc.ts` — `runImplProc`: spawns child with `--permission --allow-fs-read=<script> --max-old-space-size=<memMb>`, wall-clock kill, returns `SandboxResult`
- **Modified** `src/runner.ts` — added `judgeAsync`, `ImplRunner`, `JudgeAsyncOptions` exports; imports from `sandbox-proc.ts`
- **Modified** `src/experiment/task.ts` — added `isolation?: string` to `RawTask`, `isolation: "vm" | "process"` to `TaskDef`, validation in `loadTask`, returned in result
- **Created** `test/sandbox-proc.test.ts` — 16 test cases covering AC1–AC10 (AC9 and AC10 each have multiple sub-tests)

## Deviations

1. **`--allow-fs-read=<CHILD_SCRIPT>` required**: The spec showed `["--permission", ...]` without `--allow-fs-read`. On Node 22, `--permission` alone blocks reading the child script itself (ESM loader needs it). Added `--allow-fs-read=<CHILD_SCRIPT>` so the child can boot but still cannot read arbitrary paths.

2. **AC3 error regex loosened**: The vm timeout error message is `"Script execution timed out after 500ms"` (contains "timed out" not "timeout"). Test regex updated to `/time/i` to match both "timed out" (vm kill) and "timeout" (wall-clock kill).

3. **AC4 async runaway — `setInterval` not in vm context**: The spec suggested `setInterval` to keep the event loop alive. `setInterval` is not available in the vm sandbox (empty context). Instead, a `setInterval(() => {}, 100)` keepalive is placed in the child process itself (outside the vm) so the event loop stays up until the parent's wall-clock SIGKILL fires.

4. **Unserializable detection (AC8)**: `JSON.stringify(function(){})` returns `undefined` rather than throwing. Fixed in child script to check `serialized === undefined` as the unserializable sentinel.

5. **AC2 `--permission` test**: Adjusted to spawn a script with `--allow-fs-read=<script-itself>` only, and attempt to read a sibling file — confirmed to exit nonzero (access denied).

## Gaps found

None. All items in H-8 were fully specified.

## Verify

```
npm run typecheck → (clean, no output)
npm test         → 90/90 pass (74 pre-existing + 16 new)
```

## Cost/time

~15 min wall time
