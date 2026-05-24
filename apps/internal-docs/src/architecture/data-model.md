# Data Model

> **Stub.** Headings and source pointers only — to be written out in a later pass.
>
> Source of truth: the Drizzle schema in `apps/server/src/db/schema/` (one file per table,
> plus `index.ts`), migrations in `apps/server/drizzle/`, and the shared/per-user split rule in
> `.claude/rules/server-architecture.md`. Browse live data with `pnpm studio`.

## Shared vs. per-user data

> The multi-user model (target 5–15 users, one shared library) is baked in from day one.
> Cover: which tables are library-wide (no `user_id`) vs. scoped per user, and why.
>
> - **Shared:** `artists`, `albums`, `tracks`, `track_artists`, `album_artists`,
>   `preview_cache`, `track_lyrics`, `server_settings`.
> - **Per-user:** `users`, `playlists`, `playlist_tracks`, `listening_history`,
>   `playback_session`, `user_settings`, `recommendation_cache`, `download_requests`.

## Core library tables

> Document `tracks` (the central resolution record: `file_path`, resolution status/method/
> confidence, `musicbrainz_id`, fingerprint), `albums` (release/release-group MBIDs, computed
> dominant `artist_id`), and `artists` (MBID-keyed, normalized/canonical names).

## Credit junction tables

> `track_artists` and `album_artists` — ordered multi-artist credits, `join_phrase`, and the
> `is_primary` flag on `album_artists` (see the primary/guest split in
> [Import & Resolution](/pipelines/import-resolution#album-artists)).

## Full-text search

> `tracks_fts` (FTS5 virtual table over title/artist/album), written at commit time via
> `upsertTrackFts()`; managed by raw SQL in migrations.

## Migrations

> How migrations are generated (`drizzle-kit`) and applied on startup (`runMigrations()` in
> `apps/server/src/db/migrate.ts`).
