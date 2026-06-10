# Recommendations Pipeline

The recommendations pipeline produces per-user **track** and **playlist** recommendations from
ListenBrainz and surfaces them in the Explore UI, where each item is either playable from the
local library or available to preview and request for download. It lives in
`apps/server/src/recommendations/`.

## Design principles

- **Pull-through cache.** Recommendations are never computed on the request path. A background
  refresher fetches from external sources on a schedule and writes JSON payloads to the
  `recommendation_cache` table; the HTTP route serves whatever is cached. A request never blocks
  on ListenBrainz or MusicBrainz.
- **Per-user, per-source rows.** Each recommendation source keeps its own cache row per user, so
  sources refresh on independent schedules and one failing source never poisons another.
- **In-library status is live, never cached.** Everything else in a payload is cached, but whether
  a recommended recording is in the local library is re-resolved from the DB on every serve — a
  track can become local at any moment (download, scan, manual import).
- **Sources are pluggable and provider-agnostic.** New recommendation kinds register themselves
  into a module-level registry by import side-effect; the refresher and routes discover them
  generically. The pipeline core never names ListenBrainz — each source decides its own
  eligibility and builds its own credential context (see below), so a second provider (e.g.
  Last.fm) is a drop-in.
- **Restart-resumable.** Refresh claims are recorded in the DB (`inflight`), not in memory. A crash
  mid-fetch is recovered on the next boot by `resetInflightOnBoot()`, and the atomic
  `claimForRefresh` prevents two workers from fetching the same row.

## Data model

The `recommendation_cache` table (`db/schema/recommendation-cache.ts`) holds one row per
`(userId, source, kind)`, enforced by the `recommendation_cache_user_source_kind` unique index.

| Column          | Role                                                                      |
| --------------- | ------------------------------------------------------------------------- |
| `status`        | Lifecycle: `warming` → `ready` → `error` (see below).                     |
| `inflight`      | Claim flag (`0`/`1`); set while a refresh is in progress.                 |
| `payload`       | The cached recommendations as a JSON string (nullable until first fetch). |
| `lastError`     | Last failure message (set on `error`).                                    |
| `fetchedAt`     | When the payload was last written.                                        |
| `nextRefreshAt` | When the row next becomes due; drives the refresher's scan.               |

The partial index `idx_recommendation_cache_due` on `nextRefreshAt WHERE inflight = 0` makes the
"what's due?" query cheap. Rows are per-user and cascade-delete with the user.

The status lifecycle: a row starts `warming` (seeded, no payload yet), becomes `ready` once a fetch
succeeds, or `error` on failure (with a backoff in `nextRefreshAt`). A `ready` row that later fails
keeps its stale payload — the route can still serve it while flagging the error state.

## Sources and the registry

A source implements `RecommendationSource<Kind, Payload, Ctx>` (`source.ts`):

```ts
interface RecommendationSource<
  Kind extends string,
  Payload extends unknown[],
  Ctx = unknown,
> {
  readonly id: string;
  readonly kind: Kind;
  readonly refreshIntervalMs: number;
  readonly emptyRetryIntervalMs?: number;
  isEligible(settings: UserSettingsRow): boolean; // has the right credentials?
  buildContext(settings: UserSettingsRow): Ctx; // source-specific creds → fetch ctx
  fetch(ctx: Ctx, log: FastifyBaseLogger): Promise<Payload>;
}
```

A module-level `Map` keyed `${id}/${kind}` backs `registerSource()`, `getSource()`, and
`listRegisteredSources()`. Sources self-register by import side-effect in `sources/index.ts`, so a
single `import "./sources/index.js"` populates the registry for the refresher, the boot backfill,
and the routes alike.

The three behaviour hooks are what keep the core provider-agnostic. `isEligible(settings)` decides
whether a user can use the source — i.e. whether `UserSettingsRow` carries the credentials it
needs. `buildContext(settings)` turns those settings into the typed `Ctx` the source's `fetch`
consumes. The two ListenBrainz sources share `Ctx = RecommendationSourceContext`
(`{ listenbrainzToken, musicbrainzUsername }`) and an `isEligible` that requires both fields; a
Last.fm source would read its own columns and define its own `Ctx`, touching no shared code.
`fetch` must return a payload it has already validated against the shared zod schema.

Two sources exist today, both with `id` `"listenbrainz"`:

| Kind        | File                        | Refresh | Empty-retry | Upstream                                        |
| ----------- | --------------------------- | ------- | ----------- | ----------------------------------------------- |
| `cf-tracks` | `listenbrainz-cf-tracks.ts` | 6h      | 1h          | `getCFRecommendations`                          |
| `playlists` | `listenbrainz-playlists.ts` | 24h     | —           | `getRecommendedPlaylists` + `getPlaylistDetail` |

