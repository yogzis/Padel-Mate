CREATE TABLE `mate_invites` (
	`token` text PRIMARY KEY NOT NULL,
	`created_by_player_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`consumed_by_player_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_mate_invites_creator` ON `mate_invites` (`created_by_player_id`);--> statement-breakpoint
CREATE TABLE `mates` (
	`player_id` text NOT NULL,
	`mate_player_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`player_id`, `mate_player_id`)
);
--> statement-breakpoint
DROP INDEX `idx_player_profiles_normalized_name`;--> statement-breakpoint
DROP INDEX `idx_player_profiles_created_by`;--> statement-breakpoint
ALTER TABLE `player_profiles` DROP COLUMN `normalized_name`;--> statement-breakpoint
ALTER TABLE `player_profiles` DROP COLUMN `created_by_user_id`;--> statement-breakpoint
ALTER TABLE `player_profiles` DROP COLUMN `linked_user_id`;--> statement-breakpoint
ALTER TABLE `player_profiles` DROP COLUMN `profile_type`;