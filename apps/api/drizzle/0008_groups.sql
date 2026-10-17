CREATE TABLE `group_course_enrollment` (
	`group_id` text NOT NULL,
	`course_id` text NOT NULL,
	`enrolled_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`group_id`, `course_id`),
	FOREIGN KEY (`group_id`) REFERENCES `user_group`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`enrolled_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `group_course_enrollment_course_idx` ON `group_course_enrollment` (`course_id`);--> statement-breakpoint
CREATE TABLE `group_membership` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`origin` text DEFAULT 'manual' NOT NULL,
	`added_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`),
	FOREIGN KEY (`group_id`) REFERENCES `user_group`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`added_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `group_membership_user_idx` ON `group_membership` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_group` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`origin` text DEFAULT 'local' NOT NULL,
	`parent_id` text,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `user_group`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_group_name_idx` ON `user_group` (lower("name"));--> statement-breakpoint
CREATE INDEX `user_group_parent_idx` ON `user_group` (`parent_id`);--> statement-breakpoint
DROP INDEX `enrollment_grant_user_course_source_idx`;--> statement-breakpoint
ALTER TABLE `enrollment_grant` ADD `via` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `enrollment_grant_user_course_source_via_idx` ON `enrollment_grant` (`user_id`,`course_id`,`source`,`via`);--> statement-breakpoint
CREATE INDEX `enrollment_grant_via_idx` ON `enrollment_grant` (`source`,`via`);