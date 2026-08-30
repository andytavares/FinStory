CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`plaid_account_id` text NOT NULL,
	`name` text NOT NULL,
	`mask` text,
	`type` text NOT NULL,
	`subtype` text,
	`current_balance_minor` integer,
	`balance_as_of` text,
	`is_monitored` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_plaid_account_id_unique` ON `accounts` (`plaid_account_id`);--> statement-breakpoint
CREATE TABLE `alert_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`threshold_minor` integer,
	`window_minutes` integer,
	`enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alert_rules_type_unique` ON `alert_rules` (`type`);--> statement-breakpoint
CREATE TABLE `alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`triggered_by_transaction_id` text,
	`event_occurred_at` text NOT NULL,
	`detected_at` text NOT NULL,
	`delivered_at` text,
	`dismissed_as_false_positive` integer DEFAULT false NOT NULL,
	`dedupe_key` text NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `alert_rules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alert_dedupe_idx` ON `alerts` (`dedupe_key`);--> statement-breakpoint
CREATE TABLE `baselines` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`period_type` text NOT NULL,
	`mean_minor` integer NOT NULL,
	`stddev_minor` integer NOT NULL,
	`sample_periods` integer NOT NULL,
	`is_sufficient` integer DEFAULT false NOT NULL,
	`computed_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`is_system` integer DEFAULT false NOT NULL,
	`is_hidden` integer DEFAULT false NOT NULL,
	`merged_into_id` text
);
--> statement-breakpoint
CREATE TABLE `categorizations` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`category_id` text NOT NULL,
	`confidence` real NOT NULL,
	`source` text NOT NULL,
	`is_confirmed` integer DEFAULT false NOT NULL,
	`needs_review` integer DEFAULT false NOT NULL,
	`reasoning` text,
	`superseded_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cat_live_idx` ON `categorizations` (`transaction_id`,`superseded_by`);--> statement-breakpoint
CREATE TABLE `diagnostic_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`occurred_at` text NOT NULL,
	`event_type` text NOT NULL,
	`outcome` text NOT NULL,
	`subject_id` text,
	`duration_ms` integer,
	`error_code` text
);
--> statement-breakpoint
CREATE INDEX `diag_occurred_idx` ON `diagnostic_events` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `income_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`merchant_key` text NOT NULL,
	`expected_amount_minor` integer NOT NULL,
	`cadence` text NOT NULL,
	`next_expected_date` text NOT NULL,
	`detection_confidence` real NOT NULL,
	`is_user_confirmed` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `institutions` (
	`id` text PRIMARY KEY NOT NULL,
	`plaid_item_id` text NOT NULL,
	`access_token_encrypted` text NOT NULL,
	`institution_name` text NOT NULL,
	`sync_cursor` text,
	`status` text DEFAULT 'healthy' NOT NULL,
	`last_synced_at` text,
	`last_attempted_sync_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `institutions_plaid_item_id_unique` ON `institutions` (`plaid_item_id`);--> statement-breakpoint
CREATE TABLE `merchant_profiles` (
	`merchant_key` text PRIMARY KEY NOT NULL,
	`category_distribution` text DEFAULT '{}' NOT NULL,
	`user_confirmed_category_id` text,
	`transaction_count` integer DEFAULT 0 NOT NULL,
	`last_updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `period_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`content` text NOT NULL,
	`generated_at` text NOT NULL,
	`delivered_at` text,
	`was_late` integer DEFAULT false NOT NULL,
	`data_complete` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recurring_charge_amount_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`recurring_charge_id` text NOT NULL,
	`old_amount_minor` integer NOT NULL,
	`new_amount_minor` integer NOT NULL,
	`changed_at` text NOT NULL,
	FOREIGN KEY (`recurring_charge_id`) REFERENCES `recurring_charges`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recurring_charge_occurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`recurring_charge_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	FOREIGN KEY (`recurring_charge_id`) REFERENCES `recurring_charges`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recurring_charges` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_key` text NOT NULL,
	`current_amount_minor` integer NOT NULL,
	`cadence` text NOT NULL,
	`first_seen_date` text NOT NULL,
	`last_seen_date` text NOT NULL,
	`cumulative_paid_minor` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`detected_at` text NOT NULL,
	`user_acknowledged` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`is_secret` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`plaid_transaction_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`merchant_name` text,
	`merchant_key` text,
	`description` text NOT NULL,
	`posted_date` text NOT NULL,
	`datetime` text,
	`pending` integer DEFAULT false NOT NULL,
	`settlement_state` text DEFAULT 'posted' NOT NULL,
	`is_internal_transfer` integer DEFAULT false NOT NULL,
	`reverses_transaction_id` text,
	`original_currency` text,
	`original_amount_minor` integer,
	`first_seen_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_plaid_transaction_id_unique` ON `transactions` (`plaid_transaction_id`);--> statement-breakpoint
CREATE INDEX `tx_posted_date_idx` ON `transactions` (`posted_date`);--> statement-breakpoint
CREATE INDEX `tx_merchant_idx` ON `transactions` (`merchant_key`);--> statement-breakpoint
CREATE INDEX `tx_account_idx` ON `transactions` (`account_id`);