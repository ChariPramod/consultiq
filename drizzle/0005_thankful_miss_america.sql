CREATE TABLE `review_task_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`task_id` text NOT NULL,
	`version` integer NOT NULL,
	`actor_id` text NOT NULL,
	`assignee_id` text NOT NULL,
	`due_date` text,
	`status` text NOT NULL,
	`completion_assessment_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `review_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_task_events_version` ON `review_task_events` (`workspace_id`,`task_id`,`version`);--> statement-breakpoint
CREATE TABLE `review_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`call_id` text NOT NULL,
	`assignee_id` text NOT NULL,
	`due_date` text,
	`status` text NOT NULL,
	`version` integer NOT NULL,
	`completion_assessment_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`call_id`) REFERENCES `consultations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`completion_assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_tasks_workspace_call` ON `review_tasks` (`workspace_id`,`call_id`);--> statement-breakpoint
CREATE INDEX `review_tasks_workspace_updated` ON `review_tasks` (`workspace_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `review_tasks_workspace_assignee` ON `review_tasks` (`workspace_id`,`assignee_id`,`status`);