import { createId } from "@paralleldrive/cuid2";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users.js";
import { albums } from "./albums.js";

export const playbackSession = sqliteTable("playback_session", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  playbackSourceId: text("playback_source_id").references(() => albums.id), // TODO - hack, fails when we implement playlists/other playback sources. using for now so i don't need to create a new table for playback sources
  trackQueue: text("track_queue", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]), // TODO - just an array of track IDs. there is 100% a better way to do this
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
