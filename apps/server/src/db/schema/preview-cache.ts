import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const previewSources = ["deezer", "itunes", "none"] as const;
export type PreviewSource = (typeof previewSources)[number];

// todo - probably can use generic trackId instead of separate columns
export const previewCache = sqliteTable("preview_cache", {
  musicbrainzRecordingId: text("musicbrainz_recording_id").primaryKey(),
  deezerTrackId: text("deezer_track_id"),
  itunesTrackId: text("itunes_track_id"),
  previewUrl: text("preview_url"),
  source: text("source", { enum: previewSources }),
  cachedAt: integer("cached_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
