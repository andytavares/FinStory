-- Imported accounts have no Plaid item. SQLite cannot drop NOT NULL in place, so
-- rebuild the table (documented 12-step pattern). Foreign keys stay off for the
-- rebuild: DROP TABLE would otherwise cascade-delete every account.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_institutions` (
	`id` text PRIMARY KEY NOT NULL,
	`plaid_item_id` text,
	`access_token_encrypted` text NOT NULL,
	`institution_name` text NOT NULL,
	`sync_cursor` text,
	`status` text DEFAULT 'healthy' NOT NULL,
	`last_synced_at` text,
	`last_attempted_sync_at` text,
	`created_at` text NOT NULL,
	`source` text DEFAULT 'plaid' NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_institutions`("id", "plaid_item_id", "access_token_encrypted", "institution_name", "sync_cursor", "status", "last_synced_at", "last_attempted_sync_at", "created_at") SELECT "id", "plaid_item_id", "access_token_encrypted", "institution_name", "sync_cursor", "status", "last_synced_at", "last_attempted_sync_at", "created_at" FROM `institutions`;--> statement-breakpoint
DROP TABLE `institutions`;--> statement-breakpoint
ALTER TABLE `__new_institutions` RENAME TO `institutions`;--> statement-breakpoint
CREATE UNIQUE INDEX `institutions_plaid_item_id_unique` ON `institutions` (`plaid_item_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
