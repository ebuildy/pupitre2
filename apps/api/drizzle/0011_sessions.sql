CREATE TABLE `course_session` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`title` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer,
	`location` text,
	`capacity` integer,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `course_session_starts_idx` ON `course_session` (`starts_at`);--> statement-breakpoint
CREATE INDEX `course_session_course_idx` ON `course_session` (`course_id`);--> statement-breakpoint
CREATE TABLE `session_booking` (
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`booked_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`attendance` text DEFAULT 'unknown' NOT NULL,
	`marked_by` text,
	`marked_at` integer,
	PRIMARY KEY(`session_id`, `user_id`),
	FOREIGN KEY (`session_id`) REFERENCES `course_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`marked_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `session_booking_user_idx` ON `session_booking` (`user_id`);--> statement-breakpoint
ALTER TABLE `course` ADD `in_person` integer DEFAULT false NOT NULL;