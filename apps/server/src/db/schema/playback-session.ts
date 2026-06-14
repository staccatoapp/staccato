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
    .references(() => users.id, { onDelete: "cascade" }),
  playbackSourceId: text("playback_source_id").references(() => albums.id, {
    onDelete: "set null",
  }), // TODO - hack, fails when we implement playlists/other playback sources. using for now so i don't need to create a new table for playback sources
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
  // Staccato Connect: the device currently allowed to emit audio. Nullable —
  // null means no device has claimed the session; the next client to connect
  // auto-claims. References an in-memory device id (mobile = auth_tokens.id,
  // web = a client-generated id), so there is no FK constraint.
  activeDeviceId: text("active_device_id"),
  // Server wall-clock (unix ms) when the last authoritative state-report was
  // accepted. Lets passive devices dead-reckon position and orders reports.
  playbackUpdatedAtMs: integer("playback_updated_at_ms").notNull().default(0),
  // Monotonic per-active-session report counter. The active device numbers its
  // reports; the server drops any report whose seq is not greater than this, and
  // resets it to 0 whenever activeDeviceId changes (a new owner restarts from 1).
  stateSeq: integer("state_seq").notNull().default(0),
});
