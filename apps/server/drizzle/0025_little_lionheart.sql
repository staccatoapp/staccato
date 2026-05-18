PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_download_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`musicbrainz_release_group_id` text NOT NULL,
	`musicbrainz_artist_id` text NOT NULL,
	`artist_name` text NOT NULL,
	`album_title` text,
	`lidarr_album_id` integer,
	`status` text NOT NULL,
	`error_message` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_download_requests`("id", "user_id", "musicbrainz_release_group_id", "musicbrainz_artist_id", "artist_name", "album_title", "lidarr_album_id", "status", "error_message", "created_at", "updated_at") SELECT "id", "user_id", "musicbrainz_release_group_id", "musicbrainz_artist_id", "artist_name", "album_title", "lidarr_album_id", "status", "error_message", "created_at", "updated_at" FROM `download_requests`;--> statement-breakpoint
DROP TABLE `download_requests`;--> statement-breakpoint
ALTER TABLE `__new_download_requests` RENAME TO `download_requests`;--> statement-breakpoint
PRAGMA foreign_keys=ON;