---
paths:
  - "apps/server/src/db/schema/listening-history.ts"
  - "apps/server/src/db/schema/listen-scrobbles.ts"
  - "apps/server/src/db/queries/listening-history.ts"
  - "apps/server/src/db/queries/listen-scrobbles.ts"
  - "apps/server/src/scrobbling/**"
  - "apps/server/src/routes/playback.ts"
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
by SQLite via `DEFAULT (unixepoch())` at insert — callers never pass it). No indexes beyond the
PK, no dedup at the query layer. `db/queries/listening-history.ts` exposes one function,
`insertListenEvent(userId, trackId)`, which inserts and returns the row including the server-set
`listenedAt`.

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
records a listen when `!current.currentTrackListenEventCreated && isPlaying && shouldRecordListen(accumulatedSeconds, durationSeconds)`. `shouldRecordListen` is exported from `scrobbling/dispatch.ts` and encapsulates the ListenBrainz rule: `accumulatedSeconds > Math.min(240, (durationSeconds ?? 480) / 2)` — half the track or four minutes, whichever is less; unknown duration assumes 8 minutes (threshold = 240 s). The `currentTrackListenEventCreated` flag on the `playback_session` row is the dedup gate: once the server sets it `true`, it must not be overwritten by a concurrent client poll carrying a stale `false` — the expression persisting it is `listenEventCreated || (currentTrackListenEventCreated ?? false)`. The client resets the flag to `false` on every track change (skip / next / previous / track-end) to re-arm the gate for the new track.

## Scrobbling: Pluggable Targets

Scrobble destinations are provider-agnostic, mirroring the recommendations source pattern (see
[[recommendations]]). A target implements `ScrobbleTarget<Ctx>` (`scrobbling/target.ts`): a string
`id`, plus three behaviour hooks — `isEligible(settings)` (does the user have the credentials this
target needs), `buildContext(settings)` (build the typed `Ctx` from a `UserSettingsRow`), and
`submit(ctx, listen, log)` (push one `ListenSubmission`). A module-level registry keyed by `id` is
exposed via `registerTarget` and `listRegisteredTargets`; targets self-register by import
side-effect in `scrobbling/targets/index.ts`. The dispatch core never names any external service.
The only concrete target today is `listenbrainz` (`scrobbling/targets/listenbrainz.ts`), eligible
when `listenbrainzToken` is present and wrapping `submitListen` (`listenbrainz/client.ts`,
`listenType: "single"`, POST to `/submit-listens`).

When the threshold trips, the route calls `recordListen(userId, trackId, log)`
(`scrobbling/dispatch.ts`) **fire-and-forget** (`.catch()` swallows; failures are logged inside).
It always `insertListenEvent`s the local ledger row first, then loads the full `UserSettingsRow`
via `getOrCreateUserSettings` and filters `listRegisteredTargets()` to those whose `isEligible`
passes. No eligible target → `warn` and return (the local row stays written). It then fetches
scrobble metadata via `getTrackForScrobble` (track `title`, `artistName`, `musicbrainzId`); a
missing title or artist also `warn`s and returns. Otherwise it builds one `ListenSubmission` and
fans out over eligible targets with `Promise.allSettled` so one slow/failing target never blocks
another: per target it `createPendingScrobble`s, awaits `submit`, then `markScrobble`s
`delivered`; on throw it logs at `error` and `markScrobble`s `failed` with the error string.

## Adding A Scrobble Target

Implement `ScrobbleTarget<Ctx>` in `scrobbling/targets/`, reading whatever credentials the
provider needs from `UserSettingsRow` in `isEligible`/`buildContext` (add columns + a migration if
it's a new integration), and register it in `scrobbling/targets/index.ts`. No change to
`dispatch.ts`, the route, or the DB tables is needed — the new target gets its own
`listen_scrobbles` rows automatically.

## Current Limitations

The `listening_history` table is currently **write-only**: nothing in the codebase reads it (no
stats, recently-played, or export features yet). Submissions are single listens only — there is
no batching or `listenType: "import"`. A retry job that would replay `listen_scrobbles` rows stuck
at `pending`/`failed` (e.g. after a transient target failure) is not yet implemented — the
per-target status table is in place to support one, but a failed scrobble is currently never
automatically retried.
