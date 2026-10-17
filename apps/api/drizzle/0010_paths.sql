CREATE TABLE `learning_path` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`kind` text DEFAULT 'course' NOT NULL,
	`level` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learning_path_slug_unique` ON `learning_path` (`slug`);--> statement-breakpoint
CREATE TABLE `path_enrollment` (
	`path_id` text NOT NULL,
	`user_id` text NOT NULL,
	`enrolled_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`path_id`, `user_id`),
	FOREIGN KEY (`path_id`) REFERENCES `learning_path`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`enrolled_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `path_enrollment_user_idx` ON `path_enrollment` (`user_id`);--> statement-breakpoint
CREATE TABLE `path_item` (
	`path_id` text NOT NULL,
	`position` integer NOT NULL,
	`course_id` text,
	`skill_id` text,
	PRIMARY KEY(`path_id`, `position`),
	FOREIGN KEY (`path_id`) REFERENCES `learning_path`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `skill`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `path_item_course_idx` ON `path_item` (`course_id`);