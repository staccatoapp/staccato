CREATE TABLE `preview_cache` (
	`musicbrainz_recording_id` text PRIMARY KEY NOT NULL,
	`deezer_track_id` text,
	`itunes_track_id` text,
	`preview_url` text,
	`source` text,
	`cached_at` integer NOT NULL
);

--> statement-breakpoint
CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
  track_id UNINDEXED,
  title,
  artist_name,
  album_title,
  tokenize = 'unicode61'
);