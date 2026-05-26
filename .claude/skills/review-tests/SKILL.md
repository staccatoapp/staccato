---
name: review-tests
description: Use when reviewing the Staccato codebase for test coverage and test quality — missing tests on critical paths (especially the import pipeline), tests that assert nothing or over-mock, skipped/disabled tests, and flaky time-dependent tests. Run standalone for a focused tests pass or dispatched by the codebase-audit orchestrator. Not for single-PR diff review.
---

# Review: Tests

Focused review of test coverage and test quality. Tests use **Vitest** (`*.test.ts` / `*.spec.ts`, run via `turbo test`). Read first: `.claude/audit/conventions.md` and `.claude/audit/rubric.md`. Review **read-only — never edit code**.

## Brief

- **Coverage gaps on critical paths**: the highest-value finding. Untested or thinly tested code that, if broken, breaks user-visible functionality or silently corrupts data — the **import/scan pipeline** (the roadmap's stated priority for characterization tests), auth/session and Bearer-token validation, multi-user `user_id` isolation, route handlers, and the zod schemas/helpers in `packages/shared`. Tests currently exist only in `apps/server`; absence of tests in `apps/web`, `apps/metadata-service`, and `packages/shared` is in scope.
- **Test quality**: tests that assert nothing (or only that code "doesn't throw"), over-mocking that verifies the mock rather than real behaviour, assertions on implementation detail instead of observable outcome, and missing error-path / edge-case coverage where the production code clearly has those branches.
- **Test correctness & hygiene**: tests asserting wrong expected behaviour, `.skip`/`.todo`/disabled tests with no tracking reason, stray `.only` (silently disables the rest of the file), and flaky time/timezone/ordering/network-dependent tests.

Out of scope: the production bug itself (that's `correctness` — you flag the **missing or inadequate test**, cite the code). Don't propose new abstractions (structure). Judge what is and isn't tested, and whether the tests that exist are meaningful.

## Output

Emit findings as one fenced `json` array per the schema in `rubric.md`, `area: "tests"`, ids prefixed `TEST`. Precede it with a one-paragraph summary (the json must be the last fenced block). For a coverage-gap finding, `evidence` should quote the untested code (or the inadequate test), not an imagined test.

## Modes

- **Standalone** (default): after producing findings, follow `.claude/audit/triage-and-file.md`.
- **Findings-only** (dispatched by `codebase-audit`): stop after the JSON array; the orchestrator dedups and files.
