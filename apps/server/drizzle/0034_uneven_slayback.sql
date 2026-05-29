ALTER TABLE `artists` ADD `normalized_canonical_name` text;--> statement-breakpoint
CREATE INDEX `artists_normalized_name_idx` ON `artists` (`normalized_name`);--> statement-breakpoint
CREATE INDEX `artists_normalized_canonical_name_idx` ON `artists` (`normalized_canonical_name`);