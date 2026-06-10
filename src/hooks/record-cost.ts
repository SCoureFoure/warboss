/**
 * Cost-metering hook entry point — runs on Stop (the main turn = the deciding
 * layer: warboss/warchief/sergeant) AND SubagentStop (a dispatched grunt). One
 * script, one ledger, role-tagged by `--kind`. Every request is tracked; the
 * tag says which JOB it was, not whether to meter it — the thesis ("meter every
 * worker") applied to our own build loop, and the foundation a later effort/cost
 * dashboard tallies against.
 *
 * On stdin Claude Code hands JSON with `transcript_path`, `session_id`, `cwd`.
 * We parse the transcript, price every not-yet-recorded assistant message, and
 * append rows to runs/dev-cost-ledger.jsonl. Dedup is by message uuid against
 * the existing ledger, so this is idempotent and safe to fire repeatedly (Stop
 * fires on every turn against a growing transcript — only new messages append).
 *
 * Always exits 0 — a metering hook must never block or fail the agent it
 * observes. Wired in .claude/settings.json under hooks.Stop and
 * hooks.SubagentStop. Run standalone with:
 *   echo '{"transcript_path":"...","session_id":"..."}' | npx tsx src/hooks/record-cost.ts --kind claudecode.main
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { extractCostRows } from "./cost-from-transcript.ts";

interface HookInput {
  transcript_path?: string;
  session_id?: string;
  cwd?: string;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/** The role tag for this hook's rows (e.g. claudecode.main | claudecode.subagent). */
function parseKind(argv: readonly string[]): string | undefined {
  const i = argv.indexOf("--kind");
  return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : undefined;
}

function seenUuids(ledgerPath: string): Set<string> {
  const seen = new Set<string>();
  if (!existsSync(ledgerPath)) return seen;
  for (const line of readFileSync(ledgerPath, "utf8").split("\n")) {
    if (line.length === 0) continue;
    try {
      const r = JSON.parse(line) as { uuid?: string };
      if (r.uuid !== undefined) seen.add(r.uuid);
    } catch {
      // tolerate a partially-written or hand-edited ledger line
    }
  }
  return seen;
}

async function main(): Promise<void> {
  let input: HookInput;
  try {
    // Strip a leading BOM (U+FEFF) — some shells prepend one when piping stdin.
    const raw = await readStdin();
    const clean = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    input = JSON.parse(clean) as HookInput;
  } catch {
    return; // no/garbled stdin — nothing to do
  }

  const transcriptPath = input.transcript_path;
  if (transcriptPath === undefined || !existsSync(transcriptPath)) return;

  const kind = parseKind(process.argv.slice(2));
  const projectDir = process.env["CLAUDE_PROJECT_DIR"] ?? input.cwd ?? process.cwd();
  const ledgerPath = join(projectDir, "runs", "dev-cost-ledger.jsonl");

  const rows = extractCostRows(readFileSync(transcriptPath, "utf8"), seenUuids(ledgerPath), {
    ...(input.session_id !== undefined ? { sessionId: input.session_id } : {}),
    ...(kind !== undefined ? { kind } : {}),
  });
  if (rows.length === 0) return;

  mkdirSync(dirname(ledgerPath), { recursive: true });
  appendFileSync(ledgerPath, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

main().catch(() => {
  // Metering must never break the observed agent. Swallow and exit clean.
});
