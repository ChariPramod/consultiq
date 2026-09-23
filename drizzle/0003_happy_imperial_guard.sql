CREATE TABLE `workspace_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`invitee_id` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_invitations_token_hash_unique` ON `workspace_invitations` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_workspace_user` ON `workspace_invitations` (`workspace_id`,`invitee_id`);--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_workspace_user` ON `workspace_members` (`workspace_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `members_user` ON `workspace_members` (`user_id`);--> statement-breakpoint
ALTER TABLE `analysis_jobs` ADD `requested_by` text;--> statement-breakpoint
ALTER TABLE `analysis_jobs` ADD `request_key` text;--> statement-breakpoint
ALTER TABLE `analysis_jobs` ADD `payload_json` text;--> statement-breakpoint
ALTER TABLE `analysis_jobs` ADD `started_at` text;--> statement-breakpoint
ALTER TABLE `analysis_jobs` ADD `lease_until` text;--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_workspace_request` ON `analysis_jobs` (`workspace_id`,`request_key`);--> statement-breakpoint
CREATE INDEX `jobs_status_created` ON `analysis_jobs` (`status`,`created_at`);