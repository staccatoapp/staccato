<!-- vibe-rules Integration -->

# CLAUDE.md

## Project Overview

Staccato is a self-hosted music player app for home labs, emphasising music discovery. The core experience closely emulates Spotify — users listen to a local music library, manage playlists, receive tailored song recommendations, preview recommended/searched songs via 30-second clips, and request new music for download via Lidarr integration. The app does NOT handle downloading directly.

## Tech Stack

- **Monorepo**: Turborepo with apps and packages split by convention (see Monorepo Structure below)
- **Language**: TypeScript everywhere (backend, web, docs, shared types)
- **Backend**: Node.js + Fastify
- **Database**: SQLite (WAL mode) via Drizzle ORM with `better-sqlite3` driver
- **Web Frontend**: React SPA built with Vite, styled with shadcn/ui and Tailwind CSS, data fetching via TanStack Query
- **Documentation**: VitePress (static site, deployed separately from the main app)
- **Mobile** (future): Expo (React Native) with react-native-track-player for audio
- **Deployment**: Docker (single app container), music library mounted read-only. Docs site deployed separately (e.g. GitHub Pages, Cloudflare Pages).

## Monorepo Structure

```
/apps
  /server       ← Fastify backend (deployable in Docker)
  /web           ← React SPA (deployable, bundled into server's static files)
  /docs          ← VitePress documentation site (deployable separately, NOT in Docker)
/packages
  /shared        ← TypeScript types, API client, validation schemas, utilities (library, shared by server + web + future mobile)
```

Deployable applications live in `apps/`. Shared libraries live in `packages/`. The Dockerfile only references `apps/server` and `apps/web`. `apps/docs` is never included in the Docker image — it has its own build and deployment pipeline.

Tailwind CSS and shadcn/ui are installed directly in `apps/web`, NOT in a shared UI package. When the mobile app is added in the future, it will live in `apps/mobile` with its own styling approach (React Native StyleSheet), importing only from `packages/shared`.

## Architecture

### SPA Serving

In development, Vite runs its dev server and proxies `/api` to the Fastify backend. In production, Fastify serves the built React app as static files via `@fastify/static`, with a catch-all handler that serves `index.html` for non-API routes (client-side routing). API routes are mounted under `/api`.

### Multi-User Model

The app supports multiple users (target: 5–15) sharing a single music library. This is baked into the data model from day one.

- **Shared data** (no user_id): tracks, albums, artists, MusicBrainz mappings, cover art cache, fingerprint data
- **Per-user data** (scoped by user_id): playlists, listening history, ListenBrainz credentials, recommendation cache, playback state, download requests

Until real auth is implemented, a default admin user is seeded on first launch and all requests are attributed to that user via a Fastify `onRequest` hook that injects `req.userId`.

### Authentication (when implemented)

- Session-based auth (`@fastify/session`) for web
- Long-lived API tokens (Bearer header) for mobile clients
- Admin user created on first launch, can invite/create additional accounts (Jellyfin model)
- OIDC will be implemented at a later date.

### Documentation Site

The docs site is a VitePress static site that lives in `apps/docs`. It is built and deployed independently from the main application — it is NOT included in the Docker image that users pull. Docs cover setup/installation guides, configuration reference, API documentation, and user guides.

## External Service Integrations

### MusicBrainz — Canonical Metadata Source

All music metadata is normalised to MusicBrainz IDs (MBIDs). MBIDs are the universal glue that connects local library tracks, recommendations, search results, and download requests. MusicBrainz provides artist, album, track, genre/tag, and relationship data. Cover art comes from the Cover Art Archive (coverartarchive.org), keyed by release MBID.

### Metadata Resolution for Local Files

Two-pass approach:

1. **Fast pass**: fuzzy match embedded file tags (artist name + track title) against MusicBrainz search API
2. **Background pass**: acoustic fingerprinting via Chromaprint (`fpcalc` CLI) + AcoustID lookup for unmatched or low-confidence results

Once a file has a resolved MBID, display metadata is sourced from MusicBrainz, not embedded tags.

### ListenBrainz — Recommendations & Scrobbling

