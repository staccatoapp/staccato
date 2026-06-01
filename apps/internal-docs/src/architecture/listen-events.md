# Listen Events

A **listen event** is a single recorded play of a track by a user. It plays two roles at once:
it is the local record that a user listened to a track (a row in the `listening_history` table)
and the trigger that submits a _scrobble_ to ListenBrainz. The mechanism is owned by the
playback-session route (`apps/server/src/routes/playback.ts`), which decides when a play counts
and then submits to ListenBrainz fire-and-forget.

Unlike the import or recommendations pipelines, this is not a multi-stage pipeline — it is a
small, self-contained mechanism. The interesting parts are _when_ a play is counted and _what_
happens to it afterwards.

## What a listen event is

Each recorded play is one row in `listening_history`. The row does double duty:

- **Local ledger** — a per-user record of "this user played this track at this time". Nothing
  reads this back yet (see [Current limitations](#current-limitations--future-work)), but the data
  is captured from day one.
- **Scrobble bookkeeping** — the `scrobbledToListenbrainz` flag tracks whether the play has been
  successfully submitted to the user's ListenBrainz account, so a future retry job can find the
  ones that haven't.

## When a listen is recorded

Play-time accounting lives in the **web client**, not the server. The server is told how much of
the current track has genuinely been listened to and applies the threshold rule.

- `apps/web/src/components/layout/seek-bar.tsx` advances an accumulator on each `timeupdate`
  event from the `<audio>` element, adding only the natural play delta while audio is playing and
  not seeking. Scrubbing and pausing therefore never inflate it — it measures real listening time.
- `apps/web/src/components/layout/player-bar.tsx` polls `PUT /api/playback/session/state` roughly
  every 5 seconds, sending `currentTrackAccumulatedPlayTimeInSeconds` (plus `isPlaying`,
  `currentTrackIndex`, etc.). On a track change (skip, next, previous, or track-end) it sends
  `currentTrackListenEventCreated: false` to re-arm the gate for the new track.

The server records a listen in `PUT /session/state` when all three conditions hold:

```ts
!current.currentTrackListenEventCreated &&
  isPlaying &&
  currentTrackAccumulatedPlayTimeInSeconds >
    Math.min(240, (currentTrackDurationSeconds ?? 480) / 2);
```

This is the ListenBrainz rule of thumb: a play counts once it passes **half the track, or four
minutes, whichever is less** (the `?? 480` fallback assumes an 8-minute track when the duration
is unknown, so the effective threshold is 240s). The `currentTrackListenEventCreated` flag on the
`playback_session` row is the **dedup gate** — the server sets it `true` the instant a listen
fires, so a single play is only ever counted once, and the client resets it to `false` on the
next track. The accumulator and session state are described in more detail with the rest of
playback session handling; this page only covers the listen-recording slice of it.

## What happens next: scrobbling

When the threshold trips, the route calls the private `addListenEvent(userId, trackId, log)`
**fire-and-forget** — its promise is intentionally not awaited (`.catch()` swallows the
rejection; failures are logged inside). The steps:

1. **Insert the row.** `insertListenEvent(userId, trackId)` writes the `listening_history` row
   with `scrobbledToListenbrainz: false` and returns it, including the SQLite-assigned
   `listenedAt` timestamp.
2. **Find the token.** `getUserListenbrainzToken(userId)` — if the user has no ListenBrainz token
   configured, this logs a `warn` and returns. The local row stays written but unscrobbled.
3. **Gather metadata.** `getTrackForScrobble(trackId)` joins `tracks` + `artists` for the
   `title`, `artistName`, and `musicbrainzId`. A missing title or artist also `warn`s and returns.
4. **Submit.** `submitListen(...)` (`apps/server/src/listenbrainz/client.ts`) POSTs to
   `https://api.listenbrainz.org/1/submit-listens` with `listen_type: "single"` and a payload of
   `listened_at`, `artist_name`, `track_name`, and `additional_info.recording_mbid` (may be
   `null`).
5. **Mark it.** On success, `markScrobbled(insertedListen.id)` flips the flag to `true`. A failed
   submit logs at `error` and leaves the row at `false`.

Because the call is fire-and-forget, a slow or failing ListenBrainz never blocks or delays the
`PUT /session/state` response.

## Data model

The `listening_history` table (`apps/server/src/db/schema/listening-history.ts`) — per-user data,
one row per recorded play:

| Column                      | Type                   | Notes                                                                                 |
| --------------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| `id`                        | `text` (cuid2)         | Primary key, defaulted via `createId()`.                                              |
| `user_id`                   | `text`                 | `NOT NULL` FK → `users.id`, `ON DELETE CASCADE`.                                      |
| `track_id`                  | `text`                 | `NOT NULL` FK → `tracks.id`, `ON DELETE CASCADE`.                                     |
| `listened_at`               | `integer` (unix epoch) | `NOT NULL`, `DEFAULT (unixepoch())` — set by SQLite at insert; callers never pass it. |
| `scrobbled_to_listenbrainz` | `integer` (boolean)    | `NOT NULL`, default `false`; flipped `true` only after a successful submit.           |

There are no indexes beyond the primary key, and no unique constraint — `insertListenEvent` does
no dedup, so repeated triggers would write repeated rows (the `currentTrackListenEventCreated`
gate is what prevents that in practice). Deleting a user or a track cascades away their history.

## Current limitations & future work

- **Write-only.** Nothing in the codebase reads `listening_history` today — there is no
  recently-played view, no listening stats, and no export. The data is captured for future
  features but currently only flows outward to ListenBrainz.
- **No retry.** A failed scrobble leaves the row at `scrobbled_to_listenbrainz = false` and is
  never retried. A periodic job that replays unscrobbled rows is an explicit `TODO` in
  `playback.ts`, not yet implemented.
- **Single listens only.** Submissions use `listen_type: "single"`; there is no batching or
  `listen_type: "import"` for backfilling history.
