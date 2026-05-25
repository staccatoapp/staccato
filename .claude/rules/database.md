---
paths:
  - "apps/server/src/db/**/*.ts"
---

## Database Schema

All IDs are text (cuid2 via `@paralleldrive/cuid2`, not auto-increment). cuid2 IDs are 24 chars, URL-safe, and monotonically ordered — preferred over UUIDs for user-facing routes. Timestamps are integer (unix epoch).

All on-disk state lives under a single data root, controlled by the `STACCATO_DATA_DIR` env var (default `./data` resolved against `process.cwd()`). The DB sits at `${STACCATO_DATA_DIR}/data/staccato.db` and the metadata cache (cover art, artist images) sits at `${STACCATO_DATA_DIR}/metadata/...`. All path derivation lives in `apps/server/src/paths.ts`; `drizzle.config.ts` imports `dbPath` from there so dev tooling and the running server resolve the same file. In Docker, `docker-compose.yml` mounts the host directory `${DATA_PATH}` to `/data` inside the container and sets `STACCATO_DATA_DIR=/data`. The `drizzle/` folder contains committed SQL migration files. Migrations run automatically on server startup (before accepting requests) via `drizzle-orm/better-sqlite3/migrator`; applied migrations are tracked in `__drizzle_migrations`. The Dockerfile must copy `drizzle/` alongside `dist/`.

### FTS5 Virtual Table

- `tracks_fts` (title, artist_name, album_title) — full-text search over the local library

### Drizzle Type Conventions

Each schema file exports inferred types alongside the table definition:

- `*Row` — `typeof table.$inferSelect` (raw DB row, e.g. `UserRow`)
- `New*Row` — `typeof table.$inferInsert` (insert shape, e.g. `NewUserRow`)

These types are **internal to `apps/server` only** — never exported to `packages/shared` or consumed by the web/mobile apps. They represent raw DB rows and may contain sensitive fields (e.g. `passwordHash`).

API-facing types are defined separately as Zod schemas in `packages/shared` and derived with `z.infer<>`. Route handlers map `*Row` → API type at the response boundary.

### Schema Change Workflow

Never use `drizzle-kit push` — it bypasses migration history and breaks other developers' DBs. Always:

1. Edit schema files in `src/db/schema/`
2. `pnpm drizzle-kit generate` — creates new SQL file in `drizzle/`
3. `pnpm drizzle-kit migrate` — applies it locally
4. Commit both the SQL file and updated `drizzle/meta/_journal.json`
