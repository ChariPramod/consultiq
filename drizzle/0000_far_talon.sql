CREATE TABLE `assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`call_id` text NOT NULL,
	`rubric_id` text NOT NULL,
	`kind` text NOT NULL,
	`content` text NOT NULL,
	`prompt_version` text NOT NULL,
	`model` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`call_id`) REFERENCES `consultations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rubric_id`) REFERENCES `rubrics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `assessments_call_created` ON `assessments` (`call_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `consultations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`coordinator` text NOT NULL,
	`source` text NOT NULL,
	`outcome` text DEFAULT 'unknown' NOT NULL,
	`turns` text NOT NULL,
	`recorded_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `consultations_workspace_created` ON `consultations` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `knowledge_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`document_id` text NOT NULL,
	`position` integer NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `knowledge_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chunks_workspace` ON `knowledge_chunks` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `chunks_document_position` ON `knowledge_chunks` (`document_id`,`position`);--> statement-breakpoint
CREATE TABLE `coaching_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`call_id` text NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`citations` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`call_id`) REFERENCES `consultations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `coaching_call_created` ON `coaching_runs` (`call_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `knowledge_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `knowledge_workspace` ON `knowledge_documents` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `audit_workspace_created` ON `audit_events` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `analysis_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`call_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`error_code` text,
	`created_at` text NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`call_id`) REFERENCES `consultations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jobs_workspace_created` ON `analysis_jobs` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `rubrics` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`definitions` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rubrics_workspace_created` ON `rubrics` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_owner_id_unique` ON `workspaces` (`owner_id`);