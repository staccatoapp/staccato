---
paths:
  - "apps/server/src/db/schema/listening-history.ts"
  - "apps/server/src/db/schema/listen-scrobbles.ts"
  - "apps/server/src/db/schema/playback-session.ts"
  - "apps/server/src/db/queries/listening-history.ts"
  - "apps/server/src/db/queries/listen-scrobbles.ts"
  - "apps/server/src/db/queries/playback-session.ts"
  - "apps/server/src/scrobbling/**"
  - "apps/server/src/routes/playback.ts"
  - "apps/server/src/routes/recently-played.ts"
  - "apps/server/src/listenbrainz/client.ts"
  - "apps/web/src/components/layout/player-bar.tsx"
  - "apps/web/src/components/layout/seek-bar.tsx"
---

# Listen Events

A listen event is a single recorded play of a track by a user. It serves a dual purpose: it is
the local record of "this user listened to this track" (the `listening_history` table) and the
trigger for one or more scrobbles. The playback-session route
(`apps/server/src/routes/playback.ts`) decides *when* a play counts; the actual recording and
scrobble fan-out is owned by the scrobbling module (`apps/server/src/scrobbling/`), which the
route calls fire-and-forget.

## Data Model

The `listening_history` table (`db/schema/listening-history.ts`) is the unconditional local
ledger: one row per recorded play with `id` (cuid2 PK), `userId` and `trackId` (both `NOT NULL`
FKs that cascade-delete with the user / track), and `listenedAt` (unix epoch integer, defaulted
by SQLite via `DEFAULT (unixepoch())` at insert — callers never pass it), plus nullable
`sourceType`/`sourceId` recording where the play started from (album or in-library playlist).
Indexed on `userId`, `trackId`, and `(userId, listenedAt)`; no dedup at the query layer.
`db/queries/listening-history.ts` exposes `insertListenEvent(userId, trackId, source?)` and
`getRecentlyPlayedSources(userId, limit)` (distinct non-null sources by most-recent listen, backing
`GET /api/recently-played`, which resolves each id to album/playlist metadata).

Per-target delivery status lives in a separate `listen_scrobbles` table
(`db/schema/listen-scrobbles.ts`): one row per `(listenId, target)` — `id` (cuid2 PK), `listenId`
(FK → `listening_history.id`, cascade-delete), `target` (the target id string, e.g.
`"listenbrainz"`), `status` (`pending | delivered | failed`), `lastError`, and `updatedAt`. A
unique index on `(listenId, target)` enforces one delivery record per target per listen. The
ListenBrainz-specific `scrobbledToListenbrainz` boolean that used to sit on `listening_history`
is gone — delivery status is now per target. `db/queries/listen-scrobbles.ts` exposes
`createPendingScrobble(listenId, target)` (inserts a `pending` row) and `markScrobble(listenId,
target, status, lastError?)` (updates status / lastError / updatedAt).

## When A Listen Is Recorded

The web client owns play-time accounting, not the server. `player-bar.tsx` polls
`PUT /api/playback/session/state` every ~5 seconds, sending
`currentTrackAccumulatedPlayTimeInSeconds` — an accumulator that `seek-bar.tsx` advances only on
genuine `timeupdate` deltas while playing, so scrubbing and pausing never inflate it. The server
records a listen when `!currentTrackListenEventCreated && isPlaying && accumulatedPlayTime >
Math.min(240, (durationSeconds ?? 480) / 2)` — the ListenBrainz "half the track, or four
minutes, whichever is less" rule. The `currentTrackListenEventCreated` flag on the
`playback_session` row is the dedup gate: the server sets it `true` the moment a listen fires so
a track is only counted once per play, and the client resets it to `false` on every track change
(skip / next / previous / track-end). The mobile client (`playback-provider.tsx`) mirrors this.

The play **source** is per queue item, not per session: `playback_session.trackQueue` is
`{ trackId, source }[]` (`source` = `{ type: "album" | "playlist"; id }` or null), stamped at
enqueue time so a heterogeneous queue attributes each listen correctly. The `play`/`queue` bodies
(`PlaybackPlayRequestSchema`/`PlaybackQueueRequestSchema` in shared) carry an optional `source`;
web and mobile send it for album + in-library playlist contexts only. `/session/state` reads
`trackQueue[currentTrackIndex].source` and passes it to `recordListen`. The old single-album
`playbackSourceId` column is gone.

## Scrobbling: Pluggable Targets

Scrobble destinations are provider-agnostic, mirroring the recommendations source pattern (see
[[recommendations]]). A target implements `ScrobbleTarget<Ctx>` (`scrobbling/target.ts`): a string
`id` plus `isEligible(settings)`, `buildContext(settings)`, and `submit(ctx, listen, log)`. A
registry keyed by `id` (`registerTarget`/`listRegisteredTargets`) is populated by import
side-effect in `scrobbling/targets/index.ts`; the dispatch core names no external service. The
only target today is `listenbrainz`, eligible when `listenbrainzToken` is set, wrapping
`submitListen` (`listenType: "single"`, POST to `/submit-listens`).

When the threshold trips, `recordListen(userId, trackId, source, log)` (`scrobbling/dispatch.ts`)
runs **fire-and-forget** (`.catch()` swallows; failures logged inside): it `insertListenEvent`s the
ledger row first (persisting `source`), then fans out to every `isEligible` target via
`Promise.allSettled` (per target: `createPendingScrobble` → `submit` → `markScrobble` `delivered`,
or `failed` with the error on throw). No eligible target, or missing track title/artist from
`getTrackForScrobble`, → `warn` and return with the local row still written.

## Adding A Scrobble Target

Implement `ScrobbleTarget<Ctx>` in `scrobbling/targets/`, reading credentials from
`UserSettingsRow` in `isEligible`/`buildContext` (add columns + a migration for a new integration),
and register it in `scrobbling/targets/index.ts`. No change to `dispatch.ts`, the route, or the DB
tables is needed — the new target gets its own `listen_scrobbles` rows automatically.

## Current Limitations

The `listening_history` table has two readers: the in-house recommendations profile foundation
(`getListenAggregatesForUser`, see [[recommendations]]) aggregates it per track to build a taste
profile, and `getRecentlyPlayedSources` powers the recently-played grid (only non-null-source
plays appear there; contextless plays and rows written before source tracking are excluded). No
listening stats or export yet. Submissions are single listens only (no batching /
`listenType: "import"`). A retry job for `listen_scrobbles` rows stuck at `pending`/`failed` is not
yet implemented — the per-target status table is in place to support one.
