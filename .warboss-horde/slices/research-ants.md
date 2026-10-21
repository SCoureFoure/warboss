# Research slice: ant cooperative transport papers -> warboss token economics (2026-10-21)

verify_kind: research. Write ONLY to `C:/Users/SCora/Documents/Repositories/warboss/.warboss-horde/out/research-ants.md`.
First read `C:/Users/SCora/Documents/Repositories/warboss/.warboss-horde/slices/research-thermo-common.md` for the
system facts (context = fluid re-read every call; cost ~ prefix x calls, quadratic in session length).

## Sources (fetch each; read methods + results, not only abstracts)
1. https://elifesciences.org/articles/55195  (Gelblum et al. 2020, eLife, disordered environments)
2. https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1006068  (Ron et al. 2018, bi-stability)
3. https://www.pnas.org/doi/10.1073/pnas.1611509113  (Gelblum et al. 2016, ant pendulum)
4. https://www.nature.com/articles/ncomms8729  (Gelblum et al. 2015, transiently informed individuals)
5. Feinerman et al. 2018 Nature Physics "The physics of cooperative transport in groups of ants" — try to fetch;
   if paywalled, use what the other four cite about it and say so.

## Claims to VERIFY (each: CONFIRMED / WRONG / PARTLY, with quote or figure ref + numbers)
C1. A newly attached informed ant steers only briefly, then becomes a conformist; give the measured duration/decay.
C2. Non-informed ants align with the force they feel through the load (no ant-to-ant signalling); the load's
    motion carries the group's directional memory.
C3. The group operates near a critical point where one informed ant's small force is maximally amplified;
    give the model (Ising-like? parameters) and how group size moves the system relative to criticality.
C4. Ants attach/detach continually (turnover); give attachment times / turnover rates.
C5. Blocked by an obstacle, the load enters an oscillatory phase that acts as search; what sets period/amplitude,
    how group size affects escape.
C6. Bi-stability: persistent vs diffusive/stuck modes; what triggers switching.
C7. eLife: how collective persistence + individual scouts navigate a maze without global map; dead-end recovery;
    any efficiency numbers vs random/optimal.

## Then map (be concrete and quantitative where the papers give numbers)
- For each confirmed mechanism: `ant quantity <-> warboss quantity`, the design it suggests, and `strong` vs
  `metaphor`. Candidate designs already proposed (test them against the papers, refine or reject):
  relay orchestration (short orchestrator tenure, fresh one boots from work state not prose handoff);
  steering-vector protocol (orchestrator emits tiny direction signals, doers carry); pendulum mode on stall
  (cheap parallel oscillating attempts, orchestrator wakes on escape); persistent vs diffusive orchestrator modes;
  scouts ahead of the load.
- Add any NEW mechanism from the papers we missed (e.g. how informed-ant influence scales with group size, the
  optimal number of informed ants, the cost of too much conformity / too much individuality).
- Is there a quantity in the papers that maps onto our optimal orchestrator tenure (n* ~ 25-30 calls), e.g.
  an optimal informed-time or persistence length? Say if the analogy breaks.

## Output
Sections: Verification table (C1-C7) / Per-paper key results with numbers / Mappings / New designs (<=5) /
One falsifiable experiment per top design (offline on Claude Code transcripts if possible).
No invented numbers; quote figures. Max ~400 lines. Final reply: <=8 lines, path, which claims were wrong, top
new insight.
