# Spec — intent-probe viability (split the nonviable rate; scaffold the probe)

> Status: active · rev 1 · Feature: intent-probe-viability · Added: 2026-06-13 · Maps to: Lever 1 (gate, behavioral line) + E3 rev-2 (`archive/reports/e3-verdict.md` §"Probe arm" + candidate #4).
> Source of truth for the E3 finding that the intent probe's nonviable rate was
> **4/8 (50%)**, leaving only 4 impls to vote per input — too thin for reliable
> split detection at k=8. E3 §probe-arm hypothesised the cause: the probe prompt
> carries only task prose + `Implement: <entry>`, with no instruction to define
> a callable top-level function, so some generations produce code that never
> exposes the entry — counted as "nonviable" indistinguishably from a genuine
> all-rejecting implementation. This spec (a) **splits** the nonviable bucket
> into `noEntry` (structurally never callable) vs `nonviable` (entry callable but
> rejects every input — a real behavioral datum), so the verdict can tell a
> defect from a signal; and (b) **scaffolds** the probe's default system string
> to demand a named top-level function, reducing `noEntry` at the source. The k
> lever (more votes) needs no code change — `--k` is already configurable.
> Depends on: `specs/readiness-gate.spec.md` rev 2 (`intentProbe` — this is its
> rev 3), `specs/e3-intent-divergence.spec.md` (the consumer), `src/sandbox.ts`
> (the missing-entry sentinel this classification keys on).

## Requirement

`intentProbe` (readiness-gate rev 3) classifies each GENERATED impl into exactly
one of three buckets — `noEntry`, `viable`, `nonviable` — and reports all three
counts on `IntentProbeVerdict`. `noEntry` impls (those that do not define the
entry as a callable function) are excluded from clustering and from the viable
denominator; only `viable` impls vote on splits (unchanged) and only `nonviable`
impls represent genuine all-input rejection. The default probe system string is
strengthened to require a top-level named function, reducing `noEntry` without
changing any caller; `opts.system` still overrides. The E3 runner surfaces the
three-way breakdown in its artifact and summary. Every existing offline test of
`intentProbe` whose impls define the entry keeps its `viable`/`nonviable`/`splits`
results unchanged.

## Constraints (inherited)

- **Grunt is a doer, not a planner.** Unchanged — one `Agent.generate` per
  generation; classification is post-hoc over sandbox results.
- **Cost-metered.** No new model call. The classification runs over the same
  generations already produced; cost is unchanged.
- **`node:vm` is not a security sandbox.** Classification keys on `runImpl`'s
  existing `{ ok, error }` result and the existing missing-entry sentinel — no
  new execution surface.

## Decisions (pinned 2026-06-13)

### Three-way classification (mechanical, keyed on the sandbox sentinel)

`src/sandbox.ts` `runImpl` reports an **input-independent** sentinel
`entry function '<entry>' is not defined` whenever `typeof entry !== "function"`
(`sandbox.ts:64`). That sentinel fires identically for every input, so one run
decides the structural question. Per generated impl (one that produced
extractable code):

1. **`noEntry`** — run the FIRST candidate input; if `!ok` AND `error` equals
   exactly `entry function '<entry>' is not defined` (with `<entry>` substituted)
   → classify `noEntry` and STOP (remaining inputs would all yield the same
   sentinel). Excluded from clustering, from the `viable` count, and from the
   split denominator.
2. **`viable`** — entry is callable (input[0] was `ok`, OR `!ok` with a
   different error) AND, running ALL inputs, ≥1 outcome is a non-throw success.
   Clustered exactly as today.
3. **`nonviable`** — entry is callable but EVERY input threw (no `ok`, and the
   input[0] error was not the missing-entry sentinel). This is a genuine
   all-rejecting impl (e.g. "every input is unrecognized → throw"), a real
   behavioral reading, kept as a distinct count (NOT folded into `noEntry`).

Invariant: `generated === noEntry + viable + nonviable` (AC-asserted). A vm
compile error or timeout on input[0] is NOT the missing-entry sentinel, so such
impls fall to `viable`/`nonviable` by their run outcomes — they are runtime
failures of existing code, not a missing entry (kills the "fold all failures
into noEntry" reading).

### Verdict shape (rev 3 — additive)

`IntentProbeVerdict` gains one field; all existing fields keep their meaning:

```ts
interface IntentProbeVerdict {
  k: number;
  generated: number;
  noEntry: number;      // rev 3: generated impls that never defined the entry
  viable: number;       // generated impls with ≥1 non-throw (unchanged meaning)
  nonviable: number;    // rev 3: NOW only entry-callable-but-all-throw (no longer includes noEntry)
  splits: readonly { inputIndex: number; input: readonly unknown[]; outcomes: Record<string, number> }[];
  decidedRate: number;  // (inputs.length - splits.length) / inputs.length; 0 when viable === 0 (unchanged)
  costUsd: number;
}
```

- **Behavior change, named:** before rev 3, `nonviable` counted every impl that
  threw on every input, INCLUDING missing-entry impls. After rev 3, missing-entry
  impls move to `noEntry`; `nonviable` shrinks to genuine all-reject. A fixture
  whose all-throw impl actually defines the entry keeps `nonviable: 1`; a fixture
  whose all-throw impl is empty/garbage moves to `noEntry: 1`. Existing tests
  whose all-throw fixtures define the entry are unaffected; any that relied on a
  no-entry fixture counting as `nonviable` must be updated to expect `noEntry`
  (call it out in the test diff, not a silent change).

### Scaffolded default system string (rev 3)

`PROBE_DEFAULT_SYSTEM` becomes (exact):

```
Implement the requested function in JavaScript. Define it as a top-level named function with exactly the requested name. Output ONLY one fenced code block. No prose.
```

- This is the DEFAULT only; `opts.system` still overrides verbatim (unchanged).
  `convergenceProbe` shares `PROBE_DEFAULT_SYSTEM` — the strengthened string
  applies there too and is strictly compatible (it already wants a callable
  impl), so its existing tests stand.
- The scaffold's effect on the live `noEntry` rate is a measurement, not an
  offline assertion (a fake client ignores the system string). Offline we
  capture-assert the new default string value and that `opts.system` overrides.

### E3 surfacing (the only change to `e3.ts` from this spec)

- The E3 artifact's `probe` block already embeds `IntentProbeVerdict` verbatim,
  so `noEntry` appears automatically. The console summary line gains the count:
  `Probe arm: generated=… noEntry=… viable=… nonviable=… splits=… decidedRate=…`.
- `evaluateE3Criterion`'s degenerate guard stays `viable === 0`; its detail
  string additionally names `noEntry` when `viable === 0` (so a dead probe says
  whether it died from missing entries vs all-reject). No criterion logic change.

### Scope fence

Does NOT change `decidedRate`'s formula, the split rule (≥2 distinct keys among
viable), the candidate inputs, the needle lists, or the E3 criterion. Does NOT
change `k`'s default (8) — raising k is a run-time flag, not a code change.

## Acceptance criteria (Given / When / Then)

1. **AC1 — noEntry classification.** A generated impl whose code does not define
   the entry (e.g. defines `foo` when entry is `parseDuration`) → counted in
   `noEntry`, NOT in `viable` or `nonviable`; it contributes nothing to any
   split; only input[0] is executed for it (assert via a spy/timeout-free
   fixture that a second input is never run, or assert behaviorally that its
   outcomes never appear in `splits`).
2. **AC2 — nonviable is now entry-callable all-throw only.** A generated impl
   that DEFINES the entry but throws on every candidate input → `nonviable: 1`,
   `noEntry: 0`, excluded from `splits` (no non-throw to cluster). A second
   fixture identical but with the entry undefined → `noEntry: 1`, `nonviable: 0`.
3. **AC3 — invariant.** Over a mixed k-impl fixture (some no-entry, some
   all-throw-with-entry, some viable), `generated === noEntry + viable +
   nonviable`, and `viable`/`splits`/`decidedRate` equal the hand-computed values
   considering ONLY the viable impls.
4. **AC4 — back-compat for entry-defining fixtures.** A pre-rev-3
   `intentProbe` test fixture whose impls all define the entry → identical
   `viable`, `nonviable`, `splits`, `decidedRate` as before (re-run the existing
   test unmodified; `noEntry` is `0`).
5. **AC5 — scaffolded default string.** `PROBE_DEFAULT_SYSTEM` equals the exact
   rev-3 string above (grep/capture-assert); a call passing `opts.system: "X"`
   uses `"X"` verbatim (capture-assert the dispatched system field), proving the
   default is overridable.
6. **AC6 — E3 surfacing.** In an E3 offline run, the artifact's `probe.noEntry`
   is present and the console summary line includes `noEntry=<n>`; when
   `viable === 0` the `e3Criterion.detail` names the `noEntry` count.

## Verifies-with

- Tests: `test/gate.test.ts` — AC1–AC5 (beside the existing `intentProbe`
  cases). `test/e3.test.ts` — AC6. Offline, fake `MessagesClient` returning
  canned impls.
- Integration (folded into the next live E3 re-run — no separate spend): compare
  `noEntry` vs `nonviable` against E3's 4/8; the scaffolded prompt should move
  most of the old nonviable count into a low `noEntry` and reveal whether the
  remaining `nonviable` is genuine all-reject. If `noEntry` stays high even with
  the scaffold, the next lever is raising `--k` (more viable voters) — recorded,
  not built here.
- Falsifies / experiment link: n/a (instrument-hygiene + measurement). It makes
  the E3 verdict able to distinguish a probe defect (`noEntry`) from a probe
  signal (`nonviable` all-reject), which the kick-back thesis needs to trust the
  probe's silence on bare-number/whitespace as behavioral consensus rather than
  broken impls.
