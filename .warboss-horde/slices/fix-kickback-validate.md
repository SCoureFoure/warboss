# fix-kickback-validate

First read `.warboss-horde/slices/_fix-protocol.md` and follow it exactly.

Forks: malformed owner-answer file is rejected = `intent` (fail-closed convention). `requirementId` stays
optional = `intent` (the code already defaults it to `""`).

- files: `src/kickback.ts`, `test/kickback.test.ts`, `specs/kickback-pipeline.spec.md` (append criteria only)
- context: `.warboss-horde/out/review-decompose.md` finding F2.

## Defect

`loadOwnerAnswers` in `src/kickback.ts` (near lines 155-207) casts fields with `as string` and never checks them.
A file with `answers: [{ "decision": "x" }]` is accepted and returns `escalation: undefined`.

## Behavior

Add these checks to `loadOwnerAnswers`. Each failure throws an `Error` whose message starts with
`loadOwnerAnswers: ` and includes the file path the same way the existing messages do. Keep every existing check and
message unchanged, and keep their relative order; put the new per-answer checks at the top of the loop body, before
the existing blank-decision check.

Top level (after the existing `answers` checks, before the loop):

1. `intent` must be a string with at least one non-whitespace character → else message contains `"intent"`.
2. `artifact` must be a string → else message contains `"artifact"`.
3. `context`, when the key is present and its value is not `null`, must be a string → else message contains
   `"context"`.

Per answer (index `i`):

4. The answer must be a non-null object that is not an array → else message contains `answers[<i>]`.
5. `escalation` must be a string with at least one non-whitespace character → else message contains `answers[<i>]`
   and `"escalation"`.
6. `requirementId`, when the key is present and its value is not `undefined`, must be a string → else message
   contains `answers[<i>]` and `"requirementId"`.

Before implementing 1 and 2, read the `AnswerQueue` type and `buildAnswerQueue` in the same file. If `intent` or
`artifact` is declared optional there, or `buildAnswerQueue` can write a non-string for either, do not add that
check: leave `// UNDECIDED:` and report it.

## Cases (in `test/kickback.test.ts`)

Use the same temp-file pattern the existing `loadOwnerAnswers` tests use. Base valid file:
`{ "intent": "do x", "context": null, "artifact": "a.json", "answers": [{ "escalation": "q1", "requirementId": "R1",
"decision": "yes" }] }`.

1. Base file loads and returns the same values (no regression).
2. `answers: [{ "decision": "x" }]` → rejects, message matches `/answers\[0\].*escalation/`.
3. `answers: [{ "escalation": "   ", "decision": "x" }]` → rejects, message matches `/answers\[0\].*escalation/`.
4. `answers: [{ "escalation": 7, "decision": "x" }]` → rejects, message matches `/answers\[0\].*escalation/`.
5. `answers: ["q1"]` → rejects, message matches `/answers\[0\]/`.
6. `answers: [null]` → rejects, message matches `/answers\[0\]/`.
7. Second answer bad: base answer followed by `{ "decision": "x" }` → message matches `/answers\[1\]/`.
8. `requirementId: 5` on the base answer → rejects, message matches `/requirementId/`.
9. Base answer with the `requirementId` key removed → loads; returned `requirementId` is `""`.
10. `intent` key removed → rejects, message matches `/intent/`. `intent: ""` → rejects.
11. `artifact: 3` → rejects, message matches `/artifact/`.
12. `context: 3` → rejects, message matches `/context/`. `context` key removed → loads with `context` `null`.
