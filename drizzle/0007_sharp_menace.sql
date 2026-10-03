DROP INDEX `audit_workspace_created`;--> statement-breakpoint
CREATE INDEX `audit_workspace_created_id` ON `audit_events` (`workspace_id`,`created_at`,`id`);--> statement-breakpoint
DROP INDEX `jobs_workspace_created`;--> statement-breakpoint
CREATE INDEX `jobs_workspace_created_id` ON `analysis_jobs` (`workspace_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `jobs_workspace_active_created_id` ON `analysis_jobs` (`workspace_id`,`created_at`,`id`) WHERE "analysis_jobs"."status" IN ('queued','running');