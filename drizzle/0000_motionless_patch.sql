CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`context_id` text NOT NULL,
	`activity_number` integer NOT NULL,
	`status` text NOT NULL,
	`config_json` text NOT NULL,
	`share_code` text NOT NULL,
	`state_json` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`started_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`all_devices_disconnected_at` text,
	`abandoned_at` text,
	`ended_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_activities_share_code` ON `activities` (`share_code`);--> statement-breakpoint
CREATE INDEX `idx_activities_context_started` ON `activities` (`context_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_activities_status` ON `activities` (`status`);--> statement-breakpoint
CREATE TABLE `activity_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL,
	`device_id` text NOT NULL,
	`user_id` text NOT NULL,
	`user_display_name` text NOT NULL,
	`device_label` text NOT NULL,
	`role` text NOT NULL,
	`slot_status` text NOT NULL,
	`reserved_until` text,
	`joined_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`left_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_activity_devices_device` ON `activity_devices` (`activity_id`,`device_id`);--> statement-breakpoint
CREATE INDEX `idx_activity_devices_slots` ON `activity_devices` (`activity_id`,`slot_status`);--> statement-breakpoint
CREATE TABLE `context_players` (
	`context_id` text NOT NULL,
	`player_id` text NOT NULL,
	PRIMARY KEY(`context_id`, `player_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_context_players_player` ON `context_players` (`player_id`);--> statement-breakpoint
CREATE TABLE `leaderboard_entries` (
	`context_id` text NOT NULL,
	`player_id` text NOT NULL,
	`total_points` integer DEFAULT 0 NOT NULL,
	`sets_played` integer DEFAULT 0 NOT NULL,
	`sets_won` integer DEFAULT 0 NOT NULL,
	`sets_lost` integer DEFAULT 0 NOT NULL,
	`games_won` integer DEFAULT 0 NOT NULL,
	`games_lost` integer DEFAULT 0 NOT NULL,
	`game_differential` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`context_id`, `player_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_leaderboard_context_points` ON `leaderboard_entries` (`context_id`,`total_points`);--> statement-breakpoint
CREATE TABLE `player_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`linked_user_id` text,
	`profile_type` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_player_profiles_normalized_name` ON `player_profiles` (`normalized_name`);--> statement-breakpoint
CREATE INDEX `idx_player_profiles_created_by` ON `player_profiles` (`created_by_user_id`);--> statement-breakpoint
CREATE TABLE `score_events` (
	`id` text PRIMARY KEY NOT NULL,
	`client_mutation_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`set_id` text NOT NULL,
	`current_game_id` text NOT NULL,
	`sequence_number` integer NOT NULL,
	`action` text NOT NULL,
	`team` text,
	`previous_snapshot_json` text NOT NULL,
	`next_snapshot_json` text NOT NULL,
	`created_by_device_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`user_display_name` text NOT NULL,
	`device_label` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_score_events_mutation` ON `score_events` (`client_mutation_id`);--> statement-breakpoint
CREATE INDEX `idx_score_events_game_sequence` ON `score_events` (`current_game_id`,`sequence_number`);--> statement-breakpoint
CREATE TABLE `scoreboard_contexts` (
	`id` text PRIMARY KEY NOT NULL,
	`context_key` text NOT NULL,
	`name` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_scoreboard_contexts_key` ON `scoreboard_contexts` (`context_key`);--> statement-breakpoint
CREATE TABLE `set_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`context_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`activity_number` integer NOT NULL,
	`activity_date` text NOT NULL,
	`set_id` text NOT NULL,
	`set_number` integer NOT NULL,
	`blue_player_ids_json` text NOT NULL,
	`red_player_ids_json` text NOT NULL,
	`blue_games` integer NOT NULL,
	`red_games` integer NOT NULL,
	`winner_team` text,
	`conclusion_type` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_set_logs_context_activity` ON `set_logs` (`context_id`,`activity_date`);--> statement-breakpoint
CREATE TABLE `sets` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL,
	`set_number` integer NOT NULL,
	`blue_player_ids_json` text NOT NULL,
	`red_player_ids_json` text NOT NULL,
	`blue_games` integer DEFAULT 0 NOT NULL,
	`red_games` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`winner_team` text,
	`conclusion_type` text,
	`started_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_sets_activity` ON `sets` (`activity_id`,`set_number`);--> statement-breakpoint
CREATE TABLE `user_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`email` text NOT NULL,
	`auth_provider` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_accounts_email` ON `user_accounts` (`email`);