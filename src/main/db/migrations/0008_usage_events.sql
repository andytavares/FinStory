-- One row per use of a feature. Local only; `feature` is an id from the closed
-- catalog in src/shared/features.ts, never free text.
CREATE TABLE `usage_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`occurred_at` text NOT NULL,
	`feature` text NOT NULL,
	`kind` text NOT NULL,
	`outcome` text NOT NULL,
	`duration_ms` integer
);
--> statement-breakpoint
CREATE INDEX `usage_occurred_idx` ON `usage_events` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `usage_feature_idx` ON `usage_events` (`feature`);
