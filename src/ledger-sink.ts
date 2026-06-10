/**
 * Durable cost-log sink for the Ledger.
 *
 * The thesis is settled on correctness-per-dollar, so the cost record has to
 * outlive the process: a long experiment that dies mid-run must still leave a
 * parseable, account-reconcilable trail. `jsonlFileSink` appends one JSON line
 * per model call the moment it completes — append-only, crash-safe, greppable,
 * one row per `request-id` so it joins against the Anthropic console usage logs.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { LedgerEntry, LedgerSink } from "./cost.ts";

/** A sink that appends each entry as one JSON line to `filePath`. */
export function jsonlFileSink(filePath: string): LedgerSink {
  mkdirSync(dirname(filePath), { recursive: true });
  return (entry: LedgerEntry) => {
    appendFileSync(filePath, JSON.stringify(entry) + "\n");
  };
}
