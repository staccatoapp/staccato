---
paths:
  - "apps/server/src/recommendations/**/*.ts"
  - "apps/server/src/lastfm/**/*.ts"
  - "apps/server/src/routes/recommendations.ts"
  - "apps/server/src/routes/settings.ts"
  - "apps/server/src/db/**/recommendation-cache.ts"
  - "apps/server/src/db/**/lastfm-*.ts"
  - "apps/web/src/hooks/useRecommendations.ts"
---

# Recommendations Pipeline Architecture

Owned by `apps/server/src/recommendations`: per-user track and playlist recommendations served to Explore as a
per-user, per-source **pull-through cache** — a background refresher fetches on a schedule and writes JSON payloads to
`recommendation_cache`; the route serves what's cached and **re-resolves in-library status live on every request**
(never cached). Two provider families feed it: ListenBrainz (CF tracks, recommended playlists) and an in-house Last.fm
engine.

## Data model

`recommendation_cache` holds one row per `(userId, source, kind)` (unique index `…_user_source_kind`), with a `status`
(`warming | ready | error`), an `inflight` claim flag, a JSON `payload`, and `nextRefreshAt`. Partial index
`idx_recommendation_cache_due` on `nextRefreshAt WHERE inflight = 0` drives the due scan; rows cascade-delete with the
user, and a `ready` row that later fails keeps its stale payload.

## Pluggable, provider-agnostic sources

A source implements `RecommendationSource<Kind, Payload, Ctx>` (`source.ts`): `id`, `kind`, `refreshIntervalMs`,
optional `emptyRetryIntervalMs`, and hooks `isEligible`/`buildContext`/`fetch`. A registry keyed `${id}/${kind}` is
populated by import side-effect in `sources/index.ts`. The core never names a provider — each source decides eligibility
from a `UserSettingsRow` and builds its own typed `Ctx`, so a new provider needs no refresher/boot/route change; `fetch`
must zod-validate its payload before returning. Two ListenBrainz sources (`id` `"listenbrainz"`): `cf-tracks` (6h,
empty-retry 1h) and `playlists` (24h); both short-circuit library-owned recordings via `getTracksByMusicbrainzIds`, then
enrich the remainder (`lookupRecording`, cover art). Preview clips are **not** resolved at refresh — `previewUrl` is no
longer on the payload; clients stream previews on demand via the self-healing preview proxy (see [[preview]]), keyed by
`recordingMbid` + `artistName` + `title`.

## In-house Last.fm engine

