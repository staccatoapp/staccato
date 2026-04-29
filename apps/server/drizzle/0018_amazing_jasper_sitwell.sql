CREATE TABLE `track_lyrics` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text NOT NULL,
	`instrumental` integer NOT NULL,
	`plain_lyrics` text,
	`synced_lyrics` text,
	`created_at` integer,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `track_lyrics_track_id_unique` ON `track_lyrics` (`track_id`);