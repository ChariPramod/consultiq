CREATE TABLE `coaching_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`coaching_id` text NOT NULL,
	`decision` text NOT NULL,
	`guidance` text NOT NULL,
	`notes` text NOT NULL,
	`base_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`coaching_id`) REFERENCES `coaching_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `coaching_reviews_parent` ON `coaching_reviews` (`workspace_id`,`coaching_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `practice_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`call_id` text NOT NULL,
	`baseline_id` text NOT NULL,
	`review_id` text,
	`dimension` integer NOT NULL,
	`instruction` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`call_id`) REFERENCES `consultations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`baseline_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`review_id`) REFERENCES `coaching_reviews`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `practice_workspace_call` ON `practice_assignments` (`workspace_id`,`call_id`);--> statement-breakpoint
CREATE TABLE `practice_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`assessment_id` text NOT NULL,
	`reflection` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignment_id`) REFERENCES `practice_assignments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `practice_completions_assignment_id_unique` ON `practice_completions` (`assignment_id`);