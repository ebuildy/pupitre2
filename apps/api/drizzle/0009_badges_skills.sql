CREATE TABLE `badge_award` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text,
	`course_title` text NOT NULL,
	`name` text NOT NULL,
	`icon` text NOT NULL,
	`awarded_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `badge_award_user_course_idx` ON `badge_award` (`user_id`,`course_id`);--> statement-breakpoint
CREATE INDEX `badge_award_course_idx` ON `badge_award` (`course_id`);--> statement-breakpoint
CREATE TABLE `module_skill` (
	`module_id` text NOT NULL,
	`skill_id` text NOT NULL,
	PRIMARY KEY(`module_id`, `skill_id`),
	FOREIGN KEY (`module_id`) REFERENCES `module`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `skill`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `module_skill_skill_idx` ON `module_skill` (`skill_id`);--> statement-breakpoint
CREATE TABLE `skill` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skill_slug_unique` ON `skill` (`slug`);--> statement-breakpoint
CREATE TABLE `skill_level` (
	`user_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`level` text NOT NULL,
	`completed_courses` integer DEFAULT 0 NOT NULL,
	`total_courses` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `skill_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `skill`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `course` ADD `badge_name` text;--> statement-breakpoint
ALTER TABLE `course` ADD `badge_icon` text;