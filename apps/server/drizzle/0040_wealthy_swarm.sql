CREATE TABLE `playlist_suggestions_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`playlist_id` text NOT NULL,
	`status` text NOT NULL,
	`inflight` integer DEFAULT 0 NOT NULL,
	`payload` text,
	`last_error` text,
	`fetched_at` integer,
	`next_refresh_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `playlist_suggestions_cache_user_playlist` ON `playlist_suggestions_cache` (`user_id`,`playlist_id`);--> statement-breakpoint
CREATE INDEX `idx_playlist_suggestions_cache_due` ON `playlist_suggestions_cache` (`next_refresh_at`) WHERE "playlist_suggestions_cache"."inflight" = 0;