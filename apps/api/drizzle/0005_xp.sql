CREATE TABLE `course_completion` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text,
	`course_title` text NOT NULL,
	`completed_by` text,
	`completed_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`completed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_completion_user_course_idx` ON `course_completion` (`user_id`,`course_id`);--> statement-breakpoint
CREATE TABLE `xp_event` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`source_key` text NOT NULL,
	`amount` integer NOT NULL,
	`label` text NOT NULL,
	`course_id` text,
	`granted_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`granted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `xp_event_user_source_key_idx` ON `xp_event` (`user_id`,`source`,`source_key`);--> statement-breakpoint
CREATE INDEX `xp_event_user_idx` ON `xp_event` (`user_id`);--> statement-breakpoint
ALTER TABLE `course` ADD `xp_required` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `course` ADD `completion_xp` integer DEFAULT 200 NOT NULL;