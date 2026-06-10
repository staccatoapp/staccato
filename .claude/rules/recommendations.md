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

## In-House Recommendations Engine (Last.fm)

An in-house, Last.fm-backed engine generates personalised themed virtual playlists from the user's
own listening history, served in Explore alongside the external ListenBrainz sources. Sub-project 1
built the profile foundation; sub-project 2a wired the first generator (Genre Mix) end-to-end as a
registered `RecommendationSource` of kind `playlists`, so in-house mixes now serve through the
existing pipeline with no route/web/refresher changes; sub-project 2b added the other three
generators (More From Artists You Love, Something New, Decade Mix) on those same rails. All four now
ship, each emitting **0 or 1** themed playlist per refresh. It lives under
`apps/server/src/recommendations/inhouse/` (the `profile/`, `candidates/`, `generators/` and
`resolution/` layers plus `source.ts`) and a Last.fm read client under `apps/server/src/lastfm/`.
The once-planned persistent `lastfm_resolution` cache was **dropped** (decision F1, YAGNI): SP2a's
live yield proved name-resolution reliable, so the cache would only save Last.fm calls — revisit
only if throttling is actually observed. A true MusicBrainz first-release-date decade axis, the
album "Deep Cuts" generator (the `AlbumAffinity` gate metric is computed but unused), and the admin
write-route + runtime config fan-out remain deferred.

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
(track/album/artist), `getPopularity`, `getSimilarTags`/`getSimilarArtists`, `getTopTracksForTag`
(`tag.getTopTracks`), `getTopTracksForArtist` (`artist.getTopTracks`), and `getSimilarTracks`
(`track.getSimilar`, the SP3 seed — co-listening neighbours carrying a 0..1 `matchScore`, order
preserved) — the popularity/similar-track methods drop entries with no artist name. Each addresses the entity
by MBID when present and falls back to artist+name otherwise, and parses Last.fm's loosely-typed JSON
defensively. Two shared (no `user_id`) durable cache tables back it:
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
(only the `lastfm_*` caches persist). Every affinity type extends a shared `Affinity` base carrying
both a normalised `weight` (a relative share that drives ordering only — a thin history still shows
high weight, so it can never gate) and an `effectiveRecentTracks` gate metric (the recency-decayed
sum over DISTINCT contributing tracks — breadth plus currency in one absolute number, so a single
repeated track can't mint a mix and an abandoned entity fades). The `listening-history` extractor
accumulates `effectiveRecentTracks` for genre, artist, decade, and album affinities alike (album's
is computed for uniformity but consumed by no generator yet). There is intentionally no standalone
`lastfm` rule; the client is documented here as part of recommendations.

Generation and serving run three further layers over the profile. The candidate-sourcing service
(`inhouse/candidates/service.ts`) is the seam handed to generators so they never touch the raw
client; its `popularTracksForTag` and `topTracksForArtist(artist, mbid?)` normalise the matching
client calls into ordered `Candidate`s whose `popularityRank` is just the response index
(`topTracksForArtist` addresses by the library-derived artist MBID when known, else by name). A
generator (`inhouse/generators/`) owns taste→candidates+ordering and stays free of MusicBrainz deps:
it implements `isApplicable(profile)` plus `generate(profile, ctx)` returning unresolved
`PlaylistSpec`s, and self-registers into a registry (`registerGenerator`/`listRegisteredGenerators`,
mirroring the source/extractor registries) by import side-effect in `generators/index.ts`. Four
generators ship, each gating on `effectiveRecentTracks` and emitting 0 or 1 combined mix: **Genre
Mix** (`genre-mix.ts`, ids `inhouse:genre:<slug>`, down-weights heard for a radio feel), **More From
Artists You Love** (`more-from-artists.ts`, id `inhouse:artists`, blends the top recent artists'
top tracks weight-proportionally, hard-excludes heard for discovery), **Something New**
(`something-new.ts`, id `inhouse:something-new`, round-robins the profile's adjacency tags+artists,
hard-excludes heard), and **Decade Mix** (`decade-mix.ts`, id `inhouse:decade:<decade>`, sources the
single dominant decade's `"<decade>s"` Last.fm tag — a noisy user-applied tag, watch the `resolved X
of Y` yield — and down-weights heard). The namespaced ids avoid colliding with ListenBrainz playlist
UUIDs at the route's dedupe. Ordering is centralised in `generators/blend.ts` (`blendCandidates`):
it dedups by `(artist|title)` keeping the lowest rank, applies a heard policy (`"exclude"` drops
heard, `"downweight"` sinks heard behind unheard; MBID-less candidates count as unheard), interleaves
the per-generator sources via a stride sort key (`(i+1)/weight` — equal/absent weights give
round-robin, differing weights give a weight-proportional share of the head), and caps to a target.
The shared resolution pass (`inhouse/resolution/resolve.ts`) turns all generators' specs into
`RecommendedPlaylist`s in one batched pass mirroring `listenbrainz-playlists.ts`: it name-resolves
**every** candidate by `(artist, title)` through `resolveRecordingByName` (the evidence-free
importer-nucleus core extracted from `library/candidates/fromSearch.ts`) scored with
`scoreCandidates`, then picks a winner per `(artist, title)` via `selectWinner`, accepted only at
`RECS_RESOLUTION_THRESHOLD` (~0.70, below the importer's 0.85 because Last.fm candidates lack
duration/AcoustID and favour yield). The Last.fm candidate mbid is deliberately **not trusted** for
resolution: it superseded the original trust-the-mbid policy (spec decision E4) after live testing
showed Last.fm mbids are too flaky — a large share are non-MusicBrainz (version-3 UUIDs) or
stale/merged ids that 404, and even ones that resolve can point at the wrong recording — so the
scored mirror search is the reliable signal and also yields a canonical mbid that sharpens in-library
detection. Because Last.fm candidates have no duration, every same-title recording ties on score, so
`selectWinner` breaks ties (still under E4) by a strict priority: **(1) a recording already in the
local library** — the only reliable ownership signal, since a song may be owned as an album OR a
compilation, so release type cannot stand in for ownership; **(2) the most canonical release** (clean
Official Album over compilation/DJ-mix, via a `releaseRank` mirroring the importer's
`pickCanonicalRelease`), strictly below ownership so it never overrides a real library hit and only
decides display quality for not-owned discovery tracks; then **(3) score, then search order**. This
converges an owned song onto the same recording the importer committed (via AcoustID), fixing the
false "not in library" the old take-the-top-search-hit tiebreak produced when MusicBrainz ranked a
compilation cut first. To feed (1), it runs **one** batched `getTracksByMusicbrainzIds` over the full
candidate superset (every search hit, not just winners), reused both for the ownership tiebreak and
to short-circuit enrichment for owned winners. It then batch-enriches the non-local remainder via
`lookupRecording` plus per-release-group cover art, and assembles each spec preserving order minus
drops (an all-dropped playlist is not served). It logs a per-playlist `resolved X of Y` summary so yield is observable. The source (`inhouse/source.ts`, `id` `"inhouse"`, kind
`playlists`, refresh 24h, empty-retry 1h) ties it together: `isEligible` reads
`serverConfig.get().lastfm.apiKey` (the credential is server-global, so eligibility ignores the user
row), `buildContext` carries `userId` for profile identity, and `fetch` runs
profile→applicable-generators→resolution and zod-validates the output. Because the api key is
config-file-only in 2a, adding or changing it needs a restart (boot `reconcileUserRows` seeds the
rows); the runtime config-change fan-out is deferred.

### Playlist Track-Suggestions (SP3)

Sub-project 3 adds per-playlist track-suggestions — "more like this playlist" — served at
`GET /api/playlists/:id/suggestions` and shown three-at-a-time under the playlist on the web. It
reuses the in-house resolution and in-library machinery but runs on its own cache and refresher
because its key is per `(userId, playlistId)`, a shape the per-`(userId, source, kind)`
`recommendation_cache` cannot express. The parallel `playlist_suggestions_cache` table
(`db/schema/playlist-suggestions-cache.ts`, queries in `db/queries/playlist-suggestions-cache.ts`)
mirrors `recommendation_cache`'s columns and `warming|ready|error`/`inflight`/`nextRefreshAt`
lifecycle but is keyed by `(userId, playlistId)` (unique index), cascade-deleting with both the user
and the playlist, with the same partial due-index on `nextRefreshAt WHERE inflight = 0`. A dedicated
refresher (`recommendations/playlist-suggestions/refresher.ts`, `startSuggestionsRefresher`, 60s
tick) scans due rows and runs `refreshOneSuggestion` with the same atomic `claimSuggestionForRefresh`
guard; boot calls `resetInflightSuggestionsOnBoot()` then `startSuggestionsRefresher()` alongside the
ListenBrainz refresher. `computeSuggestions` (`compute.ts`) is the orchestrator: it reads the
playlist's tracks via `getPlaylistTracksForSeeding`, builds a capped recency-weighted seed set
(`seeds.ts` `buildSeeds`, newest-added first, `SEED_CAP` 30, gated below `MIN_SEEDS` 3 so a
brand-new/tiny playlist yields nothing), fans `track.getSimilar` across the seeds — addressing each
by **artist+title, never the local recording MBID** (Last.fm's similarity index has poor
per-recording-MBID coverage: addressing by MBID frequently errors with "Track not found"/code 6 or
returns an empty neighbour set even when the MBID resolves, so the `Seed` carries no MBID — the same
"don't trust Last.fm MBIDs" stance the resolution layer takes, decision E4) — and aggregates the
neighbours by **overlap** — the count of distinct seeds that returned a candidate, tie-broken by
summed `matchScore` (`similarity.ts` `aggregateSimilar`, `PER_SEED_CAP` 50, capped to
`TARGET_TRACKS` 25) — excluding any track already in the playlist by recording-MBID or normalized
`(artist, title)`, and finally resolves the ranked candidates to MBIDs. Resolution reuses the
in-house nucleus: `resolve.ts` was refactored to export `resolveCandidates` (the batched
name-resolve → owned-first `selectWinner` → batched library+MB enrichment core, formerly inlined in
`resolvePlaylists`, which now just calls it and groups per spec) plus the shared key function
`candidateNameKey`. In-library status is re-resolved live on every serve via
`refreshPlaylistTracksInLibrary` (`in-library.ts`), a flat-list sibling of `refreshPlaylistsInLibrary`
sharing the same `applyLibraryToTracks` mapping (one batched lookup, recording-MBID match then the
`(artistMbid, normalized title)` song-level fallback). The route gates on the server-global Last.fm
key first (returns `no-token`, so the UI hides the section, rather than seeding rows that would only
compute empty), lazily seeds a `warming` row on first view, serves the cached payload through the
live in-library pass (`ready`, or `error` with stale data if present), and is debounced: adding or
removing a playlist track calls `markSuggestionStale(userId, playlistId, now + DEBOUNCE_MS)` to pull
the next recompute forward (`DEBOUNCE_MS` 60s trailing). The wire envelope is
`PlaylistSuggestionsResponseSchema` in shared (reusing `RecommendedPlaylistTrackSchema`); the web
hook `usePlaylistSuggestions` polls every 5s while `warming` and the playlist page shows three
suggestions at a time, advancing the window as in-library tracks are added (out-of-library tracks
reuse the Explore request-download dialog). A successful refresh schedules `+24h`
(`REFRESH_INTERVAL_MS`); an empty result retries in `EMPTY_RETRY_MS` 1h; errors back off
`min(REFRESH_INTERVAL_MS, MAX_ERROR_BACKOFF_MS=15min)`. Deferred (design §12): a genre-affinity
fallback for thin/obscure playlists that come up empty, per-session dismissal, an artist-similarity
axis, and boot pre-warming.

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

This pass is the **source-agnostic** seam (every source flows through it), so it also carries a
**song-level fallback** for the recording-granularity mismatch that the inhouse `selectWinner` fix
cannot reach: a source may resolve a song to a *different MusicBrainz recording* than the one the
importer committed (the importer matches by AcoustID; ListenBrainz trusts its own MBID and never
name-searches, so `selectWinner` never runs for it). When the exact recording-MBID lookup misses
and the recommendation carries an `artistMbid`, the pass matches on `(artistMbid, normalized title)`
against the library via `getLibraryTracksByArtistMbids`, which returns **both** the raw tag title and
the MusicBrainz canonical title — they routinely disagree (e.g. raw "3005" vs canonical "V. 3005",
and a name search only surfaces "V. 3005", which scores ~0.69 and is rejected by the importer-nucleus
threshold — why `selectWinner` alone misses this), and the source may have used either form, so each
library track is indexed under both. The match is deliberately conservative — **exact** normalized
title plus `artistMbid` — so remixes/live cuts ("3005 (Friction Remix)") do not collide, and on a hit
it only flips `inLibrary` (+ `localTrackId` for playlists); the displayed album/cover are left as the
source resolved them (play uses `localTrackId`). It complements the inhouse resolution fix
(`selectWinner`) rather than replacing it: that fix still converges owned songs onto the library
recording at resolution time and sharpens not-owned display, while this is the universal safety net.

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
