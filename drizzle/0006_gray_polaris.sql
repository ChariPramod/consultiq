DROP INDEX `consultations_workspace_created`;--> statement-breakpoint
CREATE INDEX `consultations_workspace_created_id` ON `consultations` (`workspace_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `consultations_workspace_coordinator_recorded` ON `consultations` (`workspace_id`,`coordinator`,`recorded_at`,`id`);--> statement-breakpoint
DROP INDEX `chunks_workspace`;--> statement-breakpoint
CREATE INDEX `chunks_workspace_id` ON `knowledge_chunks` (`workspace_id`,`id`);--> statement-breakpoint
DROP INDEX `knowledge_workspace`;--> statement-breakpoint
ALTER TABLE `knowledge_documents` ADD `body_sha256` text;--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_workspace_body_hash` ON `knowledge_documents` (`workspace_id`,`body_sha256`);--> statement-breakpoint
DROP INDEX `jobs_status_created`;--> statement-breakpoint
CREATE INDEX `jobs_status_created_id` ON `analysis_jobs` (`status`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `jobs_workspace_call_status` ON `analysis_jobs` (`workspace_id`,`call_id`,`status`);--> statement-breakpoint
CREATE INDEX `practice_workspace_created_id` ON `practice_assignments` (`workspace_id`,`created_at`,`id`);