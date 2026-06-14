ALTER TABLE `playback_session` ADD `playback_updated_at_ms` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `playback_session` ADD `state_seq` integer DEFAULT 0 NOT NULL;