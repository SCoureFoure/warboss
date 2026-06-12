# Spec — warboss-decomposition (intent → requirements → frozen contracts)

> Status: active · **rev 4** (2026-06-12: underdetermined-semantics kick-back, driven by the E2 measurement `reports/e2-verdict.md` — (1) fiat-flagging: every requirement carries a `resolutions` array naming each semantic choice and whether the intent forced it (`basis: "intent"`) or the warboss chose by fiat (`basis: "fiat"`); fiat entries escalate to God; (2) audit gaps are classified `intentDecides: true|false` — intent-undecided gaps are NEVER self-amended, they escalate; (3) `admit` drops the introspective `gruntJudge` from the decision path (three calibration FAILs: `reports/gate-calibration-verdict.md`, `reports/derive-calibration-verdict.md`, E2 admit-in-anger 0-questions miss) — the convergence probe is the only admission instrument, fail-closed when no battery; (4) `maxRequirements` is injected into the decompose prompt, closing the H-14 gap where the cap was post-validation only) · rev 3 2026-06-11: H-9 gaps closed — audit double parse-failure pinned to sentinel (was silent fail-open), `auditGaps` entry format pinned, audit prompt cosmetic fixed to match code; AC10/AC11 added · rev 2 2026-06-10: entropy-reduction mandates in `DECOMPOSE_SYSTEM` · Feature: warboss-decomposition · Added: 2026-06-10 · Maps to: PLAN Phase 4 (warboss decomposition) + E2 substrate
> Source of truth for the machine that manufactures the membrane: a HIGH-tier
> warboss takes God's intent and emits requirements, each carrying acceptance
> examples (AHN bootstrap rule), each frozen into an executable contract, each
> admitted or kicked back by the readiness gate before any grunt sees it.
> **This is where the thesis most plausibly dies** (a warboss that writes
> partial contracts triggers Corollary D) — so the error-coverage mandate from
> E1a-r2 is enforced MECHANICALLY here, and E2 later measures the output's
> quality against human-authored contracts. Depends on:
> `specs/readiness-gate.spec.md` (admission), `specs/loop-core.spec.md`
> (downstream dispatch), `specs/sandbox-hardening.spec.md` (non-pure tasks).

## Requirement

Given an intent (prose) the harness can produce a validated draft set: a list
of requirements, each with an entry-point name, a type signature, acceptance
examples including at least one error-behavior example, and a `resolutions`
record naming every semantic choice the requirement makes together with its
basis (`intent` = the intent forces it; `fiat` = the warboss chose); freeze
each requirement into a contract; run a model self-audit pass that names
behaviors the examples fail to pin AND classifies each gap by whether the
intent decides it — intent-decided gaps are amended once, intent-undecided
gaps are escalated, never self-amended; surface every fiat resolution and
every escalated gap in `DraftSet.escalations` as God-facing kick-back
questions; and partition the frozen contracts through the convergence probe
into admitted contracts and kicked-back contracts with their disagreement
questions (fail-closed when a contract has no probe battery). Every model
call is metered and tagged by phase. The default test path is offline via the
injected fake client.

**Why rev 4 (the E2 lesson, binding):** the 2026-06-12 E2 measurement proved
that once a fiat resolution is frozen into a dense contract, NO downstream
instrument can detect it — grunts converge deterministically on the frozen
choice (every E2 per-case rate was 0/30 or 30/30), so behavioral divergence is
destroyed by the freeze itself, and introspective judges were already
triple-falsified. Both E2 happy-path losses (`"120"` bare-number,
`" 1h 30m "` whitespace) were underdetermined-intent points the warboss
resolved silently. The kick-back therefore MUST fire at the author tier,
before freezing — this is [[entropy-control-at-author-tier]] applied to the
warboss itself: control the HIGH tier through its prompt and schema; do not
ask a LOW tier to feel ambiguity.

## Constraints (inherited)

- **Cost-metered.** Warboss calls are HIGH-tier — the most expensive tokens in
  the system. Every call is tagged (`phase: decompose | audit | amend`) so the
  E2 economics split (authoring cost vs grinding cost) is computable from the
  ledger alone.
