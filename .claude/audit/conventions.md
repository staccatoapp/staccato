# Conventions & Repo Map for Audit Reviewers

Every reviewer reads this before judging anything, so findings are measured against Staccato's own rules — not generic best practice.

## Conventions to load

- **`CLAUDE.md`** (root) — zod for any type crossing an app boundary (with validation), prefer `packages/shared` for non-project-specific helpers, logging format + log-level guidance.
- **`.claude/rules/server-architecture.md`** — SPA serving, multi-user model (shared vs per-user data), auth (sessions for web, Bearer tokens for mobile).
- **`.claude/rules/database.md`** — cuid2 text IDs, integer unix timestamps, migration workflow (never `drizzle-kit push`), FTS5, `*Row` types are server-internal only.
- **`.claude/rules/import-pipeline.md`** — pipeline stages (relevant to performance, correctness, observability, database).

## Monorepo map

- `apps/server` — Fastify backend, Drizzle ORM over SQLite (better-sqlite3, WAL).
- `apps/web` — React SPA (Vite, TanStack Query, shadcn/ui + Tailwind).
- `apps/metadata-service` — MusicBrainz façade; resolution goes through this, not MusicBrainz directly.
- `packages/shared` — cross-boundary zod types + generic helpers only.
- `apps/docs`, `apps/internal-docs` — VitePress static sites; only the `structure` reviewer touches these lightly, others skip.

## Scope manifests & sharding

You do **not** review the whole monorepo. Each lens has a scoped path manifest — review only the in-scope paths, and **work through them one app/package at a time** (finish one before starting the next) rather than holding the entire tree in your head at once. This keeps findings grounded and line numbers accurate. If you spot something clearly out of your scope, don't chase it — note it in a finding's `description` and let the orchestrator's dedup route it.

When dispatched by `codebase-audit`, the orchestrator restates your scope in the prompt. Standalone, use your own row below.

| Area | In scope | Skip |
|------|----------|------|
| security | `apps/server`, `apps/metadata-service`, `packages/shared` (boundary validation, secrets) | `apps/web`, `apps/docs`, `apps/internal-docs`, config packages |
| structure | `apps/server`, `apps/web`, `apps/metadata-service`, `packages/shared`; lightly `apps/docs`, `apps/internal-docs` (layering only) | config packages (`eslint-config`, `typescript-config`) |
| type-safety | `apps/server`, `apps/web`, `apps/metadata-service`, `packages/shared` | `apps/docs`, `apps/internal-docs`, config packages |
| performance | `apps/server` (DB access, import/scan pipeline), `apps/web` (React, TanStack Query), `apps/metadata-service` (outbound caching) | `packages/shared`, docs, config packages |
| database | `apps/server` (schema, `drizzle/`, queries, migrations) | everything else — no other app owns a DB |
| api-contract | `apps/server` (routes), `packages/shared` (zod schemas), `apps/web` (consumption side) | `apps/metadata-service` (internal façade), docs, config packages |
| observability | `apps/server`, `apps/metadata-service` | `apps/web` (no Pino; client logging out of scope), `packages/shared`, docs, config packages |
| correctness | `apps/server`, `apps/web`, `apps/metadata-service`, `packages/shared` | `apps/docs`, `apps/internal-docs`, config packages |
| tests | `apps/server`, `apps/web`, `apps/metadata-service`, `packages/shared` (test files **and** coverage gaps in their source) | docs, config packages |

Tests live alongside source as `*.test.ts` / `*.spec.ts`, run by **Vitest**. Today they exist only in `apps/server`; the absence of tests elsewhere is itself in scope for the `tests` lens.

## Overlap rule

The reviewers overlap by design. When a finding really belongs to another reviewer's lens, file it under your lens **only if it is the primary problem**; otherwise mention it in `description` and let the orchestrator's dedup merge it. Do NOT pad your list with another reviewer's job.
