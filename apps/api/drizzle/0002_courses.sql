CREATE TABLE `course` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`category` text,
	`difficulty` text,
	`visibility` text DEFAULT 'private' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_slug_unique` ON `course` (`slug`);--> statement-breakpoint
CREATE INDEX `course_status_visibility_idx` ON `course` (`status`,`visibility`);--> statement-breakpoint
CREATE TABLE `enrollment_grant` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`source` text NOT NULL,
	`granted_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `enrollment_grant_user_course_source_idx` ON `enrollment_grant` (`user_id`,`course_id`,`source`);--> statement-breakpoint
CREATE INDEX `enrollment_grant_course_idx` ON `enrollment_grant` (`course_id`);