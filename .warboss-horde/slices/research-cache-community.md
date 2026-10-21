# Research slice: community / OSS / papers on cutting agent context cost (as of Oct 2026)

verify_kind: research (no repo change; WARBOSS judges the facts). Today is 2026-10-21.
Write findings ONLY to `C:/Users/SCora/Documents/Repositories/warboss/.warboss-horde/out/research-community.md`. Touch no other file.

## Context
We build `warboss-horde`, a Claude Code plugin: an expensive orchestrator decides, cheap subagents (haiku/sonnet)
implement and run commands. Measured: orchestrator cost is ~97% transcript replay (cache_read), plus cache_write
on growth. Each subagent dispatch pays its own fresh cache_write. We want ideas to cut cache_read and cache_write.

## Tasks (cite URL + date for each item; prefer 2026 sources, newest first)
1. The user said "look for inspiration in places like jev". Identify what "jev" most likely refers to in the
   Claude Code / coding-agent token-optimization space (a GitHub repo, tool, plugin, blog, person). Give the top
   candidates with evidence; if one is clearly it, summarize its techniques in depth. Do NOT guess silently —
   list candidates if unsure.
2. Survey tools/plugins that cut Claude Code or coding-agent token spend: e.g. rtk (Rust Token Killer), caveman,
   context compressors, MCP output trimmers, repo-map/indexing tools, session-handoff tools, ccusage-style
   analyzers. For each: technique, which token class it cuts (cache_read / cache_write / input / output),
   claimed savings and whether measured.
3. Papers / engineering posts (2025-2026) on agent context management: observation masking vs LLM summarization,
   context folding, sub-agent isolation, compaction cadence, KV/prompt-cache-aware agent design, "context rot",
   token budgets in multi-agent systems. Pull the quantitative results.
4. Any published measurements of multi-agent orchestration cost in Claude Code (subagent overhead, cost of
   orchestrator vs workers, cache hit rates).
5. Experiment-design ideas: how others A/B test token-cost changes in agent harnesses (fixed task suites, replay,
   metrics like cost-per-solved-task).

## Output format (the file)
- One section per task. Bullets, each ending `[source: URL, date]`.
- A final section `## Candidate techniques for warboss` — up to 15 bullets: technique, mechanism, token class hit,
  evidence strength (measured / claimed / idea), source.
- Never invent numbers or repos; mark unverified as `UNCONFIRMED`. Max ~900 lines.
- Final reply to me: ≤10 lines — path, what "jev" is (or candidates), top 3 techniques.
