import { createId } from "@paralleldrive/cuid2";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { PlaybackSource } from "@staccato/shared";
import { users } from "./users.js";

/**
 * One queued track plus the source it was enqueued from. Source is per-item (not
 * per-session) so a heterogeneous queue — e.g. an album with a playlist appended
 * via "add to queue" — attributes each recorded listen to the right origin.
 */
export interface QueueItem {
  trackId: string;
  source: PlaybackSource | null;
}

export const playbackSession = sqliteTable("playback_session", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  trackQueue: text("track_queue", { mode: "json" })
    .$type<QueueItem[]>()
    .notNull()
    .default([]),
  currentTrackIndex: integer("current_track_index").notNull().default(0),
  currentTrackPositionInSeconds: integer("current_track_position_in_seconds")
    .notNull()
    .default(0),
  currentTrackAccumulatedPlayTimeInSeconds: integer(
    "current_track_accumulated_play_time_in_seconds",
  ) // Used to determine how long a track has actually been listened to for scrobbling purposes
    .notNull()
    .default(0),
  isPlaying: integer("is_playing", { mode: "boolean" })
    .notNull()
    .default(false),
  currentTrackListenEventCreated: integer(
    "current_track_listen_event_created",
    { mode: "boolean" },
  )
    .notNull()
    .default(false),
});
