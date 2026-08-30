PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`plaid_account_id` text NOT NULL,
	`name` text NOT NULL,
	`mask` text,
	`type` text NOT NULL,
	`subtype` text,
	`current_balance_minor` integer,
	`balance_as_of` text,
	`is_everyday` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_accounts`("id", "institution_id", "plaid_account_id", "name", "mask", "type", "subtype", "current_balance_minor", "balance_as_of", "is_everyday") SELECT "id", "institution_id", "plaid_account_id", "name", "mask", "type", "subtype", "current_balance_minor", "balance_as_of", "is_monitored" FROM `accounts`;--> statement-breakpoint
DROP TABLE `accounts`;--> statement-breakpoint
ALTER TABLE `__new_accounts` RENAME TO `accounts`;--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_plaid_account_id_unique` ON `accounts` (`plaid_account_id`);--> statement-breakpoint
UPDATE `accounts` SET `is_everyday` = false WHERE lower(coalesce(`subtype`,'')) IN ('savings','cd','money market','hsa','ira','401k','brokerage','roth','529') OR lower(`type`) = 'investment';--> statement-breakpoint
PRAGMA foreign_keys=ON;