Both follow the same shape: pull MBIDs from ListenBrainz, call `getTracksByMusicbrainzIds` to
short-circuit any recording already in the local library (those need no MusicBrainz lookup or
enrichment), then for the remainder fan out `lookupRecording` (at `MB_PRIORITY.BACKGROUND`) and
batch the asset enrichment — `ensureCoverOnDisk` for cover art, and for `cf-tracks` also
`resolvePreview` for the 30-second preview clip. Local matches are emitted with `inLibrary: true`
and their canonical local metadata; non-local matches carry the fetched MB metadata and
`inLibrary: false`. The final array is parsed with `RecommendedTrackSchema` /
`RecommendedPlaylistSchema` before being returned (and thus cached).

## Refresher and scheduling

`startRefresher()` (`refresher.ts`) installs a 60-second `setInterval`. Each `tick(now)`:

1. `findDueRowIds(now)` selects rows where `nextRefreshAt <= now AND inflight = 0`.
2. For each due id, `refreshOne(id)` is fired without awaiting (errors are logged, not propagated).

`refreshOne` is careful about concurrency and eligibility:

- **Atomic claim.** `claimForRefresh` runs `UPDATE … SET inflight = 1 WHERE id = ? AND inflight = 0`
  and returns the row only if it won the claim. A losing caller simply returns — this is what
  prevents two ticks (or a tick racing the boot `tick()`) from double-fetching.
- **Source resolution.** If the row's `(source, kind)` is not in the registry, it is written as
  `error` with a long (24h) backoff.
