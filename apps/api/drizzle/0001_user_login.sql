ALTER TABLE `user` ADD `username` text;--> statement-breakpoint
ALTER TABLE `user` ADD `display_username` text;--> statement-breakpoint
ALTER TABLE `user` ADD `role` text DEFAULT 'student' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `is_active` integer DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);