CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`problem_id` text NOT NULL,
	`solution_id` text NOT NULL,
	`problem_title` text NOT NULL,
	`solution_approach` text NOT NULL,
	`mode` text NOT NULL,
	`cpm` real NOT NULL,
	`wpm` real NOT NULL,
	`accuracy_pct` real NOT NULL,
	`duration_ms` integer NOT NULL,
	`total_keystrokes` integer NOT NULL,
	`error_keystrokes` integer NOT NULL,
	`correct_chars` integer NOT NULL,
	`error_map_json` text,
	`created_at_ms` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `attempts_user_id_created_at_ms_idx` ON `attempts` (`user_id`,`created_at_ms`);--> statement-breakpoint
CREATE INDEX `attempts_user_id_problem_id_idx` ON `attempts` (`user_id`,`problem_id`);--> statement-breakpoint
CREATE TABLE `best_scores` (
	`user_id` text NOT NULL,
	`problem_id` text NOT NULL,
	`solution_id` text NOT NULL,
	`mode` text NOT NULL,
	`best_cpm` real NOT NULL,
	`best_accuracy_pct` real NOT NULL,
	`best_duration_ms` integer NOT NULL,
	`attempt_id` text NOT NULL,
	`updated_at_ms` integer NOT NULL,
	PRIMARY KEY(`user_id`, `problem_id`, `solution_id`, `mode`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE no action
);