- **Membrane immutability.** Contracts are frozen via `Contract.freeze` and
  never mutated after; the amend pass produces NEW frozen contracts (version
  bump), it does not edit frozen ones. Amendments walk down from intent, never
  up from implementation.
- **Error-coverage mandate (E1a-r2, binding):** every requirement MUST carry
  ≥ 1 error-behavior example (`throws: true` or an explicit error-value
  example). Enforced by mechanical validation — a draft violating it is
  rejected with the requirement named, regardless of how good the model's
  output looks. This is Corollary D's known hole closed at the authoring
  source.
- **Adjacent-rank comms.** The warboss emits contracts; it never dispatches
  grunts and never sees grunt output. `decompose`/`audit`/`admit` produce
  artifacts for the NEXT rank down — no grunt-facing surface in this module.
- **Fail-up applies to the warboss too:** a kicked-back contract (gate NOT
  READY) is surfaced with its questions; this module never silently re-rolls
  the model until the gate passes (that would be burning money to hide an
  underspecification signal).
- **Reuse, don't rebuild:** freezing is `Contract.freeze`; admission is
  `convergenceProbe` from `gate.ts` (rev 4 — `gruntJudge` unwired, kept
  exported for calibration sweeps only); metering is `Agent`/`Ledger`. This
  module is orchestration + validation only.

## Decisions (pinned 2026-06-10)

### API

```ts
src/warboss.ts:

  decompose(opts: DecomposeOptions): Promise<DraftSet>
  admit(draft: DraftSet, opts: AdmitOptions): Promise<AdmissionReport>

  interface DecomposeOptions {
    agent: Agent;                  // HIGH tier by policy (caller passes it)
    intent: string;                // God's goal, prose
    context?: string;              // optional constraints (stack, environment)
    maxRequirements?: number;      // default 8; more → reject (decompose further up, not wider here)
    tags?: Record<string, string | number>;
  }

  interface Resolution {                 // rev 4
    point: string;                 // the behavior the intent leaves open, one sentence
    chosen: string;                // the behavior the examples now pin, one phrase
    basis: "intent" | "fiat";      // intent = forced by the intent text; fiat = warboss's coin flip
  }

  interface RequirementDraft {
    id: string;                    // kebab-case, unique
    requirement: string;           // prose, self-contained
    entry: string;                 // function name (valid JS identifier)
    signature: string;             // e.g. "(s: string) => number"
    examples: ContractCase[];      // ≥ 2 total, ≥ 1 with throws:true or error expected
    resolutions: Resolution[];     // rev 4: MANDATORY field (may be empty); shape-checked
  }

  interface DraftSet {
    requirements: readonly RequirementDraft[];
    contracts: readonly Contract[];      // one per requirement, frozen, version "1"
    auditGaps: readonly string[];        // unpinned-but-amendable behaviors REMAINING after the
                                         // amend round; each entry is exactly `${id}: ${gap}`
                                         // (rev 3, pinned). One non-requirement entry possible:
                                         // the audit-unavailable sentinel (see stage 4) — its
                                         // "id" is `<audit-unavailable>`, which cannot collide
                                         // with kebab-case requirement ids.
    escalations: readonly string[];      // rev 4: God-facing kick-back questions. Two sources,
                                         // exact formats pinned (see "Escalations"):
                                         //   fiat resolution → `${id}: fiat — ${point} → ${chosen}`
                                         //   intent-undecided audit gap → `${id}: intent-undecided — ${gap}`
    costUsd: number;
  }

  interface AdmitOptions {
    probe: {                             // rev 4: REQUIRED — the probe IS the gate
      agent: Agent;
      probes: ReadonlyMap<string, readonly ContractCase[]>; // requirement id → probe battery
      k?: number;
    };
    tags?: Record<string, string | number>;
  }
  // rev 4: `judgeAgent` is DELETED. gruntJudge is unwired from admission —
  // three independent calibration FAILs (anti-correlated READY rates, derive
  // false positives, E2 admit-in-anger 0-questions miss). The instrument
  // stays exported from gate.ts for calibration sweeps only.

  interface AdmissionReport {
    admitted: readonly Contract[];
    kickedBack: readonly {
      contract: Contract;
      questions: readonly string[];      // probe disagreements, or the no-battery fail-closed question
    }[];
    costUsd: number;
  }
```

