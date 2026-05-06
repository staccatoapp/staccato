CREATE TABLE `server_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`lidarr_url` text,
	`lidarr_api_key` text,
	`updated_at` integer
);
--> statement-breakpoint
ALTER TABLE `download_requests` ADD `musicbrainz_release_group_id` text;--> statement-breakpoint
ALTER TABLE `download_requests` ADD `musicbrainz_artist_id` text;--> statement-breakpoint
ALTER TABLE `download_requests` ADD `lidarr_album_id` integer;--> statement-breakpoint
ALTER TABLE `download_requests` ADD `error_message` text;