- **Eligibility re-check.** If `!source.isEligible(settings)` (e.g. the user disconnected the
  provider), the row is deleted with `deleteRow` — **just that one row**, not the whole user's
  cache — and `refreshOne` returns. Otherwise the context is built with `source.buildContext(settings)`
  and passed to `fetch`. (The MusicBrainz-username requirement that used to be a hardcoded invariant
  here now lives in the ListenBrainz sources' `isEligible`.)
- **Outcome.** On success, `writeReady` stores the JSON payload and sets
  `nextRefreshAt = fetchedAt + refreshIntervalMs`; an empty payload uses `emptyRetryIntervalMs`
  instead (so an account with no recommendations yet retries hourly rather than waiting the full
  cycle). On failure, `writeError` sets a backoff of `min(refreshIntervalMs, 15min)`.

## Reconcile: which rows should exist

`reconcileUserRows(settings, opts?)` (`eligibility.ts`) is the single source of truth for the set
of cache rows a user should have. It walks `listRegisteredSources()` and, per source:

- **eligible** → `upsertWarmingRow` (idempotent via `onConflictDoNothing`, so it never clobbers an
  existing `ready` row), and with `{ forceRefresh: true }` also `resetWarmingForUserSource` to push
  the row back to `warming` (used when a credential just changed, so the next tick refetches);
- **not eligible** → `deleteForUserSource`, removing **only that source's** row.

Because deletion is scoped per source, disconnecting one provider never disturbs another's cached
recommendations — the bug that a global "delete all rows for this user" would cause.

### Boot backfill

In `index.ts` `start()`, before the server accepts requests and before the refresher starts:

1. `resetInflightOnBoot()` clears any `inflight = 1` rows left behind by an unclean shutdown, so
   they become claimable again.
2. `reconcileUserRows` is called for every `getAllUserSettings()` row, seeding warming rows for
   each user's eligible sources.
3. `startRefresher()` starts the interval, and a single immediate `tick()` is fired so freshly
   seeded warming rows resolve without waiting a full minute.

### Settings changes

When a user updates their integration credentials, `routes/settings.ts` calls `reconcileUserRows`
(with `forceRefresh` when a token is set or changed) and then kicks a `tick()`. Clearing a
provider's credentials reconciles that provider's rows away; adding or changing them seeds and
force-refreshes the affected rows.

## In-library matching

`in-library.ts` re-resolves library membership on every serve rather than trusting the cached
payload. `refreshTracksInLibrary` looks up `getLocalTrackMbidsByMbids` and rewrites each track's
`inLibrary`; `refreshPlaylistsInLibrary` looks up `getTracksByMusicbrainzIds` and rewrites both
`inLibrary` and `localTrackId` per playlist track. The reason is correctness, not performance: a
recommended recording can transition into the library at any time (a completed download, a library
scan, a manual import), and the UI's "play now" vs. "request download" affordance must reflect the
truth at request time.

## Serving

The route (`routes/recommendations.ts`) is mounted under the protected `/api/recommendations`
prefix and exposes `GET /tracks` and `GET /playlists`. Both delegate to a shared `buildResponse`,
which returns the discriminated `RecommendationsResponse` union:

| Status     | When                                                                                  |
| ---------- | ------------------------------------------------------------------------------------- |
| `no-token` | The user is eligible for **no** source of this kind (lacks the required credentials). |
| `warming`  | No cache rows yet (rows are lazily seeded here too), or all rows are warming/empty.   |
| `ready`    | At least one row has a payload; merged data is returned.                              |
| `error`    | All rows are in `error`; stale merged data is returned if any exists, else `null`.    |

`buildResponse` first filters the registry to the sources for this kind the user `isEligible` for;
if none, it returns `no-token` (the wire value is unchanged — it now means "no eligible source").
When those eligible sources have no rows yet, the route seeds their warming rows on the spot (so a
first-ever request kicks off warming) and returns `warming`. Otherwise the route parses every source's payload for the
kind, merges and dedupes them (by `recordingMbid` for tracks, by playlist `id`), and runs the merged
result through the live in-library pass before responding. The wire contract is owned by the zod
schemas in `packages/shared/src/types/zod/api/recommendations.ts` — the server validates outgoing
payloads against them and the web client validates incoming responses.

## Web consumer

`apps/web/src/hooks/useRecommendations.ts` exposes `useRecommendedTracks` and
`useRecommendedPlaylists` (TanStack Query). While the response `status` is `warming` the query
polls every 5 seconds, so a just-seeded account fills in without a manual refresh; once past
warming it holds a 10-minute `staleTime`. The hook validates each response with the shared schema
via a small `ParseSchema<T>` interface — a deliberate duck-typing workaround for a Zod v3/v4
version skew between `@staccato/shared` and the web bundle, documented inline and to be removed when
shared upgrades to Zod v4.

## In-house recommendations (Last.fm)

Alongside the ListenBrainz sources, an in-house engine generates personalised themed virtual
playlists from the user's own listening history, backed by a rate-limited Last.fm read client
(`apps/server/src/lastfm/client.ts`). It plugs into the same pipeline as a `RecommendationSource` of
kind `playlists` (`inhouse/source.ts`, `id` `"inhouse"`), so it needs no bespoke refresher or route:
`fetch` runs profile → applicable generators → resolution and zod-validates the result. Eligibility
reads the **server-global** Last.fm `apiKey` from `serverConfig` (not a per-user credential), because
public Last.fm reads need only the application key. Four generators ship (Genre Mix, More From
Artists You Love, Something New, Decade Mix), each emitting 0 or 1 mix per refresh. The shared
resolution pass (`inhouse/resolution/resolve.ts`) name-resolves every `(artist, title)` candidate by
scored mirror search (the flaky Last.fm candidate MBID is deliberately not trusted), picks an
owned-first winner via `selectWinner` at `RECS_RESOLUTION_THRESHOLD` (~0.70), then batch-enriches the
non-local remainder via MusicBrainz and cover art. See the `recommendations` rule
(`.claude/rules/recommendations.md`) for the full profile/candidate/generator detail.

### Playlist track-suggestions (SP3)

Sub-project 3 adds **per-playlist** track-suggestions ("more like this playlist"), served at
`GET /api/playlists/:id/suggestions` and shown three-at-a-time under the playlist on the web. It
reuses the in-house resolution and in-library machinery but runs on its **own** cache and refresher,
because its natural key is `(userId, playlistId)` — a shape the per-`(userId, source, kind)`
`recommendation_cache` cannot express.

**Data model.** `playlist_suggestions_cache` (`db/schema/playlist-suggestions-cache.ts`) mirrors
`recommendation_cache`'s columns and `warming|ready|error` / `inflight` / `nextRefreshAt` lifecycle,
but is keyed by a unique `(user_id, playlist_id)` index and cascade-deletes with **both** the user
and the playlist. The same partial index `idx_playlist_suggestions_cache_due` on
`nextRefreshAt WHERE inflight = 0` drives the due-scan. Queries live in
`db/queries/playlist-suggestions-cache.ts` (`upsertWarmingSuggestionRow`,
`claimSuggestionForRefresh`, `writeSuggestionReady`/`writeSuggestionError`, `markSuggestionStale`,
`resetInflightSuggestionsOnBoot`, …).

**Compute.** `computeSuggestions` (`recommendations/playlist-suggestions/compute.ts`) orchestrates:

1. **Seed.** `getPlaylistTracksForSeeding` reads the playlist's tracks (canonical title/artist + the
   MBIDs and `addedAt`); `buildSeeds` (`seeds.ts`) sorts newest-added first, caps at `SEED_CAP`, and
   returns `[]` below `MIN_SEEDS` (the cold-start gate — a brand-new or tiny playlist yields nothing).
