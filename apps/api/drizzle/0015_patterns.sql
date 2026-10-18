CREATE TABLE `markdown_pattern` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`parameter` text,
	`html` text NOT NULL,
	`css` text,
	`course_id` text,
	`scope` text DEFAULT '' NOT NULL,
	`origin` text DEFAULT 'admin' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `markdown_pattern_scope_name_idx` ON `markdown_pattern` (`scope`,`name`);