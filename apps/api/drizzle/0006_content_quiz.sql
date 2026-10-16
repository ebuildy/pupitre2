CREATE TABLE `module` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`position` integer NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`inline` integer DEFAULT false NOT NULL,
	`body` text,
	`source_repo` text,
	`source_ref` text,
	`source_path` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `module_course_slug_idx` ON `module` (`course_id`,`slug`);--> statement-breakpoint
CREATE INDEX `module_course_position_idx` ON `module` (`course_id`,`position`);--> statement-breakpoint
CREATE TABLE `module_prerequisite` (
	`module_id` text NOT NULL,
	`requires_module_id` text NOT NULL,
	PRIMARY KEY(`module_id`, `requires_module_id`),
	FOREIGN KEY (`module_id`) REFERENCES `module`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requires_module_id`) REFERENCES `module`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `module_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`module_id` text NOT NULL,
	`viewed_at` integer,
	`best_score` integer,
	`max_score` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`passed_at` integer,
	`last_activity_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`module_id`) REFERENCES `module`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `module_progress_user_module_idx` ON `module_progress` (`user_id`,`module_id`);--> statement-breakpoint
CREATE TABLE `question_attempt_state` (
	`user_id` text NOT NULL,
	`module_id` text NOT NULL,
	`question_key` text NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`cooldown_until` integer,
	`locked` integer DEFAULT false NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `module_id`, `question_key`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`module_id`) REFERENCES `module`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `quiz_submission` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`module_id` text NOT NULL,
	`answers` text NOT NULL,
	`score` integer NOT NULL,
	`max_score` integer NOT NULL,
	`passed` integer NOT NULL,
	`results` text NOT NULL,
	`submitted_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`module_id`) REFERENCES `module`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `quiz_submission_user_module_idx` ON `quiz_submission` (`user_id`,`module_id`);