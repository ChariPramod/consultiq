import type {
  FollowupCandidate,
  FollowupCandidatePage,
} from '../lib/followup-candidates.ts';
import { AppError, type Repository } from './repository.ts';

type Cursor = { version: 1; scope: string; recorded_at: string; id: string };
const invalid = (message: string) =>
  new AppError(422, 'invalid_query', message);

/** Search across the workspace, independently of the dashboard's loaded calls.
 * Eligibility can change between pages. Learning.complete rechecks it atomically.
 * The pinned baseline, rather than its consultation's latest revision, is used.
 */
export async function queryFollowupCandidates(
  repo: Repository,
  assignmentId: string,
  params: URLSearchParams,
): Promise<FollowupCandidatePage> {
  for (const key of ['q', 'limit', 'cursor']) {
    if (params.getAll(key).length > 1)
      throw invalid(`Provide ${key} only once.`);
  }
  const q = (params.get('q') ?? '').trim();
  const rawLimit = params.get('limit') ?? '25';
  if (q.length > 200) throw invalid('Search must be at most 200 characters.');
  if (!/^[1-9]\d?$/.test(rawLimit) || Number(rawLimit) > 50)
    throw invalid('Page size must be between 1 and 50.');
  const limit = Number(rawLimit);
  const scope = JSON.stringify([repo.workspaceId, assignmentId, q]);
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
        typeof value.recorded_at !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value.recorded_at) ||
        !Number.isFinite(Date.parse(value.recorded_at)) ||
        typeof value.id !== 'string' ||
        !value.id ||
        value.id.length > 100
      )
        throw Error();
      cursor = value as Cursor;
    } catch {
      throw invalid(
        'Invalid cursor. Restart the follow-up search from the first page.',
      );
    }
  }
  const baseline = await repo
    .statement(
      `SELECT p.call_id,p.created_at,b.rubric_id,c.coordinator,c.recorded_at,
      pc.id AS completion_id,
      CASE WHEN p.review_id IS NULL THEN 1 ELSE EXISTS (
        SELECT 1 FROM coaching_reviews r
        WHERE r.id=p.review_id AND r.workspace_id=p.workspace_id AND r.decision='approved'
          AND r.id=(SELECT cr.id FROM coaching_reviews cr
            WHERE cr.coaching_id=r.coaching_id AND cr.workspace_id=p.workspace_id
            ORDER BY cr.created_at DESC,cr.rowid DESC LIMIT 1)
      ) END AS approval_current
    FROM practice_assignments p
    JOIN assessments b ON b.id=p.baseline_id AND b.workspace_id=p.workspace_id
      AND b.call_id=p.call_id AND b.kind='human'
    JOIN consultations c ON c.id=p.call_id AND c.workspace_id=p.workspace_id
    LEFT JOIN practice_completions pc ON pc.assignment_id=p.id AND pc.workspace_id=p.workspace_id
    WHERE p.id=? AND p.workspace_id=?`,
      assignmentId,
      repo.workspaceId,
    )
    .first<{
      call_id: string;
      created_at: string;
      rubric_id: string;
      coordinator: string;
      recorded_at: string;
      completion_id: string | null;
      approval_current: number;
    }>();
  if (!baseline)
    throw new AppError(404, 'not_found', 'Practice assignment not found.');
  if (baseline.completion_id || !baseline.approval_current)
    throw new AppError(
      409,
      'learning_conflict',
      baseline.completion_id
        ? 'This practice assignment already has a follow-up. Refresh practice history.'
        : 'The coaching approval changed. Refresh practice history before continuing.',
    );

  const conditions = [
    'c.workspace_id=?',
    'c.id<>?',
    'c.coordinator=?',
    'c.recorded_at>=?',
    "a.kind='human'",
    'a.rubric_id=?',
    'a.created_at>=?',
  ];
  const values: unknown[] = [
    repo.workspaceId,
    baseline.call_id,
    baseline.coordinator,
    baseline.recorded_at,
    baseline.rubric_id,
    baseline.created_at,
  ];
  if (q) {
    conditions.push("c.title LIKE ? ESCAPE '\\'");
    values.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
  }
  if (cursor) {
    conditions.push('(c.recorded_at<? OR (c.recorded_at=? AND c.id<?))');
    values.push(cursor.recorded_at, cursor.recorded_at, cursor.id);
  }
  const rows = await repo
    .statement(
      `SELECT a.id AS assessment_id,c.id AS call_id,c.title,c.recorded_at,c.coordinator,
      a.created_at AS assessment_created_at
    FROM consultations c
    JOIN assessments a ON a.workspace_id=c.workspace_id AND a.call_id=c.id
      AND a.id=(SELECT latest.id FROM assessments latest
        WHERE latest.workspace_id=c.workspace_id AND latest.call_id=c.id
        ORDER BY latest.created_at DESC,latest.rowid DESC LIMIT 1)
    WHERE ${conditions.join(' AND ')}
    ORDER BY c.recorded_at DESC,c.id DESC LIMIT ?`,
      ...values,
      limit + 1,
    )
    .all<FollowupCandidate>();
  const hasMore = rows.results.length > limit;
  const candidates = rows.results.slice(0, limit);
  const last = candidates.at(-1);
  return {
    candidates,
    limit,
    has_more: hasMore,
    next_cursor:
      hasMore && last
        ? Buffer.from(
            JSON.stringify({
              version: 1,
              scope,
              recorded_at: last.recorded_at,
              id: last.call_id,
            } satisfies Cursor),
          ).toString('base64url')
        : null,
  };
}
