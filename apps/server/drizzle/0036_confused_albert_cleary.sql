ALTER TABLE `listening_history` ADD `scrobbled_to_listenbrainz` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `listening_history_user_id_idx` ON `listening_history` (`user_id`);--> statement-breakpoint
CREATE INDEX `listening_history_track_id_idx` ON `listening_history` (`track_id`);--> statement-breakpoint
CREATE INDEX `album_artists_artist_id_idx` ON `album_artists` (`artist_id`);--> statement-breakpoint
CREATE INDEX `albums_artist_id_idx` ON `albums` (`artist_id`);--> statement-breakpoint
CREATE INDEX `albums_normalized_title_idx` ON `albums` (`normalized_title`);--> statement-breakpoint
CREATE INDEX `playlist_tracks_playlist_id_idx` ON `playlist_tracks` (`playlist_id`);--> statement-breakpoint
CREATE INDEX `playlist_tracks_track_id_idx` ON `playlist_tracks` (`track_id`);--> statement-breakpoint
CREATE INDEX `tracks_artist_id_idx` ON `tracks` (`artist_id`);--> statement-breakpoint
CREATE INDEX `tracks_album_id_idx` ON `tracks` (`album_id`);--> statement-breakpoint
CREATE INDEX `tracks_resolution_status_idx` ON `tracks` (`resolution_status`);--> statement-breakpoint
CREATE INDEX `tracks_audio_fingerprint_idx` ON `tracks` (`audio_fingerprint`);--> statement-breakpoint
CREATE INDEX `tracks_musicbrainz_id_idx` ON `tracks` (`musicbrainz_id`);--> statement-breakpoint
CREATE INDEX `track_artists_artist_id_idx` ON `track_artists` (`artist_id`);