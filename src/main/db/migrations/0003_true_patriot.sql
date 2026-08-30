CREATE TABLE `merchant_aliases` (
	`merchant_key` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text,
	`rule_type` text DEFAULT 'unknown' NOT NULL,
	`triggered_by_transaction_id` text,
	`event_occurred_at` text NOT NULL,
	`detected_at` text NOT NULL,
	`delivered_at` text,
	`dismissed_as_false_positive` integer DEFAULT false NOT NULL,
	`dedupe_key` text NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `alert_rules`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_alerts`("id", "rule_id", "rule_type", "triggered_by_transaction_id", "event_occurred_at", "detected_at", "delivered_at", "dismissed_as_false_positive", "dedupe_key") SELECT "id", "rule_id", 'unknown', "triggered_by_transaction_id", "event_occurred_at", "detected_at", "delivered_at", "dismissed_as_false_positive", "dedupe_key" FROM `alerts`;--> statement-breakpoint
DROP TABLE `alerts`;--> statement-breakpoint
ALTER TABLE `__new_alerts` RENAME TO `alerts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `alert_dedupe_idx` ON `alerts` (`dedupe_key`);