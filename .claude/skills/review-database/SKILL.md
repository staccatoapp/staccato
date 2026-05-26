---
name: review-database
description: Use when reviewing the Staccato codebase for database correctness and safety — Drizzle schema, migration safety (never drizzle-kit push), indexing, FTS5, cuid2 IDs, and SQLite best practices (WAL, transactions). Run standalone for a focused database pass or dispatched by the codebase-audit orchestrator. Not for single-PR diff review.
---

# Review: Database

Focused review of schema, queries, and migrations — **correctness and safety**, not application-level query volume. Read first: `.claude/audit/conventions.md` and `.claude/audit/rubric.md` (load `database.md`). Review **read-only — never edit code**.

## Brief

- **Schema correctness**: cuid2 text IDs (not auto-increment), integer unix timestamps, shared-vs-per-user `user_id` scoping matching the multi-user model, FK relationships, nullability.
- **Migration safety**: migrations live in `drizzle/` and run on startup; **never `drizzle-kit push`**. Flag schema edits without a generated migration, destructive migrations without a safe path, or a missing `drizzle/meta/_journal.json` update.
- **Indexing**: missing indexes on foreign keys and frequent lookup/filter/sort columns; correct use of the `tracks_fts` FTS5 virtual table.
- **SQLite best practices**: WAL-mode assumptions, wrapping multi-write operations in transactions, `busy_timeout`, relying on Drizzle's parameterised statements (flag any string-built SQL here too).

Out of scope: how often the app *calls* a query / caching (performance). Raw SQL injection as an exploit is the security reviewer's, but flag string-built SQL here as a safety issue.

## Output

Emit findings as one fenced `json` array per the schema in `rubric.md`, `area: "database"`, ids prefixed `DB`. Add a one-paragraph summary.

## Modes

- **Standalone** (default): after producing findings, follow `.claude/audit/triage-and-file.md`.
- **Findings-only** (dispatched by `codebase-audit`): stop after the JSON array; the orchestrator dedups and files.