Each user has their own ListenBrainz token. The app submits "now playing" and "listen" events as tracks are played. ListenBrainz provides:

- **Periodic recommendations**: weekly discovery playlists, daily/weekly jams (user must follow `troi-bot` on ListenBrainz)
- **On-demand recommendations**: collaborative filtering via the recommendation API
- **Playlist-contextual recommendations**: built as a custom layer — analyse MBIDs in a playlist, extract genre/tag patterns from MusicBrainz, filter ListenBrainz recommendations accordingly (ListenBrainz does not natively support "recommend based on this set of songs")

Cold-start mitigation: on first setup, offer a backfill that resolves the local library to MBIDs and submits them as historical listens to bootstrap the recommendation engine.

### Song Previews — Deezer (Primary) + iTunes (Fallback)

Spotify preview URLs are deprecated (November 2024). The app uses:

1. **Deezer API** (primary): 30-second preview clips, no auth required, reasonable rate limits. Requires server-side proxying due to CORS.
2. **iTunes Search API** (fallback): 30-second previews, no auth required, 20 req/min rate limit.

Cross-reference is by artist name + track title string matching (not IDs). A local cache maps MBIDs to Deezer/iTunes IDs to avoid repeated lookups.

### Lidarr — Song Requesting / Downloads

Lidarr only downloads full albums, not individual tracks. When a user requests a song:

