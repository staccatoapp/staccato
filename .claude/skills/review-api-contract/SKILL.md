---
name: review-api-contract
description: Use when reviewing the Staccato HTTP API for contract consistency — response shape/envelope/naming, pagination consistency, error handling and status codes at the route boundary, and zod-schema-in-shared as source of truth. Run standalone for a focused API-contract pass or dispatched by the codebase-audit orchestrator. Not for single-PR diff review.
---

# Review: API Contract

Focused review of the shape and behaviour of the HTTP API (`apps/server` routes ↔ `apps/web`). Read first: `.claude/audit/conventions.md` and `.claude/audit/rubric.md`. Review **read-only — never edit code**.

## Brief

- **Response shape consistency**: consistent success envelope, field naming (camelCase), date/ID formats across endpoints; list endpoints share a pagination shape.
- **Error handling at the boundary**: correct HTTP status codes, a consistent error response shape, no stack traces or internal details leaked to clients, predictable validation-error format.
- **Contract source of truth**: per CLAUDE.md, boundary types are zod schemas in `packages/shared` and the handler validates against them. Flag endpoints whose contract is implicit/undocumented or diverges from the shared schema.

Out of scope: the TypeScript types behind the shape (type-safety); whether errors are *logged* (observability); whether error leakage is a *security* issue (security — you may note it).

## Output

Emit findings as one fenced `json` array per the schema in `rubric.md`, `area: "api-contract"`, ids prefixed `API`. Add a one-paragraph summary.

## Modes

- **Standalone** (default): after producing findings, follow `.claude/audit/triage-and-file.md`.
- **Findings-only** (dispatched by `codebase-audit`): stop after the JSON array; the orchestrator dedups and files.
