---
paths:
  - "apps/server/src/recommendations/**/*.ts"
  - "apps/server/src/lastfm/**/*.ts"
  - "apps/server/src/routes/recommendations.ts"
  - "apps/server/src/routes/settings.ts"
  - "apps/server/src/db/queries/recommendation-cache.ts"
  - "apps/server/src/db/queries/lastfm-cache.ts"
  - "apps/server/src/db/schema/recommendation-cache.ts"
  - "apps/server/src/db/schema/lastfm-tags.ts"
  - "apps/server/src/db/schema/lastfm-popularity.ts"
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

## In-House Profile Foundation (Last.fm)

An in-house, Last.fm-backed engine is being built to generate personalised themed playlists from
the user's own listening history, alongside the external ListenBrainz sources. Only its
**foundation** exists so far (sub-project 1): there is no generator, no `RecommendationSource`
registration, and nothing served yet — generation and serving are a later sub-project. What exists
today is internal infrastructure under `apps/server/src/recommendations/inhouse/profile/` plus a
Last.fm read client under `apps/server/src/lastfm/`.

The Last.fm client (`lastfm/client.ts`) is a rate-limited read client mirroring the MusicBrainz
client's `p-queue` pattern. Last.fm publishes no hard limit (only a "reasonable usage" cap), so the
client defaults to ~5 req/s per key with no bursting, tunable via `STACCATO_SERVER_LASTFM_*` env
vars, and on an HTTP 429 or Last.fm error-code 29 it pauses all outbound calls for a cooldown
window — growing exponentially per consecutive hit, honouring `Retry-After` — via a generic,
instance-based backoff gate (`lib/rate-limit.ts`, `createRateLimitGate`) reusable by any external
client. The key is
per-deployment (the admin registers their own Last.fm API account), so the usage cap is per-instance
— Staccato never bundles a shared key. It reads the application `api_key` from
`serverConfig.get().lastfm.apiKey` — a **server-global** secret in `serverConfig` (not a per-user
credential), because public Last.fm reads need only the app key. It exposes `getTopTags`
(track/album/artist), `getPopularity`, and `getSimilarTags`/`getSimilarArtists`, each addressing
the entity by MBID when present and falling back to artist+name otherwise, and parsing Last.fm's
loosely-typed JSON defensively. Two shared (no `user_id`) durable cache tables back it:
`lastfm_tags` and `lastfm_popularity`, each keyed by `(entityType, entityKey)` where `entityKey`
is the MBID or a normalised `artist|title` name key, with a `fetchedAt` epoch-ms TTL. The
cache-through helper `lastfm/tag-cache.ts` (`getTagsCached`, 30-day TTL) sits between the client
and `db/queries/lastfm-cache.ts`.

The profile layer turns listening history into a taste profile. `getListenAggregatesForUser`
(`db/queries/listening-history.ts`) is the first reader of `listening_history`: it aggregates rows
per track (play count, max listened-at converted to ms) joined with track/artist/album metadata.
Pure modules compute the signal: `genre-blend.ts` blends Last.fm tags across track/album/artist
levels weighted by level specificity (track strongest, artist weakest — no hard artist fallback),
drops sub-threshold noise, and returns a normalised genre vector or null (unclassified);
`weighting.ts` applies play-count × exponential recency decay; `heard.ts` builds an MBID-keyed
heard-index (`isHeard`/`playCount`/`lastPlayed`). A pluggable **signal-extractor** registry
(`profile/extractors/registry.ts`, `registerExtractor`/`listRegisteredExtractors`, mirroring the
source registry) is the future-metrics seam; v1 ships exactly one extractor, `listening-history`,
which produces genre/artist/album/decade affinity plus an adjacency set (neighbours via
`getSimilar`, excluding existing top affinities). `build-profile.ts` (`buildTasteProfile`) runs
every eligible extractor and merges their partials into a `TasteProfile`. The profile is a plain
internal typed object recomputed on demand — it never crosses an app boundary and is not persisted
(only the `lastfm_*` caches persist). There is intentionally no standalone `lastfm` rule; the
client is documented here as part of recommendations.

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
it parses and validates the payloads of all sources for that kind. Each payload is validated with
`safeParse` against `z.array(RecommendedTrackSchema)` or `z.array(RecommendedPlaylistSchema)` at
read time — a payload that fails validation (stale schema or corrupt row) is discarded with a `warn`
log and treated as if absent, never served as a mistyped object. Valid payloads are merged and
deduped (by `recordingMbid` for tracks, by playlist `id`), then run through the live in-library
pass before responding. The wire contract is the zod source of truth in
`packages/shared/src/types/zod/api/recommendations.ts`.

## Web Consumer

`apps/web/src/hooks/useRecommendations.ts` exposes the TanStack Query hooks `useRecommendedTracks`
and `useRecommendedPlaylists`. They poll every 5 seconds while `status === "warming"` and
otherwise hold a 10-minute `staleTime`. Schema parameters are typed as `z.ZodType<T>` (Zod v4).

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
