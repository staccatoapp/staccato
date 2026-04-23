CREATE TABLE `playback_session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`playback_source_id` text NOT NULL,
	`track_queue` text,
	`current_track_index` integer DEFAULT 0 NOT NULL,
	`current_track_position_in_seconds` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`playback_source_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE no action
);
