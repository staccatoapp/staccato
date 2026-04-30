ALTER TABLE `user_settings` ADD `musicbrainz_username` text;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `listenbrainz_token`;