2. **Fan out + aggregate.** `aggregateSimilar` (`similarity.ts`) calls `getSimilarTracks`
   (`track.getSimilar`) for each seed (up to `PER_SEED_CAP` neighbours each), **addressing by
   artist+title — never the local recording MBID**. Last.fm's similarity index has poor
   per-recording-MBID coverage: addressing by MBID frequently errors (`"Track not found"`, code 6) or
   returns an empty neighbour set even when the MBID resolves, while the name lookup resolves
   reliably — so the `Seed` deliberately carries no MBID (the same "don't trust Last.fm MBIDs" stance
   resolution takes, decision E4). It ranks candidates by **overlap** — the number of distinct seeds
   that returned them — tie-broken by summed `matchScore`, excluding any track already in the playlist
   by recording-MBID or by normalized `(artist, title)`, capped to `TARGET_TRACKS`. Each survivor's `popularityRank` is its final rank index, so resolution
   preserves the order.
3. **Resolve.** The ranked candidates go through `resolveCandidates`, the shared nucleus extracted
   from `resolvePlaylists` (batched name-resolve → owned-first `selectWinner` → batched library + MB
   enrichment), returning a flat `RecommendedPlaylistTrack[]`. Empty on cold-start or when nothing
   resolves.

| Constant               | Value | Role                                            |
| ---------------------- | ----- | ----------------------------------------------- |
| `MIN_SEEDS`            | 3     | Cold-start gate: fewer tracks → no suggestions. |
| `SEED_CAP`             | 30    | Max seeds fanned out per recompute.             |
| `PER_SEED_CAP`         | 50    | Similar tracks pulled per seed.                 |
| `TARGET_TRACKS`        | 25    | Final ranked suggestion count.                  |
| `REFRESH_INTERVAL_MS`  | 24h   | Reschedule after a non-empty refresh.           |
| `EMPTY_RETRY_MS`       | 1h    | Retry sooner when the result is empty.          |
| `DEBOUNCE_MS`          | 60s   | Trailing debounce after a playlist edit.        |
| `MAX_ERROR_BACKOFF_MS` | 15min | Error backoff cap.                              |

**Refresher.** `startSuggestionsRefresher` (`refresher.ts`) installs a 60s tick that scans due rows
and fires `refreshOneSuggestion` per id (fire-and-forget). `refreshOneSuggestion` atomically claims
the row (`claimSuggestionForRefresh`), deletes it if the playlist is gone (guarding the
cascade-delete race), runs `computeSuggestions`, and writes `ready` (`+24h`, or `+1h` for an empty
payload) or `error` (capped backoff). Boot wires `resetInflightSuggestionsOnBoot()` then
`startSuggestionsRefresher()` alongside the ListenBrainz refresher in `index.ts`.

**Serving.** The route (`routes/playlists.ts`) requires playlist ownership (404/403), then gates on
the server-global Last.fm key — returning `no-token` (the UI hides the section) rather than seeding
rows that would only compute empty. On the first view with no row it lazily seeds a `warming` row;
otherwise it parses the cached payload, runs it through `refreshPlaylistTracksInLibrary`
(`in-library.ts`, a flat-list sibling of `refreshPlaylistsInLibrary` sharing the same
`applyLibraryToTracks` mapping so `inLibrary`/`localTrackId` are live, never cached), and returns
`ready` (or `error` with stale data if present). Adding or removing a playlist track calls
`markSuggestionStale(userId, playlistId, now + DEBOUNCE_MS)` to pull the next recompute forward
(trailing debounce). The wire envelope is `PlaylistSuggestionsResponseSchema` (reusing
`RecommendedPlaylistTrackSchema`).

**Web.** `usePlaylistSuggestions` polls every 5s while `warming` and holds a 10-minute `staleTime`
otherwise. The playlist page renders three suggestions at a time, advancing the window as in-library
tracks are added (out-of-library tracks reuse the Explore request-download dialog, in-library tracks
get an add-to-playlist button).

**Deferred** (design §12): a genre-affinity fallback for thin/obscure playlists that come up empty,
per-session dismissal, an artist-similarity axis, and boot pre-warming.

## Adding a source

1. Implement `RecommendationSource<Kind, Payload, Ctx>` in `sources/`: a zod-validated `fetch`,
   sensible `refreshIntervalMs` (and `emptyRetryIntervalMs` if empty results should retry sooner),
   and `isEligible` / `buildContext` reading whatever credentials the provider needs from
   `UserSettingsRow`. A brand-new integration also needs its credential columns added to
   `user_settings` (schema + migration) and a way for users to set them.
2. Register it with `registerSource(...)` in `sources/index.ts`.
3. Serve its `kind` from `routes/recommendations.ts`, providing the appropriate merge/dedupe and the
   live in-library pass.

Warming rows are then seeded automatically by `reconcileUserRows` — at boot for every eligible
user, whenever settings change, and lazily by the route on first request. The refresher, boot, and
route code need no changes for the new provider.