### Decompose pipeline (exactly these stages, in order)

1. **Call 1 — decompose.** One HIGH-tier `Agent.generate`
   (`kind: "warboss.decompose"`). System prompt (exact, rev 4):
   `You are a warboss: you convert intent into requirements so decided that the cheapest implementer cannot misread them. State every behavior as a mechanical rule (input → output), never as intent. A rule no example can falsify is forbidden. If a sentence allows two readings, add the example that kills the wrong one. If behavior depends on order or state (sequences, retries, resets), include one example per distinct transition. Where the intent does not decide a behavior and you chose one, you MUST record that choice in the requirement's resolutions array with basis "fiat"; record choices the intent itself forces with basis "intent". A choice baked into examples without a resolutions entry is a defect. Output ONLY one fenced json block matching the requested schema. Every requirement must include at least one error-behavior example (invalid input → throws). No prose outside the fence.`
   _(rev 2: the four entropy-reduction sentences were added after H-6 — a
   grunt implemented a coherent misreading of a two-readings spec sentence
   whose violation no AC detected. The control point is the author tier:
   the warboss carries the decidedness burden; the implementer stays a
   simple machine. Same rule applied to our own dev specs in
   `specs/README.md` Rules. rev 4: the three fiat-flagging sentences were
   added after E2 — the warboss authored 3 deliberate whitespace-throws
   examples without ever reporting "the intent did not tell me this".)_
   User prompt: the intent, the optional context, **the requirement-count cap
   (rev 4, exact line: `At most ${maxRequirements} requirement(s). If the
   intent needs more, it must be decomposed further UP the chain — do not
   exceed the cap.` — closes the H-14 gap where the cap was post-validation
   only and a live run fail-closed on 6 requirements)**, and the JSON schema
   of `RequirementDraft[]` including the `resolutions` field (the schema text
   is a pinned constant in the module, not re-derived per call).
   `maxTokens: 8192`.
2. **Parse strictly.** Extract the fenced json block; `JSON.parse`; shape-check
   every field. On ANY parse/shape failure: ONE re-ask — same conversation
   shape, the previous (truncated to 2000 chars) output and the specific error
   appended, `kind: "warboss.decompose"` again. Second failure → throw
   `DecompositionParseError` (carries both raw outputs). Never a third call.
3. **Mechanical validation (no model).** Reject with a descriptive error
   naming the offending requirement/field on: duplicate ids; id not
   kebab-case; entry not a valid identifier; `< 2` examples; **no
   error-behavior example** (no case with `throws: true` — the mandate);
   duplicate example names within a requirement;
   `requirements.length > maxRequirements` or `=== 0`; **(rev 4)
   `resolutions` missing or not an array; a resolutions entry whose `point`
   or `chosen` is not a string, or whose `basis` is not exactly `"intent"`
   or `"fiat"`.** An empty `resolutions` array is legal (an intent may decide
   everything) — the field's presence is what is mandatory.
4. **Call 2 — self-audit.** One HIGH-tier call (`kind: "warboss.audit"`).
   System (exact, rev 4):
   `You wrote the following contracts. List every behavior a reasonable implementer could interpret in more than one way that the examples do not pin. For each, decide whether the original intent (quoted after the contracts) determines the correct behavior. Output ONLY one fenced json block: an array of {"id": "<requirement id>", "gap": "<one sentence>", "intentDecides": true or false}. Empty array if none.`
   User (rev 4): the validated requirement drafts as JSON, then two newlines,
   then the exact line `Original intent:` followed by the intent text (the
   audit cannot classify against an intent it cannot see). Parse with the
   same one-re-ask policy. (An empty gap array is a legal, good outcome.)
   **Gap classification parse rule (rev 4, fail-closed):** an entry whose
   `intentDecides` is not a boolean (missing, string `"true"`, anything else)
   is treated as `intentDecides: false` — when in doubt, escalate to the
   human rather than silently self-amend. Entries missing a string `id` or
   `gap` are dropped (unchanged from rev 3 filtering).
   **Audit double parse-failure (rev 3, pinned):** if the re-ask ALSO fails to
   parse, do NOT throw and do NOT treat it as "no gaps" — the run continues
   with the exact sentinel string
   `<audit-unavailable>: audit output unparseable after one re-ask`
   as the sole entry in `DraftSet.auditGaps`, and stage 5 (amend) is SKIPPED
   (gaps unknown → nothing to amend). Rationale: the audit is advisory and the
   drafts already passed mechanical validation; throwing would burn the paid
   decompose call over an advisory failure, while fail-open to `[]` would
   forge a clean audit. Fail-up = surface the unknown to the human.