1. Identify the release group containing the track via MusicBrainz (the recording's primary release group — typically the full album)
2. Add the artist (if not present) and monitor that release group via Lidarr API
3. Track request status in `download_requests` table (per-user, with status: requested → sent_to_lidarr → downloading → completed → failed)
4. Notify the requesting user when the download completes
5. Trigger a library rescan for new content

The UX must be transparent: show the user that they're downloading a full album (with track count and estimated size) before they confirm the request. Auto-add the requested track to a "Recently Added" playlist so it doesn't get lost among other album tracks.

Single-vs-album preference (downloading a Single release group when one exists for the recording) was considered and explicitly dropped — added complexity for marginal user benefit. The user is always told upfront they're queuing the full album.

## Implementation Phases

### Phase 1: Library Scanning & Metadata Resolution

Directory scanner, tag extraction (via `music-metadata` npm package), MusicBrainz resolution, browsable catalogue with cover art.

### Phase 2: Audio Playback

Play, pause, skip, seek, queue management, now-playing view. Background audio and lock screen controls for mobile.

### Phase 3: Playlists

Create, edit, delete, reorder. Stored as ordered lists of track references in the database.

### Phase 4: ListenBrainz Scrobbling

Submit listening events per-user. Backfill option for cold-start.

### Phase 5: External Search & Previews

MusicBrainz search for songs outside the library. Deezer/iTunes preview playback. MBID-to-external-ID caching layer.

### Phase 6: Recommendations

Periodic (ListenBrainz weekly/daily playlists) + on-demand + playlist-contextual. Preview playback for recommended tracks.

### Phase 7: Lidarr Integration

Song requesting, download status tracking.

## Database Schema

All IDs are text (cuid2 via `@paralleldrive/cuid2`, not auto-increment). cuid2 IDs are 24 chars, URL-safe, and monotonically ordered — preferred over UUIDs for user-facing routes. Timestamps are integer (unix epoch).

DB file location is controlled by the `DB_PATH` env var; default is `./data/staccato.db`. The `drizzle/` folder contains committed SQL migration files. Migrations run automatically on server startup (before accepting requests) via `drizzle-orm/better-sqlite3/migrator`; applied migrations are tracked in `__drizzle_migrations`. The Dockerfile must copy `drizzle/` alongside `dist/` — see Key Design Decisions.

### Shared Tables

- `artists` (id, name, musicbrainz_id, image_url, created_at)
- `albums` (id, title, artist_id→artists, musicbrainz_id, cover_art_url, release_year, created_at)
- `tracks` (id, title, artist_id→artists, album_id→albums, musicbrainz_id, track_number, disc_number, duration_seconds, file_path, file_format, file_size_bytes, fingerprint_status, created_at)

### Per-User Tables

- `users` (id, username, password_hash, is_admin, listenbrainz_token, created_at)
- `playlists` (id, user_id→users, name, description, created_at, updated_at)
- `playlist_tracks` (id, playlist_id→playlists, track_id→tracks, position, added_at)
- `listening_history` (id, user_id→users, track_id→tracks, listened_at, scrobbled_to_listenbrainz)
- `download_requests` (id, user_id→users, musicbrainz_recording_id, musicbrainz_release_id, artist_name, track_title, album_title, status, created_at, updated_at)

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

## Key Design Decisions

- **SQLite over PostgreSQL**: no separate container, single-file backup, zero idle resource usage, more than sufficient for 5–15 users with light write patterns. Drizzle supports both if migration is ever needed. Connection is configured with WAL mode, foreign keys enforced, `busy_timeout = 5000` (prevents immediate SQLITE_BUSY failures under concurrent load), `synchronous = NORMAL` (safe perf improvement with WAL), and `temp_store = MEMORY`.
- **MBIDs as universal identifiers**: connects local files, recommendations, search results, and download requests through a single ID space.
- **Two-pass metadata resolution**: fast tag-based matching first, expensive fingerprinting in background — so the library is browsable immediately after scan.
- **Deezer over Spotify for previews**: Spotify deprecated preview URLs in November 2024. Deezer is the primary source, iTunes is the fallback.
- **Full album downloads via Lidarr**: accepted constraint. The user is always told upfront they're queuing the full album; no single-vs-album release-group preference logic (decided against — added complexity for marginal benefit).
- **Auth deferred but data model ready**: default user injected via hook, but all per-user tables have user_id from the start. Swapping in real auth later is a single hook change.
- **apps/ vs packages/ split**: deployable applications (server, web, docs, future mobile) live in `apps/`. Shared libraries (types, API client, utilities) live in `packages/`. This is the standard Turborepo convention.
- **Docs deployed separately**: the documentation site is NOT included in the Docker image. It is built and deployed via its own pipeline (e.g. GitHub Pages) to keep the Docker image lean and focused.
- **Auto-migrate on startup**: migrations run synchronously before the server accepts requests. No manual migration step for users on upgrade — pulling a new image and restarting is sufficient. The Dockerfile must copy `apps/server/drizzle/` into the image alongside `apps/server/dist/`, both under the same WORKDIR so `process.cwd()` resolves `drizzle/` correctly. Recommend users backup `staccato.db` before major version upgrades.
- **Async functions over BullMQ + Redis for background tasks**: at 5–15 users on a single container, Redis adds operational complexity without meaningful benefit. Background tasks (scanning, fingerprinting, scrobbling, Lidarr polling) are implemented with plain async functions. Chokidar re-triggers scanning on startup, covering crash-recovery for scans. Add BullMQ only if a concrete need emerges (e.g. guaranteed job delivery across restarts becomes a real pain point).
- **Disk cache for cover art**: cover art is fetched from Cover Art Archive once, written to `data/covers/<mbid>.jpg`, and served via Fastify static with `Cache-Control: public, max-age=31536000`. The `cover_art_url` column on `albums` points to the local static endpoint after first fetch. Redis is not used for asset caching — it is volatile, non-idiomatic for binary blobs, and unnecessary for content that never changes.
- **Minimal user-facing configuration (MVP principle)**: do not expose configuration options to users unless they are strictly necessary. When an external service (e.g. Lidarr) already has sensible defaults configured by the user, infer them automatically rather than asking the user to re-enter them in Staccato. Each new setting must justify its existence.
- **Prefer Zod when defining types from unknown inputs**: whenever data flows in from external sources (e.g. API calls), use Zod to ensure a consistent, shared shape.
- **Use types wherever reasonable** - When data flows between apps (e.g. server -> web/mobile), use Typescript interfaces or inferred types in the shared package. When data flows internally (e.g. database functions -> server functions, or server -> server functions), TypeScript interfaces or inferred types can be used internally to that app or package.

## Role

Claude operates in an **assistant-only capacity** on this project. This means:

- **No code changes** — do not edit, create, or delete any files in the repository, other than those sanctioned below.
- **Do** help debug issues, explain error messages, reason through the problem space, and answer questions about behaviour or root cause
- **Do** collaborate on UX decisions, API design, and architecture — propose approaches, explain trade-offs, ask clarifying questions
- **Do** write plans (to `plans/`) when asked to plan a session — this is a sanctioned form of file output
- **Do** append to `CLAUDE.md` when asked to record architectural decisions or update project guidance
- **Do** write code review findings to `issues/` after any code review — create a new file per review (e.g. `issues/day-2-review.md`) listing Critical, Important, and Nitpick issues with file locations and fix descriptions. Mark resolved issues ✅. This is a sanctioned form of file output.

If a fix or implementation is needed, describe it clearly so the developer can apply it themselves.

**No git commits** — never run `git commit`, `git push`, or any command that creates or modifies git history, even when executing an implementation plan. The developer commits their own work.

## Working Practices

At the end of each development day, before planning the next day, perform a full code review of all changes made during the day. Write findings to `issues/day-XX-review.md` (Critical, Important, Nitpick sections with file locations and fix descriptions). Do not proceed to next-day planning until the review is complete.

When asked to plan a development session or day of work, produce a markdown file (not inline text) with:

- Sequenced steps where each builds on the previous
- Clear verification checkpoints after each step
- An end-of-day checklist of concrete pass/fail conditions

Save planning files to the project root as `plans/day-XX-plan.md`.

## Logging

The server uses Pino via Fastify's bundled logger. Configuration lives in `apps/server/src/logger.ts` and is controlled by two env vars:

- `LOG_LEVEL` — `error` | `warn` | `info` (default) | `debug`
- `LOG_FORMAT` — `pretty` (default, human-readable) | `json` (for log aggregators like Loki/ELK)

The same singleton `logger` instance is passed into Fastify via `Fastify({ loggerInstance: logger })`, so `req.log`, `fastify.log`, and the module-level `logger` all write through the same stream with shared redaction (cookies, auth headers, `passwordHash`, `listenbrainzToken`, `lidarrApiKey`).

### When writing new code, always add logs

Prefer adding a log over omitting one. Every `catch` block should log something. Every external API call site should log failures with enough context to debug from the log alone. Lifecycle events (background task started/finished, state transitions, configuration loaded) should land at INFO. Per-item events (per-file scan, per-track resolution, polling tick details) belong at DEBUG.

### Where the logger comes from

- **In a Fastify route handler**: use `req.log.{error,warn,info,debug}`. Fastify auto-tags it with the request id.
- **In a helper called from a route**: accept a `FastifyBaseLogger` parameter and pass `req.log` in (see `submitToLidarr(row.id, req.log)` in `routes/downloads.ts`).
- **In a background task or module-level code**: import the root `logger` from `../logger.js` and create a child with a module tag at file top:
  ```ts
  import { logger } from "../logger.js";
  const log = logger.child({ module: "scanner" });
  ```
  Then use `log.{error,warn,info,debug}` throughout the file.

### Level guidance

- `error` — unrecoverable failures, fatal errors, anything that breaks user-visible functionality.
- `warn` — recoverable failures (silent catches in external clients returning null), degraded operating mode (missing optional integration like AcoustID), rate-limit backoffs that affect throughput, 4xx responses worth noting (auth failures, conflicts).
- `info` — lifecycle events (server up, scan started/complete, pass started with counts), state transitions, successful user-visible actions (user logged in, download queued). Fastify already auto-logs every HTTP request/response at INFO — do not duplicate.
- `debug` — per-item events (per-file scan, per-track resolution), polling tick details, deduplication skips, anything high-volume that would drown INFO. Default LOG_LEVEL hides these.

### Log call format

Always use the object-first pattern: `log.error({ err, context }, "message")`, not string interpolation. Include the actual `Error` under the `err` key so Pino's serializer captures stack traces. Surrounding context (ids, paths, counts, operation name) goes alongside.

```ts
// good
log.warn({ err, operation: "lookupRecording", recordingMbid: mbid }, "mb recording lookup failed");

// bad
log.warn(`mb recording lookup failed for ${mbid}: ${err}`);
```

Messages should be lowercase, present-tense, and describe what happened in a way that's greppable without including IDs or counts — those belong in the structured context object.
