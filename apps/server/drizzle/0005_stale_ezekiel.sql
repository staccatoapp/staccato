PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_playback_session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`playback_source_id` text,
	`track_queue` text,
	`current_track_index` integer DEFAULT 0 NOT NULL,
	`current_track_position_in_seconds` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`playback_source_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_playback_session`("id", "user_id", "playback_source_id", "track_queue", "current_track_index", "current_track_position_in_seconds") SELECT "id", "user_id", "playback_source_id", "track_queue", "current_track_index", "current_track_position_in_seconds" FROM `playback_session`;--> statement-breakpoint
DROP TABLE `playback_session`;--> statement-breakpoint
ALTER TABLE `__new_playback_session` RENAME TO `playback_session`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `playback_session_user_id_unique` ON `playback_session` (`user_id`);