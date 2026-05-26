---
name: review-correctness
description: Use when reviewing the Staccato codebase for general logic and correctness bugs — off-by-one, inverted conditionals, broken error paths, unhandled rejections, races in background jobs, and edge cases. Run standalone for a focused correctness pass or dispatched by the codebase-audit orchestrator. Wraps the code-review skill. Not for single-PR diff review.
---

# Review: Correctness

Focused review for general logic and correctness bugs. Read first: `.claude/audit/conventions.md` and `.claude/audit/rubric.md`. Review **read-only — never edit code**.

## Brief

Use the built-in `code-review` skill as your **methodology guide** (at high effort) only. It is diff-scoped ("review the current diff"), so on a clean committed tree there's nothing to review — **do not invoke it when there's no diff**; invoke it only if there are uncommitted changes. The substance of this review is an independent audit of your scoped paths (see `conventions.md`) for the bugs below:

- Logic bugs: off-by-one, inverted/incorrect conditionals, wrong operator, broken `switch`/`default`, incorrect null/undefined handling.
- Error paths: unhandled promise rejections, missing `await`, broken `try/catch/finally` flow, errors that leave state inconsistent.
- Concurrency/races in the import pipeline and background jobs (correctness angle; performance owns throughput).
- Edge cases: empty/boundary inputs, off-by-one on pagination, timezone/epoch math, dead/unreachable code.

Out of scope: security vulns (security), perf (performance), typing (type-safety) — unless the bug is genuinely a logic error those lenses would miss.

## Output

Emit findings as one fenced `json` array per the schema in `rubric.md`, `area: "correctness"`, ids prefixed `CORR`. Add a one-paragraph summary.

## Modes

- **Standalone** (default): after producing findings, follow `.claude/audit/triage-and-file.md`.
- **Findings-only** (dispatched by `codebase-audit`): stop after the JSON array; the orchestrator dedups and files.
