CREATE TABLE `listen_scrobbles` (
	`id` text PRIMARY KEY NOT NULL,
	`listen_id` text NOT NULL,
	`target` text NOT NULL,
	`status` text NOT NULL,
	`last_error` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`listen_id`) REFERENCES `listening_history`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `listen_scrobbles_listen_target` ON `listen_scrobbles` (`listen_id`,`target`);--> statement-breakpoint
ALTER TABLE `listening_history` DROP COLUMN `scrobbled_to_listenbrainz`;