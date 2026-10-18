CREATE TABLE `lab_check` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`user_email` text NOT NULL,
	`module_id` text NOT NULL,
	`step_index` integer,
	`step_title` text,
	`allow` integer NOT NULL,
	`violations` text NOT NULL,
	`verified` integer NOT NULL,
	`checked_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`module_id`) REFERENCES `module`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lab_check_user_module_idx` ON `lab_check` (`user_id`,`module_id`);--> statement-breakpoint
CREATE INDEX `lab_check_checked_idx` ON `lab_check` (`checked_at`);--> statement-breakpoint
ALTER TABLE `module` ADD `lab` text;