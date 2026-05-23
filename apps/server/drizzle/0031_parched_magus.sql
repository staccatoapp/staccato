CREATE TABLE `album_artists` (
	`id` text PRIMARY KEY NOT NULL,
	`album_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`position` integer NOT NULL,
	`join_phrase` text,
	`created_at` integer,
	FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `album_artists_album_id_position_unique` ON `album_artists` (`album_id`,`position`);