5. **Call 3 — amend (only if amendable gaps ≠ []).** **Gap routing (rev 4,
   the load-bearing change):** partition the parsed gaps by `intentDecides`.
   - `intentDecides: true` (amendable) → the amend path below, unchanged.
   - `intentDecides: false` (intent-undecided) → **NEVER sent to amend.**
     Each lands in `DraftSet.escalations` formatted exactly
     `${id}: intent-undecided — ${gap}`. Rationale: amending an
     intent-undecided gap means the warboss invents the resolution — exactly
     the silent fiat that produced both E2 happy-path losses. The question
     goes up the chain; only God (or a rank with intent authority) may
     resolve it.
   One HIGH-tier call (`kind: "warboss.amend"`): the drafts + the AMENDABLE
   gap list only (capture-assertable — no intent-undecided gap text may
   appear in the amend prompt), instruction to add examples that pin each
   gap (same schema out). Re-run stage-3 validation on the amended drafts.
   Exactly ONE audit→amend round — amendable gaps still unpinned after the
   round (i.e. gaps the amend did not address) land in `DraftSet.auditGaps`,
   each formatted exactly `${id}: ${gap}` (rev 3, pinned). Bounded cost; no
   convergence loops.
6. **Freeze.** Each final draft →
   `Contract.freeze({ requirement, entry, version: "1", examples })`
   (`resolutions` is draft metadata — it is NOT part of the frozen contract
   canonical form; freezing is unchanged and hashes stay stable for drafts
   with identical requirement/entry/version/examples).
   `DraftSet.costUsd` = sum of all calls in stages 1–5.

### Escalations (rev 4 — the God-facing kick-back channel)

`DraftSet.escalations` is the up-the-pyramid output: the list of questions
this decomposition could not decide without inventing intent. Pinned rules:

- **Sources and exact formats** (full-string, test-assertable):
  - every resolution with `basis: "fiat"` (post-amend drafts) →
    `${id}: fiat — ${point} → ${chosen}`
  - every intent-undecided audit gap → `${id}: intent-undecided — ${gap}`
- **Ordering:** fiat entries first, in requirement order then array order;
  then intent-undecided entries in audit-output order.
- **Escalations do NOT block freezing.** Contracts freeze with the fiat
  choices their examples pin — a downstream consumer (E3, a future sergeant
  layer, God) decides whether an escalated contract may dispatch or must be
  re-authored with a ruling. The decomposition's job is to SURFACE, not to
  stall (mirrors the rev-3 audit-sentinel philosophy: surface the unknown,
  keep the artifact usable).
- `escalations: []` is the good outcome: intent decided everything.

### Admission (`admit`) — rev 4: probe-only, fail-closed

- For each contract: build the dispatch prompt EXACTLY as the loop's caller
  would (prose + contract section in the e1a-harness pinned format:
  `Frozen contract (hash <hash>):` + one `entry(args) === expected` line per
  example, `<throws>` for throws cases) — what is judged is what ships.
