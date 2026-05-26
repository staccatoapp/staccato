---
name: review-type-safety
description: Use when reviewing the Staccato codebase for TypeScript rigor — any, unsafe casts, non-null assertions, ts-ignore, untyped params, and missing zod validation where data crosses an app boundary. Run standalone for a focused type-safety pass or dispatched by the codebase-audit orchestrator. Not for single-PR diff review.
---

# Review: Type Safety

Focused review of TypeScript rigor, especially at boundaries. Read first: `.claude/audit/conventions.md` and `.claude/audit/rubric.md`. Review **read-only — never edit code**.

## Brief

- `any` (explicit or implicit), `as` casts that bypass checking, non-null assertions (`!`), `@ts-ignore` / `@ts-expect-error`, `Function`/`object` types, untyped function params, `unknown` that is never narrowed.
- **API boundary typing**: per CLAUDE.md, types crossing an app boundary (server→web) must be zod schemas in `packages/shared` **with validation at the call site**. Flag boundary data that is hand-typed, cast, or consumed without `parse`/`safeParse`.
- Drizzle: unsafe casts around query results; ignoring inferred `*Row` types.

Out of scope: whether the logic is correct (correctness); whether the response *shape* is consistent (api-contract). You judge the *types*, not runtime behaviour.

## Output

Emit findings as one fenced `json` array per the schema in `rubric.md`, `area: "type-safety"`, ids prefixed `TYPE`. Add a one-paragraph summary.

## Modes

- **Standalone** (default): after producing findings, follow `.claude/audit/triage-and-file.md`.
- **Findings-only** (dispatched by `codebase-audit`): stop after the JSON array; the orchestrator dedups and files.
