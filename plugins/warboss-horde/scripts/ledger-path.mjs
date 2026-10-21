// warboss-horde ledger location — shared by both meters.
//
// The ledger root is the session's STARTING cwd (first `cwd` recorded in the
// parent transcript), so one session writes to one ledger even if the live cwd
// drifts. Falls back to the hook cwd when the parent transcript is unavailable.
// That root is then resolved upward to the nearest directory owning a
// `.warboss-horde/` directory, so a session started in a subdirectory uses its
// project's ledger.

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

// True when `dir/.warboss-horde` exists and is a directory; never throws.
function ownsWarbossHorde(dir) {
  try {
    return fs.statSync(path.join(dir, '.warboss-horde')).isDirectory();
  } catch {
    return false;
  }
}

// True when `dir/.git` exists (directory or file, as in worktrees and submodules); never throws.
function hasGitEntry(dir) {
  try {
    fs.statSync(path.join(dir, '.git'));
    return true;
  } catch {
    return false;
  }
}

// Nearest ancestor-or-self of `s` containing `.git`, or null when none up to the filesystem root.
function gitRootOf(s) {
  let dir = s;
  for (;;) {
    if (hasGitEntry(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// Nearest ancestor-or-self of `start`, bounded by its git repository root, that owns a
// `.warboss-horde/` directory. Returns `path.resolve(start)` when there is no owner
// between `start` and the repo root, or when `start` is not inside a git repository.
export function ownerDir(start) {
  const s = path.resolve(start);
  const root = gitRootOf(s);
  if (root === null) return s;
  let dir = s;
  for (;;) {
    if (ownsWarbossHorde(dir)) return dir;
    if (dir === root) return s;
    dir = path.dirname(dir);
  }
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
    if (root) return path.resolve(ownerDir(root), '.warboss-horde', 'ledger.jsonl');
  }
  return path.resolve(ownerDir(hook.cwd || process.cwd()), '.warboss-horde', 'ledger.jsonl');
}