A second source (`inhouse/source.ts`, `id` `"inhouse"`, kind `playlists`, 24h/1h) generates themed playlists and rides
the same pipeline; `fetch` runs profile → generators → resolution. **Eligibility reads the server-global Last.fm
`apiKey` from `serverConfig`, not a per-user credential** (config-file-only, so changes need a restart). The taste
profile (`inhouse/profile/`) is recomputed on demand and **never persisted or sent over a boundary** (only the
`lastfm_*` caches persist). Each affinity carries a `weight` (**orders only, never gates**) and `effectiveRecentTracks`
(recency-decayed sum over DISTINCT tracks — **the gate**, so one repeated track can't mint a mix). Four generators gate
on `effectiveRecentTracks` and each emit **0 or 1** namespaced-id playlist; ordering lives in `blend.ts`. Resolution
(`resolve.ts`, `resolveCandidates`) name-resolves **every** `(artist, title)` via the importer-nucleus
`resolveRecordingByName` + `scoreCandidates` at `RECS_RESOLUTION_THRESHOLD` (~0.70). **The Last.fm candidate MBID is
deliberately not trusted** (decision E4 — often non-MusicBrainz/stale/wrong); `selectWinner` breaks ties by strict
priority: (1) in the local library, (2) most canonical release (`releaseRank`), (3) score then search order —
converging an owned song onto the importer's AcoustID recording. One batched `getTracksByMusicbrainzIds` over the full
candidate superset feeds that ownership tiebreak. The rate-limited Last.fm read client (`lastfm/client.ts`, via the
reusable `lib/rate-limit.ts` gate) is backed by durable `lastfm_*` caches through `lastfm/tag-cache.ts`.

## Playlist track-suggestions (SP3)

Per-playlist "more like this" at `GET /api/playlists/:id/suggestions`. Its `(userId, playlistId)` key can't fit
`recommendation_cache`, so it uses a parallel `playlist_suggestions_cache` (same lifecycle, unique `(userId,
playlistId)`, cascades with user and playlist) and its own 60s refresher (`startSuggestionsRefresher`).
`computeSuggestions` builds a recency-weighted seed set (`SEED_CAP` 30, gated below `MIN_SEEDS` 3), fans
`getSimilarTracks` across seeds **by artist+title, never the recording MBID** (poor per-MBID coverage — same E4
stance), ranks by overlap tie-broken by `matchScore`, then reuses `resolveCandidates`. In-library is re-resolved live
via `refreshPlaylistTracksInLibrary`; a playlist edit calls `markSuggestionStale(..., now + DEBOUNCE_MS)` (60s trailing)
to pull the recompute forward. Wire: `PlaylistSuggestionsResponseSchema`.

## Refresher, reconcile, boot

`startRefresher()` ticks every 60s: `findDueRowIds` then fire-and-forget `refreshOne`. `refreshOne` atomically claims
the row (`claimForRefresh`, a compare-and-set on `inflight`) so two ticks never double-fetch, re-checks `isEligible`
(deleting **just that row** if the provider was disconnected — never the whole cache), and writes `writeReady` (next =
`fetchedAt + refreshIntervalMs`, or `+ emptyRetryIntervalMs` when empty) or `writeError` (backoff
`min(refreshIntervalMs, 15min)`). `reconcileUserRows` (`eligibility.ts`) is the single source of truth for which rows
exist: per source, upsert a warming row if eligible (never clobbers a `ready` row) else delete that source's row;
`{ forceRefresh: true }` resets eligible rows to warming. Boot runs `resetInflightOnBoot()`, reconciles every user,
starts the refresher, and fires an immediate `tick()`; `routes/settings.ts` reconciles (with `forceRefresh` on a token
change) and kicks a `tick()`. SP3 mirrors this with `resetInflightSuggestionsOnBoot()`.

## In-library matching (live)

`in-library.ts` re-resolves `inLibrary` and `localTrackId` on **every serve** — never cached, since a
track can become local anytime. `refreshTracksInLibrary` (flat tracks) now resolves `localTrackId` via
`getTracksByMusicbrainzIds` too (not just the playlist passes), so Explore can play an owned recommended/search
track in full. This source-agnostic pass also carries a **song-level fallback** `selectWinner` can't
reach (a source may resolve to a different recording than the importer's AcoustID match; ListenBrainz never
name-searches): when the exact MBID lookup misses and the recommendation has an `artistMbid`, it matches on **exact**
`(artistMbid, normalized title)` via `getLibraryTracksByArtistMbids` (indexed under both raw-tag and MB-canonical
titles, which disagree, e.g. "3005" vs "V. 3005"), flipping only `inLibrary`/`localTrackId`.

## Serving and web

`routes/recommendations.ts` (`/api/recommendations`) exposes `GET /tracks` and `/playlists`; `buildResponse` returns
the discriminated union `no-token | warming | ready | error`. It filters to eligible sources (none → `no-token`),
lazily seeds warming rows on first request, `safeParse`s each payload (**a failing payload is discarded with a `warn`
and treated as absent, never served mistyped**), merges and dedupes (by `recordingMbid` / playlist `id`), and runs the
live in-library pass. The wire contract is the zod source of truth in
`packages/shared/src/types/zod/api/recommendations.ts`. Web hooks (`useRecommendations.ts`, `usePlaylistSuggestions`)
poll every 5s while `warming`, else hold a 10-minute `staleTime`.
