DROP INDEX `idx_sets_activity`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sets_activity_number` ON `sets` (`activity_id`,`set_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_set_logs_set` ON `set_logs` (`set_id`);