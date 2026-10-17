CREATE TABLE `export_record` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`user_email` text NOT NULL,
	`category` text NOT NULL,
	`fields` text NOT NULL,
	`filters` text NOT NULL,
	`row_count` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
