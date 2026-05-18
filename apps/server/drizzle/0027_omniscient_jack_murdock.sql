CREATE TABLE `recommendation_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`inflight` integer DEFAULT 0 NOT NULL,
	`payload` text,
	`last_error` text,
	`fetched_at` integer,
	`next_refresh_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recommendation_cache_user_source_kind` ON `recommendation_cache` (`user_id`,`source`,`kind`);--> statement-breakpoint
CREATE INDEX `idx_recommendation_cache_due` ON `recommendation_cache` (`next_refresh_at`) WHERE "recommendation_cache"."inflight" = 0;