CREATE TABLE `lastfm_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_key` text NOT NULL,
	`tags` text NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lastfm_tags_entity_unique` ON `lastfm_tags` (`entity_type`,`entity_key`);--> statement-breakpoint
CREATE TABLE `lastfm_popularity` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_key` text NOT NULL,
	`listeners` integer NOT NULL,
	`playcount` integer NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lastfm_popularity_entity_unique` ON `lastfm_popularity` (`entity_type`,`entity_key`);
