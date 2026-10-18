CREATE TABLE `idp_group_mapping` (
	`id` text PRIMARY KEY NOT NULL,
	`group_name` text NOT NULL,
	`platform_role` text,
	`membership_role` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idp_group_mapping_name_idx` ON `idp_group_mapping` (`group_name`);