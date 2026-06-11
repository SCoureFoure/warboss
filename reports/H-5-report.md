Done: src/experiment/analysis.ts, src/experiment/e1a.ts, src/experiment/rescore.ts (new), package.json, test/e1a.test.ts
Deviations: Also updated defaultAnalysis in e1a.ts to include modalShare:0 (required at runtime; typecheck had passed due to `as` cast but runtime would fail without it)
Gaps found: None
Verify: npm run typecheck → clean (0 errors); npm test → 76/76 pass (was 74; +1 extra C1 fail case in AC9, +AC17, +AC18)
Cost/time: ~5 min
