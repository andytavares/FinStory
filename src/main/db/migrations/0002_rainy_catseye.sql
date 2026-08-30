DROP INDEX `alert_rules_type_unique`;--> statement-breakpoint
ALTER TABLE `alert_rules` ADD `label` text;--> statement-breakpoint
ALTER TABLE `alert_rules` ADD `is_system` integer DEFAULT false NOT NULL;