- **`gruntJudge` is gone from this path (rev 4).** Per contract:
  - probe battery present for its requirement id → `convergenceProbe`;
    probe ready → admitted; probe not-ready → kicked back with one question
    per disagreement (`probe disagreement on <name>: survivors split
    <split>`, unchanged format).
  - **no probe battery for that id → kicked back, fail-closed**, with the
    single exact question
    `no probe battery supplied for '${id}' — admission is probe-only and fails closed`.
    Rationale: rev 3's "READY + no probe → admitted" lane is precisely the
    lane E2's contract sailed through with 0 questions. An unprobed
    admission is an unverified admission; the cheap introspective shortcut
    is triple-falsified.
- Requirement-id lookup for the battery map is unchanged (re-freeze match by
  hash, as built).
- No re-rolls, no silent retries: at most one probe per contract per `admit`
  call.
- **Known consequence (deliberate):** `decompose-run`'s admission stage,
  which today passes no probe batteries, will kick back every contract with
  the no-battery question until probe-battery authoring exists (a follow-on
  leg; E3 measures the intent-stage instrument first). The artifact stays
  honest — "unverified" is reported as kicked-back, not as admitted.

### Non-goals (explicitly out of scope)

- No grunt dispatch / no loop-driving (the sergeant layer composes
  `AdmissionReport.admitted` with `runLoop` — Phase 5).
- No probe auto-generation yet (rev 4 note: E3's candidate-input set is
  hand-pinned in `specs/e3-intent-divergence.spec.md` to isolate the
  instrument question; warboss-authored probe batteries are the follow-on
  leg AFTER E3 validates the instrument).
- No multi-round audit convergence (one round, bounded, gaps surfaced).
- No resolution of escalations (this module surfaces them; resolving them is
  a God/intent-authority act that produces a NEW intent for a fresh
  decompose — never an in-place edit).
- E2 itself (the human-vs-warboss contract quality experiment) is a separate
  spec when funded; this module is its substrate.

## Acceptance criteria (Given / When / Then)

1. **AC1 — happy path.** Fake client scripted with a valid 2-requirement
   decomposition, an empty audit → `DraftSet` has 2 frozen contracts
   (deterministic hashes across two runs with the same script), version "1",
   `auditGaps: []`, ledger shows exactly 2 calls tagged
   `warboss.decompose` / `warboss.audit`.
2. **AC2 — error-example mandate.** Scripted decomposition where requirement
   `csv-parse` has no `throws` example → throws naming `csv-parse` and the
   mandate; no audit call is made (ledger has 1 entry).
3. **AC3 — strict parse with one re-ask.** Script: call 1 returns prose
   without a fence, call 2 returns valid JSON → succeeds, ledger shows 2
   decompose-kind entries. Script: both malformed → `DecompositionParseError`
   carrying both raw outputs; exactly 2 calls.
4. **AC4 — validation catalogue.** Each of: duplicate ids, bad entry
   identifier, `< 2` examples, 0 requirements, `> maxRequirements`
   requirements → descriptive throw naming the offender.
5. **AC5 — audit/amend round.** Script: decomposition OK; audit returns one
   gap on `dur-parse`; amend returns the drafts with one added example
   pinning it → final contract for `dur-parse` contains the added example,
   `auditGaps: []`, ledger has decompose+audit+amend kinds. Variant: amend
   output drops the gap unaddressed → that gap string appears verbatim in
   `auditGaps`.
6. **AC6 — amend output re-validated.** Amend stage returning a draft that
   violates the error-example mandate → throws (the mandate survives the
   second pass).
7. **AC7 — admit partitions (rev 4: probe-only).** Two contracts, both with
   probe batteries; scripted probe impls converge for the first and split for
   the second → `admitted` has exactly the first, `kickedBack` has the second
   with its `probe disagreement` question(s); the probed prompt for each
   contains that contract's hash line (capture-asserted); the ledger contains
   NO `gate.judge`-kind entries (capture-asserted — gruntJudge is unwired).
8. **AC8 — admit fails closed without a battery (rev 4).** Two contracts,
   probe battery supplied only for the first; converging probe script → the
   first is admitted, the second lands in `kickedBack` with exactly
   `no probe battery supplied for '<id>' — admission is probe-only and fails closed`
   (full-string equality) and NO model call is made for it (ledger count
   asserted).
9. **AC9 — cost accounting.** All scripted paths: `DraftSet.costUsd` /
   `AdmissionReport.costUsd` equal the ledger sums of their tagged entries.
