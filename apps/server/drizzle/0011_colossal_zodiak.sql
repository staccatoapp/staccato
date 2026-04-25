PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_listening_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`track_id` text NOT NULL,
	`listened_at` integer DEFAULT (unixepoch()) NOT NULL,
	`scrobbled_to_listenbrainz` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_listening_history`("id", "user_id", "track_id", "listened_at", "scrobbled_to_listenbrainz") SELECT "id", "user_id", "track_id", "listened_at", "scrobbled_to_listenbrainz" FROM `listening_history`;--> statement-breakpoint
DROP TABLE `listening_history`;--> statement-breakpoint
ALTER TABLE `__new_listening_history` RENAME TO `listening_history`;--> statement-breakpoint
PRAGMA foreign_keys=ON;