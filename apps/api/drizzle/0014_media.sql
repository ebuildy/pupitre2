CREATE TABLE `media_asset` (
	`id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`uploaded_by` text,
	`original_url` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_asset_filename_unique` ON `media_asset` (`filename`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_asset_originalUrl_unique` ON `media_asset` (`original_url`);--> statement-breakpoint
ALTER TABLE `course` ADD `thumbnail_url` text;--> statement-breakpoint
ALTER TABLE `module` ADD `media_url` text;--> statement-breakpoint
ALTER TABLE `module` ADD `media_replicate` integer DEFAULT false NOT NULL;