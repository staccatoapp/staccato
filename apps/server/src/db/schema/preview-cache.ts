import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const previewCache = sqliteTable("preview_cache", {
  musicbrainzRecordingId: text("musicbrainz_recording_id").primaryKey(),
  deezerTrackId: text("deezer_track_id"),
  itunesTrackId: text("itunes_track_id"),
  previewUrl: text("preview_url"),
  source: text("source", { enum: ["deezer", "itunes", "none"] }),
  cachedAt: integer("cached_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
