PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_playback_session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`track_queue` text DEFAULT '[]' NOT NULL,
	`current_track_index` integer DEFAULT 0 NOT NULL,
	`current_track_position_in_seconds` integer DEFAULT 0 NOT NULL,
	`current_track_accumulated_play_time_in_seconds` integer DEFAULT 0 NOT NULL,
	`is_playing` integer DEFAULT false NOT NULL,
	`current_track_listen_event_created` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- playback_session is transient per-user playback state, and track_queue's JSON
-- shape changed from string[] to { trackId, source }[]. We deliberately do NOT
-- copy old rows into the rebuilt table: it would reset the queue anyway, and
-- copying runs an FK check (the PRAGMA foreign_keys=OFF above is a no-op inside
-- the migrator's transaction) which fails on any orphaned session. Sessions are
-- re-created per user on the next playback action.
DROP TABLE `playback_session`;--> statement-breakpoint
ALTER TABLE `__new_playback_session` RENAME TO `playback_session`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `playback_session_user_id_unique` ON `playback_session` (`user_id`);--> statement-breakpoint
ALTER TABLE `listening_history` ADD `source_type` text;--> statement-breakpoint
ALTER TABLE `listening_history` ADD `source_id` text;--> statement-breakpoint
CREATE INDEX `listening_history_user_listened_at_idx` ON `listening_history` (`user_id`,`listened_at`);