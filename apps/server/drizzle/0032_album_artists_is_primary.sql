ALTER TABLE `album_artists` ADD `is_primary` integer DEFAULT true NOT NULL;--> statement-breakpoint
-- Backfill ownership from existing join phrases (mirrors computePrimaryFlags in
-- @staccato/shared): a credit is a guest once any earlier credit on the same
-- album carries a feature connector (feat./ft./featuring). All rows defaulted
-- to primary above; demote the guests here.
UPDATE `album_artists` SET `is_primary` = 0
WHERE EXISTS (
	SELECT 1 FROM `album_artists` AS `prev`
	WHERE `prev`.`album_id` = `album_artists`.`album_id`
		AND `prev`.`position` < `album_artists`.`position`
		AND (lower(`prev`.`join_phrase`) LIKE '%feat%' OR lower(`prev`.`join_phrase`) LIKE '%ft.%')
);