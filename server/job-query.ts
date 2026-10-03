import {
  JOB_KINDS,
  JOB_STATUSES,
  type AnalysisJobPage,
  type AnalysisJobSummary,
} from '../lib/job-query.ts';
import { parseRunTelemetry } from '../lib/run-telemetry.ts';
import { AppError, type Repository } from './repository.ts';
import type { Role } from './team.ts';

type Cursor = { version: 1; scope: string; created_at: string; id: string };
const invalid = (message: string) =>
  new AppError(422, 'invalid_query', message);

/** A bounded current-data page, not a frozen export. Status membership may change
 * while paging; a first-page refresh reconciles edits and new admissions.
 */
export async function queryJobs(
  repo: Repository,
  params: URLSearchParams,
  role: Role,
): Promise<AnalysisJobPage> {
  for (const key of ['q', 'status', 'kind', 'limit', 'cursor']) {
    if (params.getAll(key).length > 1)
      throw invalid(`Provide ${key} only once.`);
  }
  const q = (params.get('q') ?? '').trim();
  const status = params.get('status') ?? 'all';
  const kind = params.get('kind') ?? 'all';
  const rawLimit = params.get('limit') ?? '25';
  if (q.length > 200) throw invalid('Search must be at most 200 characters.');
  if (!JOB_STATUSES.some((value) => value === status))
    throw invalid('Unknown analysis status filter.');
  if (!JOB_KINDS.some((value) => value === kind))
    throw invalid('Unknown analysis kind filter.');
  if (!/^[1-9]\d?$/.test(rawLimit) || Number(rawLimit) > 50)
    throw invalid('Page size must be between 1 and 50.');
  const limit = Number(rawLimit);
  const scope = JSON.stringify([repo.workspaceId, q, status, kind]);
  let cursor: Cursor | undefined;
  const rawCursor = params.get('cursor');
  if (rawCursor !== null) {
    try {
      if (rawCursor.length > 8192 || !/^[A-Za-z0-9_-]+$/.test(rawCursor))
        throw Error();
      const value = JSON.parse(
        Buffer.from(rawCursor, 'base64url').toString('utf8'),
      );
      if (
        !value ||
        value.version !== 1 ||
        value.scope !== scope ||
        typeof value.created_at !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
          value.created_at,
        ) ||
        !Number.isFinite(Date.parse(value.created_at)) ||
        typeof value.id !== 'string' ||
        !value.id ||
        value.id.length > 100
      )
        throw Error();
      cursor = value as Cursor;
    } catch {
      throw invalid(
        'Invalid cursor. Restart analysis history from the first page with these filters.',
      );
    }
  }
  const where = ['j.workspace_id=?'];
  const values: unknown[] = [repo.workspaceId];
  if (status !== 'all') {
    where.push('j.status=?');
    values.push(status);
  }
  if (kind !== 'all') {
    where.push('j.kind=?');
    values.push(kind);
  }
  if (q) {
    where.push("c.title LIKE ? ESCAPE '\\'");
    values.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
  }
  if (cursor) {
    where.push('(j.created_at,j.id)<(?,?)');
    values.push(cursor.created_at, cursor.id);
  }
  const rows = await repo
    .statement(
      `SELECT j.id,j.call_id,c.title AS consultation_title,j.status,j.kind,j.error_code,
      j.created_at,j.telemetry_json,
      CASE WHEN j.status IN ('queued','running') AND
        (?='owner' OR (?='reviewer' AND j.requested_by=?)) THEN 1 ELSE 0 END AS can_cancel
      FROM analysis_jobs j
      JOIN consultations c ON c.id=j.call_id AND c.workspace_id=j.workspace_id
      WHERE ${where.join(' AND ')} ORDER BY j.created_at DESC,j.id DESC LIMIT ?`,
      role,
      role,
      repo.actorId,
      ...values,
      limit + 1,
    )
    .all<
      Omit<AnalysisJobSummary, 'telemetry' | 'can_cancel'> & {
        telemetry_json: string | null;
        can_cancel: number;
      }
    >();
  const hasMore = rows.results.length > limit;
  const jobs = rows.results
    .slice(0, limit)
    .map(({ telemetry_json, can_cancel, ...job }) => ({
      can_cancel: can_cancel === 1,
      ...job,
      // Error codes are machine identifiers, never raw provider failures.
      error_code:
        job.error_code && /^[a-z][a-z0-9_]{0,79}$/.test(job.error_code)
          ? job.error_code
          : null,
      telemetry: parseRunTelemetry(telemetry_json),
    }));
  const last = jobs.at(-1);
  return {
    jobs,
    limit,
    has_more: hasMore,
    next_cursor:
      hasMore && last
        ? Buffer.from(
            JSON.stringify({
              version: 1,
              scope,
              created_at: last.created_at,
              id: last.id,
            } satisfies Cursor),
          ).toString('base64url')
        : null,
  };
}
