import type { Repository } from './repository.ts';
/** Workspace-scoped aggregates, never transcript content or a claim of worker health. */
export async function operations(repo: Repository) {
  const now = new Date().toISOString();
  const day = new Date(Date.now() - 86400000).toISOString();
  return repo
    .statement(
      `SELECT COALESCE(SUM(status='queued'),0) AS queued,COALESCE(SUM(status='running'),0) AS running,COALESCE(SUM(status='running' AND lease_until IS NOT NULL AND lease_until<=?),0) AS expired_leases,COALESCE(SUM(status='failed' AND finished_at>=?),0) AS failed_last_day,MIN(CASE WHEN status='queued' THEN created_at END) AS oldest_queued_at,MAX(started_at) AS last_started_at FROM analysis_jobs WHERE workspace_id=?`,
      now,
      day,
      repo.workspaceId,
    )
    .first();
}
