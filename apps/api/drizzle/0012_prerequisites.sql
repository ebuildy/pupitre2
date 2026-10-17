CREATE TABLE `course_prerequisite` (
	`course_id` text NOT NULL,
	`required_course_id` text NOT NULL,
	`min_score` integer,
	`module_ids` text DEFAULT '[]' NOT NULL,
	PRIMARY KEY(`course_id`, `required_course_id`),
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`required_course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE cascade
);
