// warboss-horde ledger location — shared by both meters.
//
// The ledger root is the session's STARTING cwd (first `cwd` recorded in the
// parent transcript), so one session writes to one ledger even if the live cwd
// drifts. Falls back to the hook cwd when the parent transcript is unavailable.

import fs from 'node:fs';
import path from 'node:path';

const HEAD_BYTES = 65536;

// True when `file` exists and is a regular file; never throws.
function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

// First `cwd` (non-empty string) in the first HEAD_BYTES of the parent transcript, or null.
function startingCwd(hook) {
  const dir = path.dirname(hook.transcript_path);
  const candidates = [
    path.join(dir, hook.session_id + '.jsonl'),
    path.resolve(dir, '..', '..', hook.session_id + '.jsonl'),
  ];
  for (const file of candidates) {
    if (!isFile(file)) continue;
    let fd;
    try {
      fd = fs.openSync(file, 'r');
      const buf = Buffer.alloc(HEAD_BYTES);
      const n = fs.readSync(fd, buf, 0, HEAD_BYTES, 0);
      const lines = buf.toString('utf8', 0, n).split(/\r?\n/);
      for (const line of lines) {
        let rec;
        try {
          rec = JSON.parse(line);
        } catch {
          continue;
        }
        if (rec && typeof rec.cwd === 'string' && rec.cwd) return rec.cwd;
      }
      return null;
    } catch {
      return null;
    } finally {
      if (fd !== undefined) {
        try {
          fs.closeSync(fd);
        } catch {
          /* ignore */
        }
      }
    }
  }
  return null;
}

// Absolute path of the ledger file for this hook payload and env.
export function ledgerFileFor(hook, env) {
  if (typeof env.WARBOSS_LEDGER === 'string' && env.WARBOSS_LEDGER) {
    return path.resolve(env.WARBOSS_LEDGER);
  }
  if (
    hook.transcript_path && typeof hook.transcript_path === 'string' &&
    hook.session_id && typeof hook.session_id === 'string'
  ) {
    const root = startingCwd(hook);
    if (root) return path.resolve(root, '.warboss-horde', 'ledger.jsonl');
  }
  return path.resolve(hook.cwd || process.cwd(), '.warboss-horde', 'ledger.jsonl');
}
