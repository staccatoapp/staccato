---
paths:
  - "apps/server/src/recommendations/**/*.ts"
  - "apps/server/src/routes/recommendations.ts"
  - "apps/server/src/routes/settings.ts"
  - "apps/server/src/db/queries/recommendation-cache.ts"
  - "apps/server/src/db/schema/recommendation-cache.ts"
  - "apps/web/src/hooks/useRecommendations.ts"
---

# Recommendations Pipeline Architecture

The recommendations pipeline produces per-user track and playlist recommendations (sourced from
ListenBrainz) and serves them to the Explore UI. It is owned by `apps/server/src/recommendations`
and is best understood as a **per-user, per-source pull-through cache**: a background refresher
fetches from external sources on a schedule and writes JSON payloads to the `recommendation_cache`
table, while the HTTP route serves whatever is cached and re-resolves in-library status live on
every request.

## Data Model

The `recommendation_cache` table (`db/schema/recommendation-cache.ts`) holds one row per
`(userId, source, kind)` — enforced by the `recommendation_cache_user_source_kind` unique index.
Each row carries a `status` of `warming | ready | error`, an `inflight` claim flag, a JSON
`payload` string, `lastError`, `fetchedAt`, and `nextRefreshAt`. The partial index
`idx_recommendation_cache_due` on `nextRefreshAt WHERE inflight = 0` drives the refresher's
due-row scan. Rows are per-user and cascade-delete with the user.

## Pluggable Sources

A source implements `RecommendationSource<Kind, Payload, Ctx>` (`source.ts`): `id`, `kind`,
`refreshIntervalMs`, an optional `emptyRetryIntervalMs`, plus three behaviour hooks —
`isEligible(settings)`, `buildContext(settings)`, and `fetch(ctx, log)`. A module-level registry
keyed `${id}/${kind}` is exposed via `registerSource`, `getSource`, and `listRegisteredSources`.
Sources self-register by import side-effect in `sources/index.ts`, so importing that module is
enough to populate the registry.

The interface is **provider-agnostic** — the pipeline core never names ListenBrainz. Each source
decides, from a `UserSettingsRow`, whether a user is eligible (`isEligible` — i.e. has the right
credentials) and builds its own typed `Ctx` (`buildContext`); `fetch` then receives that `Ctx`.
The two ListenBrainz sources' `Ctx` is `RecommendationSourceContext` (`listenbrainzToken` +
`musicbrainzUsername`), and their `isEligible` requires both to be present. A new provider (e.g.
Last.fm) reads its own credential columns in its `isEligible`/`buildContext` without any change to
the refresher, boot, or route code.

Two concrete sources exist, both with `id` `"listenbrainz"`:

- **`cf-tracks`** (`sources/listenbrainz-cf-tracks.ts`, refresh 6h, empty-retry 1h) —
  collaborative-filtering recordings from `getCFRecommendations`, enriched per recording via
  `lookupRecording`, `resolvePreview` (30-second preview clip), and `ensureCoverOnDisk`.
- **`playlists`** (`sources/listenbrainz-playlists.ts`, refresh 24h) — `getRecommendedPlaylists`
  plus `getPlaylistDetail`, with the same MBID-batched enrichment across all playlist tracks.

Both sources call `getTracksByMusicbrainzIds` first to short-circuit MusicBrainz lookups and
enrichment for recordings already in the local library, and both validate their output against the
shared zod schema (`RecommendedTrackSchema` / `RecommendedPlaylistSchema`) before it is cached.

## Refresher

`startRefresher()` (`refresher.ts`) installs a 60-second `setInterval`. Each `tick(now)` calls
`findDueRowIds` and fires `refreshOne` per due row (fire-and-forget). `refreshOne` first atomically
claims the row via `claimForRefresh` (`UPDATE … SET inflight = 1 WHERE id = ? AND inflight = 0`),
which prevents two ticks from fetching the same row concurrently; if the claim returns nothing it
bails. It then resolves the source from the registry, loads user settings, and — if the user is
still eligible — runs `source.fetch(source.buildContext(settings), log)` and writes the outcome
with `writeReady` or `writeError`.

Scheduling of the next run:

