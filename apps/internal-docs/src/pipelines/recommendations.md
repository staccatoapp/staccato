# Recommendations Pipeline

The recommendations pipeline produces per-user **track** and **playlist** recommendations from
ListenBrainz and surfaces them in the Explore UI, where each item is either playable from the
local library or available to preview and request for download. It lives in
`apps/server/src/recommendations/` and is summarised canonically in
`.claude/rules/recommendations-pipeline.md` — this page is the detailed companion to that rule.

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
