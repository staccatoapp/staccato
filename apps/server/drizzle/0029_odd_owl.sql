CREATE TABLE `track_artists` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`position` integer NOT NULL,
	`join_phrase` text,
	`created_at` integer,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `track_artists_track_id_position_unique` ON `track_artists` (`track_id`,`position`);--> statement-breakpoint
DROP INDEX `albums_title_artist_id_unique`;--> statement-breakpoint
ALTER TABLE `albums` ADD `confidence_score` real;--> statement-breakpoint
CREATE UNIQUE INDEX `albums_title_artist_id_release_mbid_unique` ON `albums` (`title`,`artist_id`,`release_mbid`);--> statement-breakpoint
ALTER TABLE `tracks` ADD `file_mtime` integer;--> statement-breakpoint
ALTER TABLE `tracks` ADD `audio_fingerprint` text;--> statement-breakpoint
ALTER TABLE `tracks` ADD `resolution_method` text;--> statement-breakpoint
ALTER TABLE `tracks` ADD `confidence_score` real;--> statement-breakpoint
ALTER TABLE `tracks` ADD `pending_removal_at` integer;