- **Success** → `nextRefreshAt = fetchedAt + refreshIntervalMs` (or `+ emptyRetryIntervalMs` when
  the payload is empty and the source defines one).
- **Error** → backoff of `min(refreshIntervalMs, MAX_ERROR_BACKOFF_MS)` where the cap is 15
  minutes.

Eligibility is re-checked on every refresh: if `!source.isEligible(settings)` (e.g. the user
disconnected that provider), `refreshOne` deletes **just that row** (`deleteRow`, not a whole-user
delete) and returns. The MusicBrainz-username requirement that used to live here is now part of the
ListenBrainz sources' `isEligible`.

## Boot Lifecycle & Reconcile

`reconcileUserRows(settings, opts?)` (`eligibility.ts`) is the single source of truth for which
cache rows should exist for a user: it walks `listRegisteredSources()` and, per source, upserts a
warming row if `isEligible` else deletes that source's row (`deleteForUserSource`). With
`{ forceRefresh: true }` it also resets eligible rows to warming (`resetWarmingForUserSource`) so a
credential change refetches immediately. It is reused by boot and the settings route.

In `index.ts` `start()`, before the refresher runs: `resetInflightOnBoot()` clears any rows stuck
at `inflight = 1` from an unclean shutdown; then it calls `reconcileUserRows` for every
`getAllUserSettings()` row. Finally `startRefresher()` starts the interval and an immediate
`tick()` is fired so warming rows resolve without waiting a full minute.

When a user changes their integration credentials, `routes/settings.ts` calls `reconcileUserRows`
(with `forceRefresh` on a token set/change) and kicks a `tick()`. Clearing one provider's
credentials therefore removes only that provider's rows — never the whole user's cache.

## In-Library Matching

`in-library.ts` (`refreshTracksInLibrary` / `refreshPlaylistsInLibrary`) re-resolves each
recommended recording's `inLibrary` flag (and `localTrackId` for playlists) on **every serve**,
using `getLocalTrackMbidsByMbids` / `getTracksByMusicbrainzIds`. This is intentionally not cached:
a track can transition into the local library at any time (download completion, library scan,
manual import), so the live DB is the only correct source for whether the UI shows "play now" vs.
"request download".

## Serving

The route (`routes/recommendations.ts`) is mounted under the protected `/api/recommendations`
prefix and exposes `GET /tracks` and `GET /playlists`. `buildResponse` returns the discriminated
`RecommendationsResponse` union (`no-token | warming | ready | error`). It first computes the
sources for the kind the user is **eligible** for; if none, it returns `no-token` (the wire value
is unchanged — it now means "no eligible source"). On the first request for a kind with no cache
rows yet, it lazily seeds warming rows for those eligible sources and returns `warming`. Otherwise
it parses the payloads of all sources for that kind, merges and
dedupes them (by `recordingMbid` for tracks, by playlist `id`), and runs the result through the
live in-library pass before responding. The wire contract is the zod source of truth in
`packages/shared/src/types/zod/api/recommendations.ts`.

## Web Consumer

`apps/web/src/hooks/useRecommendations.ts` exposes the TanStack Query hooks `useRecommendedTracks`
and `useRecommendedPlaylists`. They poll every 5 seconds while `status === "warming"` and
otherwise hold a 10-minute `staleTime`. Note the deliberate Zod v3/v4 duck-typing workaround
(`ParseSchema<T>`) documented in that file.

## Adding A New Source

1. Implement `RecommendationSource<Kind, Payload, Ctx>` in `sources/`: a zod-validated `fetch`,
   sensible `refreshIntervalMs` / `emptyRetryIntervalMs`, and `isEligible` / `buildContext` that
   read whatever credentials the provider needs from `UserSettingsRow` (add columns + a migration
   if it's a new integration).
2. Register it with `registerSource(...)` in `sources/index.ts`.
3. Ensure a route serves its `kind` (extend `routes/recommendations.ts` with the appropriate
   merge/dedupe and in-library pass).

Warming rows are then seeded automatically by `reconcileUserRows` — at boot for every eligible
user, on settings change, and lazily by the route on first request. No change to the refresher,
boot, or route code is needed for the new provider.
