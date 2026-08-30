ALTER TABLE `transactions` ADD `user_merchant_name` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `user_note` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `user_excluded` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `user_recurring_override` text;