10. **AC10 — audit unavailable sentinel (rev 3).** Script: decomposition OK;
    audit call 1 returns prose without a fence; audit re-ask ALSO returns no
    fence → `decompose` resolves (no throw), `auditGaps` is exactly
    `["<audit-unavailable>: audit output unparseable after one re-ask"]`,
    contracts are still frozen from the validated drafts, NO amend call is
    made (ledger: 1 `warboss.decompose` + 2 `warboss.audit`, nothing else),
    and `costUsd` still equals the ledger sum of all 3 calls.
11. **AC11 — auditGaps entry format (rev 3).** In the AC5 carried-gap variant,
    the carried entry is the exact string `${id}: ${gap}` (e.g.
    `dur-parse: <gap sentence>`) — asserted by full-string equality, not
    substring match.
12. **AC12 — resolutions shape validation (rev 4).** Each of: scripted
    decomposition missing the `resolutions` field on one requirement;
    `resolutions` not an array; an entry with non-string `point`; an entry
    with `basis: "guess"` → descriptive throw naming the offending
    requirement and field, no audit call made (ledger has 1 entry). Variant:
    `resolutions: []` on every requirement → valid, run proceeds.
13. **AC13 — fiat resolutions escalate (rev 4).** Scripted decomposition where
    requirement `dur-parse` carries
    `{ point: "bare numeric input", chosen: "throws", basis: "fiat" }` and a
    second entry with `basis: "intent"`; empty audit → `escalations` is
    exactly `["dur-parse: fiat — bare numeric input → throws"]` (full-string;
    the `intent`-basis entry produces NO escalation), `auditGaps: []`,
    contracts still frozen.
14. **AC14 — audit gap routing (rev 4).** Scripted audit returns two gaps on
    `dur-parse`: one `intentDecides: true`, one `intentDecides: false` → the
    amend call's prompt contains the amendable gap text and does NOT contain
    the intent-undecided gap text (capture-asserted); `escalations` contains
    exactly `dur-parse: intent-undecided — <gap>` for the undecided one.
    Variant: a gap entry with `intentDecides` missing → routed to
    escalations (fail-closed), amend NOT called when no amendable gaps
    remain (ledger asserted).
15. **AC15 — audit sees the intent (rev 4).** The audit call's user content
    contains the drafts JSON followed by the exact line `Original intent:`
    and the verbatim intent text (capture-asserted).
16. **AC16 — requirement cap in the decompose prompt (rev 4).** The decompose
    call's user content contains the exact cap line with the effective
    `maxRequirements` value — both for an explicit `maxRequirements: 1` and
    for the default `8` (capture-asserted on two runs).
17. **AC17 — escalations ordering + cost (rev 4).** Two requirements each
    with one fiat resolution, plus one intent-undecided audit gap →
    `escalations` lists the two fiat entries in requirement order, then the
    intent-undecided entry; `DraftSet.costUsd` still equals the ledger sum
    (escalation routing adds no unmetered calls).

## Verifies-with

- Tests: `test/warboss.test.ts` — AC1–AC17, offline, scripted fake
  `MessagesClient` (multi-call scripts keyed by call order). Rev-4 note:
  pre-existing fixtures gain a `resolutions: []` field (AC12 makes it
  mandatory) and AC7/AC8 fixtures change from judge scripts to probe
  scripts — these are spec-driven test amendments, not drive-by edits.
- Integration: first live rev-4 decomposition = the E3 authoring run
  (`specs/e3-intent-divergence.spec.md`), HIGH tier, God-gated; artifact
  kept under `runs/`.
- Falsifies / experiment link: **E3** (`specs/e3-intent-divergence.spec.md`)
  — pre-registered: rev-4 fiat-flagging/escalation must surface the known
  underdetermined points of the duration-parse intent (bare-number,
  whitespace, decimals) that rev-3 decomposition resolved silently and every
  cheap admission instrument missed. E2's standing consequence
  (`reports/e2-verdict.md`) is the driver: the kick-back must fire at the
  author tier, pre-freeze.
