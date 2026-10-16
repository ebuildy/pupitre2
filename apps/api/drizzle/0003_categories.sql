CREATE TABLE `category` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`parent_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_slug_unique` ON `category` (`slug`);--> statement-breakpoint
CREATE INDEX `category_parent_idx` ON `category` (`parent_id`);--> statement-breakpoint
ALTER TABLE `course` ADD `category_id` text REFERENCES category(id);--> statement-breakpoint
CREATE INDEX `course_category_idx` ON `course` (`category_id`);--> statement-breakpoint
-- Data: one category per distinct free-text course category (slugified, title = capitalised slug), then link courses.
INSERT INTO `category` (`id`, `slug`, `title`)
SELECT lower(hex(randomblob(16))), `slug`, upper(substr(`slug`, 1, 1)) || substr(`slug`, 2)
FROM (
	SELECT DISTINCT replace(lower(trim(`category`)), ' ', '-') AS `slug` FROM `course`
	WHERE `category` IS NOT NULL AND trim(`category`) <> ''
);--> statement-breakpoint
UPDATE `course` SET `category_id` = (
	SELECT `id` FROM `category` WHERE `category`.`slug` = replace(lower(trim(`course`.`category`)), ' ', '-')
) WHERE `category` IS NOT NULL AND trim(`category`) <> '';
