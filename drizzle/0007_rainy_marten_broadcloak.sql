PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`context_id` text NOT NULL,
	`activity_number` integer,
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
INSERT INTO `__new_activities`("id", "context_id", "activity_number", "status", "config_json", "share_code", "state_json", "version", "created_by_user_id", "started_at", "updated_at", "all_devices_disconnected_at", "abandoned_at", "ended_at") SELECT "id", "context_id", "activity_number", "status", "config_json", "share_code", "state_json", "version", "created_by_user_id", "started_at", "updated_at", "all_devices_disconnected_at", "abandoned_at", "ended_at" FROM `activities`;--> statement-breakpoint
DROP TABLE `activities`;--> statement-breakpoint
ALTER TABLE `__new_activities` RENAME TO `activities`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_activities_share_code` ON `activities` (`share_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_activities_context_number` ON `activities` (`context_id`,`activity_number`);--> statement-breakpoint
CREATE INDEX `idx_activities_context_started` ON `activities` (`context_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_activities_status` ON `activities` (`status`);
--> statement-breakpoint
UPDATE `activities` SET `activity_number` = NULL;
--> statement-breakpoint
UPDATE `activities`
SET `activity_number` = (
  SELECT COUNT(*)
  FROM `activities` AS earlier
  WHERE earlier.`context_id` = `activities`.`context_id`
    AND earlier.`id` IN (SELECT DISTINCT `activity_id` FROM `sets`)
    AND (
      earlier.`started_at` < `activities`.`started_at`
      OR (earlier.`started_at` = `activities`.`started_at` AND earlier.`id` <= `activities`.`id`)
    )
)
WHERE `id` IN (SELECT DISTINCT `activity_id` FROM `sets`);
--> statement-breakpoint
UPDATE `set_logs`
SET `activity_number` = (
  SELECT `activity_number` FROM `activities` WHERE `activities`.`id` = `set_logs`.`activity_id`
);