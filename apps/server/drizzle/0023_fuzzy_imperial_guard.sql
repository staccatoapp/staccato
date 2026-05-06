PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_albums` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`normalized_title` text,
	`canonical_title` text,
	`artist_id` text NOT NULL,
	`release_mbid` text,
	`release_group_mbid` text,
	`cover_art_url` text,
	`release_year` integer,
	`created_at` integer,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_albums`("id", "title", "normalized_title", "canonical_title", "artist_id", "release_mbid", "release_group_mbid", "cover_art_url", "release_year", "created_at") SELECT "id", "title", "normalized_title", "canonical_title", "artist_id", "release_mbid", "release_group_mbid", "cover_art_url", "release_year", "created_at" FROM `albums`;--> statement-breakpoint
DROP TABLE `albums`;--> statement-breakpoint
ALTER TABLE `__new_albums` RENAME TO `albums`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `albums_title_artist_id_unique` ON `albums` (`title`,`artist_id`);--> statement-breakpoint
CREATE TABLE `__new_download_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`musicbrainz_recording_id` text NOT NULL,
	`musicbrainz_release_id` text,
	`artist_name` text NOT NULL,
	`track_title` text NOT NULL,
	`album_title` text,
	`status` text NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_download_requests`("id", "user_id", "musicbrainz_recording_id", "musicbrainz_release_id", "artist_name", "track_title", "album_title", "status", "created_at", "updated_at") SELECT "id", "user_id", "musicbrainz_recording_id", "musicbrainz_release_id", "artist_name", "track_title", "album_title", "status", "created_at", "updated_at" FROM `download_requests`;--> statement-breakpoint
DROP TABLE `download_requests`;--> statement-breakpoint
ALTER TABLE `__new_download_requests` RENAME TO `download_requests`;--> statement-breakpoint
CREATE TABLE `__new_listening_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`track_id` text NOT NULL,
	`listened_at` integer DEFAULT (unixepoch()) NOT NULL,
	`scrobbled_to_listenbrainz` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_listening_history`("id", "user_id", "track_id", "listened_at", "scrobbled_to_listenbrainz") SELECT "id", "user_id", "track_id", "listened_at", "scrobbled_to_listenbrainz" FROM `listening_history`;--> statement-breakpoint
DROP TABLE `listening_history`;--> statement-breakpoint
ALTER TABLE `__new_listening_history` RENAME TO `listening_history`;--> statement-breakpoint
CREATE TABLE `__new_playlist_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`playlist_id` text NOT NULL,
	`track_id` text NOT NULL,
	`position` integer NOT NULL,
	`added_at` integer,
	FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_playlist_tracks`("id", "playlist_id", "track_id", "position", "added_at") SELECT "id", "playlist_id", "track_id", "position", "added_at" FROM `playlist_tracks`;--> statement-breakpoint
DROP TABLE `playlist_tracks`;--> statement-breakpoint
ALTER TABLE `__new_playlist_tracks` RENAME TO `playlist_tracks`;--> statement-breakpoint
CREATE TABLE `__new_playlists` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_playlists`("id", "user_id", "name", "description", "created_at", "updated_at") SELECT "id", "user_id", "name", "description", "created_at", "updated_at" FROM `playlists`;--> statement-breakpoint
DROP TABLE `playlists`;--> statement-breakpoint
ALTER TABLE `__new_playlists` RENAME TO `playlists`;--> statement-breakpoint
CREATE TABLE `__new_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`canonical_title` text,
	`artist_id` text NOT NULL,
	`album_id` text,
	`musicbrainz_id` text,
	`track_number` integer,
	`disc_number` integer,
	`duration_seconds` integer,
	`file_path` text NOT NULL,
	`file_format` text,
	`file_size_bytes` integer,
	`fingerprint_status` text DEFAULT 'pending' NOT NULL,
	`resolution_status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_tracks`("id", "title", "canonical_title", "artist_id", "album_id", "musicbrainz_id", "track_number", "disc_number", "duration_seconds", "file_path", "file_format", "file_size_bytes", "fingerprint_status", "resolution_status", "created_at") SELECT "id", "title", "canonical_title", "artist_id", "album_id", "musicbrainz_id", "track_number", "disc_number", "duration_seconds", "file_path", "file_format", "file_size_bytes", "fingerprint_status", "resolution_status", "created_at" FROM `tracks`;--> statement-breakpoint
DROP TABLE `tracks`;--> statement-breakpoint
ALTER TABLE `__new_tracks` RENAME TO `tracks`;--> statement-breakpoint
CREATE UNIQUE INDEX `tracks_file_path_unique` ON `tracks` (`file_path`);--> statement-breakpoint
CREATE TABLE `__new_playback_session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`playback_source_id` text,
	`track_queue` text DEFAULT '[]' NOT NULL,
	`current_track_index` integer DEFAULT 0 NOT NULL,
	`current_track_position_in_seconds` integer DEFAULT 0 NOT NULL,
	`current_track_accumulated_play_time_in_seconds` integer DEFAULT 0 NOT NULL,
	`is_playing` integer DEFAULT false NOT NULL,
	`current_track_listen_event_created` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`playback_source_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_playback_session`("id", "user_id", "playback_source_id", "track_queue", "current_track_index", "current_track_position_in_seconds", "current_track_accumulated_play_time_in_seconds", "is_playing", "current_track_listen_event_created") SELECT "id", "user_id", "playback_source_id", "track_queue", "current_track_index", "current_track_position_in_seconds", "current_track_accumulated_play_time_in_seconds", "is_playing", "current_track_listen_event_created" FROM `playback_session`;--> statement-breakpoint
DROP TABLE `playback_session`;--> statement-breakpoint
ALTER TABLE `__new_playback_session` RENAME TO `playback_session`;--> statement-breakpoint
CREATE UNIQUE INDEX `playback_session_user_id_unique` ON `playback_session` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_user_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`listenbrainz_token` text,
	`musicbrainz_username` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_user_settings`("id", "user_id", "listenbrainz_token", "musicbrainz_username", "created_at", "updated_at") SELECT "id", "user_id", "listenbrainz_token", "musicbrainz_username", "created_at", "updated_at" FROM `user_settings`;--> statement-breakpoint
DROP TABLE `user_settings`;--> statement-breakpoint
ALTER TABLE `__new_user_settings` RENAME TO `user_settings`;--> statement-breakpoint
CREATE UNIQUE INDEX `user_settings_user_id_unique` ON `user_settings` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_track_lyrics` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text NOT NULL,
	`instrumental` integer NOT NULL,
	`plain_lyrics` text,
	`synced_lyrics` text,
	`created_at` integer,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_track_lyrics`("id", "track_id", "instrumental", "plain_lyrics", "synced_lyrics", "created_at") SELECT "id", "track_id", "instrumental", "plain_lyrics", "synced_lyrics", "created_at" FROM `track_lyrics`;--> statement-breakpoint
DROP TABLE `track_lyrics`;--> statement-breakpoint
ALTER TABLE `__new_track_lyrics` RENAME TO `track_lyrics`;--> statement-breakpoint
CREATE UNIQUE INDEX `track_lyrics_track_id_unique` ON `track_lyrics` (`track_id`);