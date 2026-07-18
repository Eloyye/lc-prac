CREATE TABLE `local_data_imports` (
	`user_id` text PRIMARY KEY NOT NULL,
	`idempotency_token` text NOT NULL,
	`decision` text NOT NULL,
	`report_json` text NOT NULL,
	`completed_at_ms` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
