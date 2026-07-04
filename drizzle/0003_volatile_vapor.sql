CREATE TABLE `problem_overrides` (
	`user_id` text NOT NULL,
	`bundled_problem_id` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`updated_at_ms` integer NOT NULL,
	PRIMARY KEY(`user_id`, `bundled_problem_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bundled_problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `problem_tombstones` (
	`user_id` text NOT NULL,
	`bundled_problem_id` text NOT NULL,
	`hidden_at_ms` integer NOT NULL,
	PRIMARY KEY(`user_id`, `bundled_problem_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bundled_problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE cascade
);
