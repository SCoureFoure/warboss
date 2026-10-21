# Research slice: official Anthropic facts on caching + context cost (as of Oct 2026)

verify_kind: research (no repo change; WARBOSS judges the facts). Today is 2026-10-21.
Write findings ONLY to `C:/Users/SCora/Documents/Repositories/warboss/.warboss-horde/out/research-official.md`. Touch no other file.

## Why
In our Claude Code sessions, cache_read + cache_write dominate cost (output/input are minor). The orchestrator
(main agent) re-reads its whole transcript every API call. We need hard, current facts to design cost cuts.

## Questions (answer each; cite URL + publish/updated date for every claim; prefer sources dated 2026, newest first)
1. Current API price sheet for every Claude model live in Oct 2026 (Opus 5.5, Fable 5.1, Sonnet 5.5, Haiku 5.5, and any
   still-served 4.x): input, output, cache write 5-minute, cache write 1-hour, cache read, $/MTok. Note long-context
   (>200k) surcharges if any.
2. Prompt caching mechanics: TTL options, minimum cacheable length per model, max breakpoints, what invalidates a
   cache prefix (tools change, system change, model switch, thinking params, images), whether cache is shared between
   a parent agent and its subagents, automatic vs explicit cache_control.
3. Claude Code specifics: how it places cache breakpoints, its default TTL (5m vs 1h) and whether configurable,
   auto-compact threshold and what compaction costs (does it rewrite the cache), `/compact`, `/clear`, context
   editing / tool-result clearing, the memory tool, deferred tool loading (ToolSearch), skill loading cost, subagent
   context isolation, any settings/env vars that affect token use (e.g. MAX_THINKING_TOKENS, autocompact percent,
   output caps). Anything Anthropic published in 2026 on "context engineering" or reducing Claude Code cost.
4. API-level features that cut input/cache cost: context editing (clear_tool_uses, clear_thinking), compaction API,
   token-efficient tool use, memory tool, server-side tool search, programmatic tool calling, batch discount.
5. Any Anthropic guidance on cost of thinking tokens in multi-turn agent loops (are prior thinking blocks re-billed
   as cache read?).

## Output format (the file)
- Section per question, bullet facts, each ending `[source: URL, date]`.
- A final section `## Levers for an orchestrator whose cost is 90%+ cache read` — up to 10 bullets, each naming the
  mechanism, the expected effect on cache_read vs cache_write, and the source.
- Mark anything you could not confirm from a 2026 source as `UNCONFIRMED`. Never invent a number.
- Max ~900 lines. Your final reply to me: ≤10 lines, the path, and the 3 most cost-relevant facts.
