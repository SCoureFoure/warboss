# Spec — warboss-decomposition (intent → requirements → frozen contracts)

> Status: active · Feature: warboss-decomposition · Added: 2026-06-10 · Maps to: PLAN Phase 4 (warboss decomposition) + E2 substrate
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
of requirements, each with an entry-point name, a type signature, and
acceptance examples including at least one error-behavior example; freeze each
requirement into a contract; run a model self-audit pass that names behaviors
the examples fail to pin and amends the examples once; and partition the
frozen contracts through the readiness gate into admitted contracts and
kicked-back contracts with their undecided questions. Every model call is
metered and tagged by phase. The default test path is offline via the injected
fake client.

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
  `gruntJudge` (+ optional `convergenceProbe`) from `gate.ts`; metering is
  `Agent`/`Ledger`. This module is orchestration + validation only.

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

  interface RequirementDraft {
    id: string;                    // kebab-case, unique
    requirement: string;           // prose, self-contained
    entry: string;                 // function name (valid JS identifier)
    signature: string;             // e.g. "(s: string) => number"
    examples: ContractCase[];      // ≥ 2 total, ≥ 1 with throws:true or error expected
  }

  interface DraftSet {
    requirements: readonly RequirementDraft[];
    contracts: readonly Contract[];      // one per requirement, frozen, version "1"
    auditGaps: readonly string[];        // unpinned behaviors REMAINING after the amend round
    costUsd: number;
  }

  interface AdmitOptions {
    judgeAgent: Agent;                   // LOW tier (the would-be implementer)
    probe?: {                            // optional expensive backstop
      agent: Agent;
      probes: ReadonlyMap<string, readonly ContractCase[]>; // requirement id → probe battery
      k?: number;
    };
    tags?: Record<string, string | number>;
  }

  interface AdmissionReport {
    admitted: readonly Contract[];
    kickedBack: readonly {
      contract: Contract;
      questions: readonly string[];      // from gruntJudge / probe disagreements
    }[];
    costUsd: number;
  }
```

### Decompose pipeline (exactly these stages, in order)

1. **Call 1 — decompose.** One HIGH-tier `Agent.generate`
   (`kind: "warboss.decompose"`). System prompt (exact):
   `You are a warboss: you convert intent into requirements so decided that the cheapest implementer cannot misread them. Output ONLY one fenced json block matching the requested schema. Every requirement must include at least one error-behavior example (invalid input → throws). No prose outside the fence.`
   User prompt: the intent, the optional context, and the JSON schema of
   `RequirementDraft[]` (the schema text is a pinned constant in the module,
   not re-derived per call). `maxTokens: 8192`.
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
   `requirements.length > maxRequirements` or `=== 0`.
4. **Call 2 — self-audit.** One HIGH-tier call (`kind: "warboss.audit"`).
   System (exact):
   `You wrote the following contracts. List every behavior a reasonable implementer could interpret in more than one way that the examples do not pin. Output ONLY one fenced json block: an array of {"id": "<requirement id>", "gap": "<one sentence>"} . Empty array if none.`
   User: the validated requirement drafts, JSON. Parse with the same
   one-re-ask policy. (An empty gap array is a legal, good outcome.)
5. **Call 3 — amend (only if gaps ≠ []).** One HIGH-tier call
   (`kind: "warboss.amend"`): the drafts + the gap list, instruction to add
   examples that pin each gap (same schema out). Re-run stage-3 validation on
   the amended drafts. Exactly ONE audit→amend round — gaps still reported by
   no one (i.e. gaps the amend did not pin get carried verbatim) land in
   `DraftSet.auditGaps` for the human. Bounded cost; no convergence loops.
6. **Freeze.** Each final draft →
   `Contract.freeze({ requirement, entry, version: "1", examples })`.
   `DraftSet.costUsd` = sum of all calls in stages 1–5.

### Admission (`admit`)

- For each contract: build the dispatch prompt EXACTLY as the loop's caller
  would (prose + contract section in the e1a-harness pinned format:
  `Frozen contract (hash <hash>):` + one `entry(args) === expected` line per
  example, `<throws>` for throws cases) — what is judged is what ships.
- `gruntJudge` per contract (cheap-first). NOT READY → kicked back with its
  questions. READY + `opts.probe` present and has a battery for that id →
  `convergenceProbe`; probe not-ready → kicked back with one question per
  disagreement (`probe disagreement on <name>: survivors split <split>`);
  probe ready (or no probe configured for that id) → admitted.
- No re-rolls, no silent retries: one judge (+ optional probe) per contract
  per `admit` call.

### Non-goals (explicitly out of scope)

- No grunt dispatch / no loop-driving (the sergeant layer composes
  `AdmissionReport.admitted` with `runLoop` — Phase 5).
- No probe auto-generation (the E2 design decides whether the warboss may
  author its own probe batteries without contaminating them).
- No multi-round audit convergence (one round, bounded, gaps surfaced).
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
7. **AC7 — admit partitions.** Two contracts; scripted judge: `READY` for the
   first, `NOT READY\n- <q>` for the second → `admitted` has exactly the
   first, `kickedBack` has the second with `[<q>]`; the judged prompt for
   each contains that contract's hash line (capture-asserted).
8. **AC8 — admit probe backstop.** First contract READY + probe configured +
   scripted probe disagreement → it lands in `kickedBack` with a
   `probe disagreement` question; with a converging probe script → admitted.
9. **AC9 — cost accounting.** All scripted paths: `DraftSet.costUsd` /
   `AdmissionReport.costUsd` equal the ledger sums of their tagged entries.

## Verifies-with

- Tests: `test/warboss.test.ts` — AC1–AC9, offline, scripted fake
  `MessagesClient` (multi-call scripts keyed by call order).
- Integration: first live decomposition run (HIGH tier, spends money — God
  decision) against a real intent, its output fed to `admit` with a LOW-tier
  judge; artifact kept under `runs/`.
- Falsifies / experiment link: **E2** — warboss-authored contracts must reach
  ≥ 90% of the human-authored hidden-battery pass rate (PLAN pre-registered
  criterion), with coverage measured split happy-path vs error-path. If the
  mandate + audit pass cannot close the gap, warboss decomposition needs an
  adversarial example-generation pass before the hierarchy is trusted
  end-to-end.
