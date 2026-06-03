# Listen Events

A **listen event** is a single recorded play of a track by a user. It plays two roles at once:
it is the local record that a user listened to a track (a row in the `listening_history` table)
and the trigger that submits a _scrobble_ to every eligible scrobble target. The playback-session
route (`apps/server/src/routes/playback.ts`) decides when a play counts; the recording and
scrobble fan-out are owned by the scrobbling module (`apps/server/src/scrobbling/`), called
fire-and-forget.

Unlike the import or recommendations pipelines, this is not a multi-stage pipeline — it is a
small, self-contained mechanism. The interesting parts are _when_ a play is counted and _what_
happens to it afterwards.

## What a listen event is

Each recorded play is one row in `listening_history`, plus one `listen_scrobbles` row per eligible
target:

- **Local ledger** — `listening_history` is the unconditional, per-user record of "this user
  played this track at this time". It is written for every recorded play regardless of whether any
  scrobble target is configured. Nothing reads this back yet (see
  [Current limitations](#current-limitations--future-work)), but the data is captured from day one.
- **Per-target delivery status** — each scrobble target gets its own `listen_scrobbles` row
  (`pending` → `delivered`/`failed`), so a future retry job can find the deliveries that haven't
  landed, per target, without a single ListenBrainz-specific flag.

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
  shouldRecordListen(currentTrackAccumulatedPlayTimeInSeconds, currentTrackDurationSeconds);
```

`shouldRecordListen(accumulatedSeconds, durationSeconds)` is exported from
`apps/server/src/scrobbling/dispatch.ts` and encapsulates the ListenBrainz rule of thumb: **half
the track or four minutes, whichever is less** (`accumulatedSeconds > Math.min(240, (durationSeconds ?? 480) / 2)`). The `?? 480` fallback assumes an 8-minute track when the duration is unknown, giving a threshold of 240 s.

The `currentTrackListenEventCreated` flag on the `playback_session` row is the **dedup gate** —
once the server sets it `true`, it must not be overwritten by a concurrent client poll that races
in with a stale `false`. The expression that persists it is:

```ts
currentTrackListenEventCreated: listenEventCreated || (currentTrackListenEventCreated ?? false)
```

This ensures that once `listenEventCreated` is set `true` for this poll cycle (the threshold just
fired), the OR wins regardless of what the client sent. The client resets the flag to `false` on
the next track change to re-arm the gate. The accumulator and session state are described in more
detail with the rest of playback session handling; this page only covers the listen-recording
slice of it.

## What happens next: scrobbling

When the threshold trips, the route calls `recordListen(userId, trackId, log)`
(`apps/server/src/scrobbling/dispatch.ts`) **fire-and-forget** — its promise is intentionally not
awaited (`.catch()` swallows the rejection; failures are logged inside). The steps:

1. **Insert the ledger row.** `insertListenEvent(userId, trackId)` writes the `listening_history`
   row and returns it, including the SQLite-assigned `listenedAt` timestamp. This is unconditional.
2. **Find eligible targets.** Load the full `UserSettingsRow` via `getOrCreateUserSettings(userId)`
   and filter `listRegisteredTargets()` to those whose `isEligible(settings)` passes. If none, log
   a `warn` and return — the local row stays written but unscrobbled.
3. **Gather metadata.** `getTrackForScrobble(trackId)` joins `tracks` + `artists` for the
   `title`, `artistName`, and `musicbrainzId`. A missing title or artist also `warn`s and returns.
4. **Fan out.** Build one provider-agnostic `ListenSubmission` and dispatch to every eligible
   target via `Promise.allSettled` so one slow/failing target never blocks another. Per target:
   `createPendingScrobble(listen.id, target.id)`, then `await target.submit(target.buildContext(
settings), submission, log)` → `markScrobble(..., "delivered")`; on throw, log at `error` and
   `markScrobble(..., "failed", String(err))`.

Because the call is fire-and-forget, a slow or failing target never blocks or delays the
`PUT /session/state` response.

### Pluggable scrobble targets

Targets are provider-agnostic, mirroring the [recommendations](../pipelines/recommendations) source pattern. A
target implements `ScrobbleTarget<Ctx>` (`scrobbling/target.ts`):

```ts
export interface ScrobbleTarget<Ctx = unknown> {
  readonly id: string;
  isEligible(settings: UserSettingsRow): boolean;
  buildContext(settings: UserSettingsRow): Ctx;
  submit(
    ctx: Ctx,
    listen: ListenSubmission,
    log: FastifyBaseLogger,
  ): Promise<void>;
}
```

A module-level registry keyed by `id` is exposed via `registerTarget` / `listRegisteredTargets`;
targets self-register by import side-effect in `scrobbling/targets/index.ts`. The only concrete
target today is `listenbrainz` (`scrobbling/targets/listenbrainz.ts`): eligible when
`listenbrainzToken` is set, it wraps `submitListen(...)` (`apps/server/src/listenbrainz/client.ts`),
which POSTs to `https://api.listenbrainz.org/1/submit-listens` with `listen_type: "single"` and a
payload of `listened_at`, `artist_name`, `track_name`, and `additional_info.recording_mbid` (may be
`null`).

**Adding a target:** implement `ScrobbleTarget<Ctx>` in `scrobbling/targets/`, reading the
credentials it needs from `UserSettingsRow` (add columns + a migration for a new integration), and
register it in `scrobbling/targets/index.ts`. No change to `dispatch.ts`, the route, or the DB
tables is needed.

## Data model

The `listening_history` table (`apps/server/src/db/schema/listening-history.ts`) — per-user data,
one row per recorded play, the unconditional local ledger:

| Column        | Type                   | Notes                                                                                 |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| `id`          | `text` (cuid2)         | Primary key, defaulted via `createId()`.                                              |
| `user_id`     | `text`                 | `NOT NULL` FK → `users.id`, `ON DELETE CASCADE`.                                      |
| `track_id`    | `text`                 | `NOT NULL` FK → `tracks.id`, `ON DELETE CASCADE`.                                     |
| `listened_at` | `integer` (unix epoch) | `NOT NULL`, `DEFAULT (unixepoch())` — set by SQLite at insert; callers never pass it. |

There are no indexes beyond the primary key, and no unique constraint — `insertListenEvent` does
no dedup, so repeated triggers would write repeated rows (the `currentTrackListenEventCreated`
gate is what prevents that in practice). Deleting a user or a track cascades away their history.

The `listen_scrobbles` table (`apps/server/src/db/schema/listen-scrobbles.ts`) — one row per
`(listenId, target)`, tracking per-target delivery:

| Column       | Type                   | Notes                                                             |
| ------------ | ---------------------- | ----------------------------------------------------------------- |
| `id`         | `text` (cuid2)         | Primary key, defaulted via `createId()`.                          |
| `listen_id`  | `text`                 | `NOT NULL` FK → `listening_history.id`, `ON DELETE CASCADE`.      |
| `target`     | `text`                 | The target id, e.g. `"listenbrainz"`.                             |
| `status`     | `text` (enum)          | `pending` \| `delivered` \| `failed`.                             |
| `last_error` | `text`                 | Stringified error from the last failed submit; `null` otherwise.  |
| `updated_at` | `integer` (unix epoch) | `NOT NULL`, `DEFAULT (unixepoch())`; refreshed by `markScrobble`. |

A unique index `listen_scrobbles_listen_target` on `(listen_id, target)` enforces one delivery
record per target per listen. Rows cascade-delete with their parent `listening_history` row.

## Current limitations & future work

- **Write-only.** Nothing in the codebase reads `listening_history` or `listen_scrobbles` today —
  there is no recently-played view, no listening stats, and no export. The data is captured for
  future features but currently only flows outward to scrobble targets.
- **No retry.** A failed scrobble leaves its `listen_scrobbles` row at `failed` (or `pending` if
  the process died mid-submit) and is never retried. The per-target status table is in place to
  support a future replay job, but that job is not yet implemented.
- **Single listens only.** Submissions use `listen_type: "single"`; there is no batching or
  `listen_type: "import"` for backfilling history.
