---
name: resume
description: Boot a fresh session from the repo's ground truth instead of resuming an old transcript. Use right after /clear when the idle-relay hook said the prompt cache expired, or when the user says "resume", "pick up where we left off", or "what were we doing".
---

# Resume (boot from ground truth)

A session resumed after a long idle gap re-writes its whole transcript into the prompt cache, and then re-reads it
on every later call. A fresh session that reads the work itself is much cheaper — the audit measured the idle relay
at about 15% of total spend. The ant principle: the next carrier is informed by the load, not by the previous
carrier's memory.

1. Run, once, and read its output:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/resume-brief.mjs"
   ```

   It prints the branch, the last 10 commits, the working tree, the newest slice contracts, the latest verdicts,
   and the head of `TODO.md`. That is the whole handoff — do not go looking for the old transcript.
2. Say in two or three lines where the work stands and what the obvious next step is.
3. If the next step is clear from the brief, start it. If it is not, ask the user one question. Read a slice file
   or a source file only when the next step needs it, never "for context".

Do not re-derive decisions that are already committed or recorded in a slice; the brief points at them.
