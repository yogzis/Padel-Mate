CREATE TABLE `activity_consents` (
	`activity_id` text NOT NULL,
	`player_id` text NOT NULL,
	`accepted_at` text NOT NULL,
	PRIMARY KEY(`activity_id`, `player_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_activity_consents_player` ON `activity_consents` (`player_id`);
--> statement-breakpoint
INSERT OR IGNORE INTO `activity_consents` (`activity_id`, `player_id`, `accepted_at`)
SELECT `id`, `created_by_user_id`, `started_at` FROM `activities`;
--> statement-breakpoint
INSERT OR IGNORE INTO `activity_consents` (`activity_id`, `player_id`, `accepted_at`)
SELECT `activity_id`, `user_id`, `joined_at` FROM `activity_devices`
WHERE `user_id` IS NOT NULL AND `slot_status` != 'released';