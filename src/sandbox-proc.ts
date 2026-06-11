import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { SandboxResult } from "./sandbox.ts";

const _thisDir = dirname(fileURLToPath(import.meta.url));
const CHILD_SCRIPT = join(_thisDir, "sandbox-child.mjs");

export interface ProcRunOptions {
  timeoutMs?: number;    // default 2000
  memMb?: number;        // default 128
  vmTimeoutMs?: number;  // default half of timeoutMs
}

export async function runImplProc(
  code: string,
  entry: string,
  args: readonly unknown[],
  opts: ProcRunOptions = {},
): Promise<SandboxResult> {
  const timeoutMs = opts.timeoutMs ?? 2000;
  const memMb = opts.memMb ?? 128;
  const vmTimeoutMs = opts.vmTimeoutMs ?? Math.floor(timeoutMs / 2);

  const child = spawn(
    process.execPath,
    ["--permission", `--allow-fs-read=${CHILD_SCRIPT}`, `--max-old-space-size=${memMb}`, CHILD_SCRIPT],
    { stdio: ["pipe", "pipe", "pipe"] },
  );

  // Write input to stdin then close it
  const input = JSON.stringify({ code, entry, args: [...args], vmTimeoutMs });
  child.stdin.write(input);
  child.stdin.end();

  return new Promise<SandboxResult>((resolve) => {
    let stdout = "";
    let timedOut = false;
    let settled = false;

    const killTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });

    child.on("close", (code: number | null, signal: string | null) => {
      clearTimeout(killTimer);
      if (settled) return;
      settled = true;

      if (timedOut) {
        resolve({ ok: false, error: "timeout" });
        return;
      }

      if ((code !== 0 && code !== null) || signal !== null) {
        const detail = signal ?? `exit code ${code}`;
        resolve({ ok: false, error: `sandbox crashed: ${detail}` });
        return;
      }

      // Parse last ##RESULT## line
      const lines = stdout.split("\n").filter(l => l.startsWith("##RESULT##"));
      const last = lines[lines.length - 1];
      if (!last) {
        resolve({ ok: false, error: "no result from sandbox" });
        return;
      }
      try {
        const result = JSON.parse(last.slice("##RESULT##".length)) as SandboxResult;
        resolve(result);
      } catch {
        resolve({ ok: false, error: "no result from sandbox" });
      }
    });

    child.on("error", (err: Error) => {
      clearTimeout(killTimer);
      if (settled) return;
      settled = true;
      resolve({ ok: false, error: `sandbox crashed: ${err.message}` });
    });
  });
}
