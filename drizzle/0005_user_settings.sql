CREATE TABLE `user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`distraction_free` integer NOT NULL,
	`updated_at_ms` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
