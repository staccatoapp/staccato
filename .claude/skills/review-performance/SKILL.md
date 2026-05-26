---
name: review-performance
description: Use when reviewing the Staccato codebase for performance — application-level DB query patterns (N+1, pagination), background jobs (import/scan pipeline), caching opportunities, and React re-render/TanStack Query issues. Run standalone for a focused performance pass or dispatched by the codebase-audit orchestrator. Not for single-PR diff review.
---

# Review: Performance

Focused review of runtime cost. Read first: `.claude/audit/conventions.md` and `.claude/audit/rubric.md` (load `import-pipeline.md` — background work is a hot spot). Review **read-only — never edit code**.

## Brief

- **DB access (application-level)**: N+1 query loops, missing pagination on list endpoints, fetching more columns/rows than needed, queries inside loops that could be batched. *(Index/schema gaps belong to the `database` reviewer — cite, don't re-file.)*
- **Background jobs**: the import/scan pipeline and any polling — blocking the event loop, unbounded concurrency, no backpressure, redundant per-item work.
- **Caching opportunities**: cover art / artist images, metadata-service responses, recommendation cache — places repeatedly recomputing or re-fetching stable data.
- **React (`apps/web`)**: unnecessary re-renders (missing `memo`/`useMemo`/`useCallback` on hot paths, unstable props/deps, over-broad context) and TanStack Query misuse (missing/duplicate keys, no `staleTime`, request waterfalls).

Out of scope: index existence and schema design (database); whether DB types are sound (type-safety).

## Output

Emit findings as one fenced `json` array per the schema in `rubric.md`, `area: "performance"`, ids prefixed `PERF`. Add a one-paragraph summary.

## Modes

- **Standalone** (default): after producing findings, follow `.claude/audit/triage-and-file.md`.
- **Findings-only** (dispatched by `codebase-audit`): stop after the JSON array; the orchestrator dedups and files.
