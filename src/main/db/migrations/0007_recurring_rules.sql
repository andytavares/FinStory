-- A standing decision about whether a charge is recurring.
--
-- Keyed on payee AND amount, which is the question the user was actually asked:
-- "is this same charge, at this same amount, a recurring one?" Persisted rather
-- than only stamped onto the transactions that existed at the time, so the next
-- instance to arrive follows the decision instead of being asked about again.
CREATE TABLE `recurring_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_key` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`decision` text NOT NULL,
	`cadence` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recurring_rule_idx` ON `recurring_rules` (`merchant_key`,`amount_minor`);
