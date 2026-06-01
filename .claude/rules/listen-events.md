---
paths:
  - "apps/server/src/db/schema/listening-history.ts"
  - "apps/server/src/db/queries/listening-history.ts"
  - "apps/server/src/routes/playback.ts"
  - "apps/server/src/listenbrainz/client.ts"
  - "apps/web/src/components/layout/player-bar.tsx"
  - "apps/web/src/components/layout/seek-bar.tsx"
---

# Listen Events

A listen event is a single recorded play of a track by a user. It serves a dual purpose: it
is the local record of "this user listened to this track" (the `listening_history` table) and
the trigger for a ListenBrainz scrobble. Recording is owned by the playback-session route
(`apps/server/src/routes/playback.ts`), which decides *when* a play counts and then fires a
fire-and-forget submit to ListenBrainz.

## Data Model

The `listening_history` table (`db/schema/listening-history.ts`) holds one row per recorded
play: `id` (cuid2 PK), `userId` and `trackId` (both `NOT NULL` FKs that cascade-delete with the
user / track), `listenedAt` (unix epoch integer, defaulted by SQLite via `DEFAULT (unixepoch())`
at insert — callers never pass it), and `scrobbledToListenbrainz` (boolean, default `false`,
flipped to `true` only after a successful submit). It is per-user data with no indexes beyond
the primary key. `db/queries/listening-history.ts` exposes exactly two functions:
`insertListenEvent(userId, trackId)` (inserts with the flag `false`, returns the row including
the server-set `listenedAt`) and `markScrobbled(listenId)` (flips the flag). There is no dedup
or transaction at the query layer — every call writes a new row.

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
(skip / next / previous / track-end) to re-arm the gate for the new track.

## Scrobbling

Once the threshold trips, the route calls the private `addListenEvent(userId, trackId, log)`
**fire-and-forget** (`.catch()` swallows; failures are logged inside). It first
`insertListenEvent`s the row, then looks up the user's ListenBrainz token
(`getUserListenbrainzToken`) — absent token logs a `warn` and returns, leaving the row written
but unscrobbled. It then fetches scrobble metadata via `getTrackForScrobble` (track `title`,
`artistName`, `musicbrainzId`); a missing title or artist also `warn`s and returns. Otherwise it
`submitListen(...)` (`listenbrainz/client.ts`, `listenType: "single"`, POST to
`/submit-listens`) and, on success, `markScrobbled(insertedListen.id)`. A failed submit logs at
`error` and leaves the row with `scrobbledToListenbrainz = false`.

## Current Limitations

The `listening_history` table is currently **write-only**: nothing in the codebase reads it (no
stats, recently-played, or export features yet). Submissions are single listens only — there is
no batching or `listenType: "import"`. The retry job that would replay rows stuck at
`scrobbledToListenbrainz = false` (e.g. after a transient ListenBrainz failure) is an explicit
TODO in `playback.ts`, not yet implemented — so a failed scrobble is never automatically retried.
