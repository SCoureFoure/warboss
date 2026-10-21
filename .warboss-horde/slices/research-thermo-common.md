# Shared brief: context as a fluid, re-reading as waste (2026-10-21)

## The system we are optimizing (facts, measured)
- Claude Code orchestrator agent. Every API call re-sends its WHOLE transcript (system + tools + history). Cached
  prefix bills at "cache_read" (Opus 5.5: $0.20/MTok); new tokens appended to the prefix bill at "cache_write"
  ($5/MTok on a 5-min cache, $8 on 1-h). A write is 25x a read (50x on Fable 5.1).
- Cache entries expire after a TTL (5 min or 1 h) of disuse; after expiry the whole prefix is re-written.
  Anything that changes an early byte (model switch, tool list change, compaction, editing history) invalidates
  everything after it -> full re-write.
- Measured over 195 sessions: orchestrator = 98% of spend. Each token in its transcript is re-read 50-170 times
  per session. Cost ~= (prefix size) x (number of calls), summed. Output tokens are a minor share.
- Subagents (cheap models) start with a fresh, separate cache; they never read the parent's cache. They return a
  short text result into the parent's transcript, where it is then re-read on every later parent call.
- Files on disk cost nothing until read. A read pulls the content into the transcript permanently (re-read every
  later call) unless the session restarts.
- Tools we control: hooks that trim tool output before it enters the transcript; subagents; session restart with
  a handoff file; cache TTL setting; how terse returns are; how many calls the orchestrator makes.

## The Leader's ask
"We don't want re-reading — that is the biggest waste of energy. Research how you conserve energy in a system
without waste. Think of tokens and context more like a FLUID and less like an information layer. It's okay to be
creative."

## Required output shape (both lenses)
1. **Principles** — 8-15 real principles from your lens. For each: the principle stated correctly (with the real
   equation or law where one exists), a citation (textbook, paper, or reputable URL), then the mapping:
   `physical quantity <-> context quantity`, and the concrete warboss/Claude Code design it suggests.
   Mark a mapping `strong` (the math actually transfers) or `metaphor` (suggestive only). Be honest.
2. **A conservation equation for a session** — write the cost of a session as a flow/energy balance in your
   lens's terms (e.g. inflow, storage, dissipation, leakage). State what the "ideal" (zero-waste) limit is and
   what makes real sessions depart from it.
3. **Novel designs** — 5-8 designs that do not appear in ordinary "context engineering" advice. Each: mechanism,
   which cost term it attacks (cache_read volume, cache_write events, TTL leakage, call count), a back-of-envelope
   saving using the numbers above, and the main risk.
4. **Experiments** — for the best 3 designs, a falsifiable experiment: what to measure from Claude Code transcript
   usage fields (input_tokens, cache_read_input_tokens, cache_creation_input_tokens, timestamps), the prediction,
   and what result would kill the idea. Prefer experiments that can run offline on existing transcripts first.
- No invented citations or numbers. Speculation is welcome but labelled `speculative`. Max ~500 lines.
