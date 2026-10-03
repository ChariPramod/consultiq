import type { Repository } from './repository.ts';
import type { StorageUsage } from '../lib/storage.ts';
export type { StorageUsage } from '../lib/storage.ts';

// Explicit columns make this an auditable content-free report. Update alongside
// schema changes; the schema-coverage test rejects unaccounted tables/columns.
const inventory = [
  ['workspaces', 'team', 'id owner_id name created_at'],
  [
    'consultations',
    'consultations',
    'id workspace_id title coordinator source outcome turns recorded_at created_at',
  ],
  ['rubrics', 'assessments', 'id workspace_id title definitions created_at'],
  [
    'assessments',
    'assessments',
    'id workspace_id call_id rubric_id kind content prompt_version model created_at',
  ],
  [
    'knowledge_documents',
    'library',
    'id workspace_id title body created_at body_sha256',
  ],
  ['knowledge_chunks', 'library', 'id workspace_id document_id body'],
  [
    'coaching_runs',
    'coaching',
    'id workspace_id call_id question answer citations model prompt_version created_at',
  ],
  [
    'coaching_reviews',
    'coaching',
    'id workspace_id coaching_id decision guidance notes base_id created_at',
  ],
  [
    'practice_assignments',
    'practice',
    'id workspace_id call_id baseline_id review_id instruction created_at',
  ],
  [
    'practice_completions',
    'practice',
    'id workspace_id assignment_id assessment_id reflection created_at',
  ],
  ['workspace_members', 'team', 'id workspace_id user_id role created_at'],
  [
    'workspace_invitations',
    'team',
    'id workspace_id invitee_id role token_hash expires_at created_at',
  ],
  [
    'analysis_jobs',
    'operations',
    'id workspace_id call_id kind status error_code telemetry_json created_at finished_at requested_by request_key payload_json started_at lease_until',
  ],
  [
    'audit_events',
    'operations',
    'id workspace_id action entity_id created_at actor_id',
  ],
  [
    'review_tasks',
    'practice',
    'id workspace_id call_id assignee_id due_date status completion_assessment_id created_at updated_at',
  ],
  [
    'review_task_events',
    'practice',
    'id workspace_id task_id actor_id assignee_id due_date status completion_assessment_id created_at',
  ],
] as const;

/** One statement gives a consistent scoped snapshot. Counts UTF-8 bytes of
 * persisted text, including JSON, chunks and metadata; excludes integer fields,
 * indexes, page overhead, WAL/backups and provider billing/storage allocation.
 * Owner-only at the HTTP boundary. No bodies, identifiers or hashes leave SQL.
 */
export async function storageUsage(repo: Repository): Promise<StorageUsage> {
  const sql = inventory
    .map(([table, domain, columns]) => {
      const bytes = columns
        .split(' ')
        .map((column) => `COALESCE(length(CAST(${column} AS BLOB)),0)`)
        .join('+');
      return `SELECT '${table}' AS "table",'${domain}' AS domain,COUNT(*) AS records,
      COALESCE(SUM(${bytes}),0) AS logical_text_bytes
      FROM ${table} WHERE ${table === 'workspaces' ? 'id' : 'workspace_id'}=?`;
    })
    .join(' UNION ALL ');
  const { results } = await repo
    .statement(sql, ...inventory.map(() => repo.workspaceId))
    .all<StorageUsage['tables'][number]>();
  return {
    measured_at: new Date().toISOString(),
    total_records: results.reduce((sum, row) => sum + Number(row.records), 0),
    logical_text_bytes: results.reduce(
      (sum, row) => sum + Number(row.logical_text_bytes),
      0,
    ),
    tables: results.map((row) => ({
      ...row,
      records: Number(row.records),
      logical_text_bytes: Number(row.logical_text_bytes),
    })),
  };
}
