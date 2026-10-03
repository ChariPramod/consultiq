import type { ConsultationSummary, SavedAssessment } from '../lib/product.ts';
import { AppError, type Repository } from './repository.ts';

const invalid = (message: string) =>
  new AppError(422, 'invalid_query', message);
const outcomes = new Set([
  'all',
  'unknown',
  'accepted',
  'not_accepted',
  'follow_up',
]);
const reviews = new Set(['all', 'unreviewed', 'human', 'ai']);

type Cursor = { version: 1; scope: string; created_at: string; id: string };

/** Keyset pagination over immutable creation time and ID, scoped before any read.
 * Each page is current data, not a frozen export: concurrent review/outcome edits
 * can change filter membership. Newer inserts do not shift subsequent pages.
 */
export async function queryConsultations(
  repo: Repository,
  params: URLSearchParams,
) {
  for (const key of [
    'q',
    'outcome',
    'review',
    'coordinator',
    'limit',
    'cursor',
  ]) {
    if (params.getAll(key).length > 1)
      throw invalid(`Provide ${key} only once.`);
  }
  const q = (params.get('q') ?? '').trim();
  const coordinator = params.get('coordinator') ?? '';
  if (coordinator.length > 200)
    throw invalid('Coordinator must be at most 200 characters.');
  const outcome = params.get('outcome') ?? 'all';
  const review = params.get('review') ?? 'all';
  const rawLimit = params.get('limit') ?? '25';
  if (q.length > 200) throw invalid('Search must be at most 200 characters.');
  if (!outcomes.has(outcome)) throw invalid('Unknown outcome filter.');
  if (!reviews.has(review)) throw invalid('Unknown review filter.');
  if (!/^[1-9]\d?$/.test(rawLimit) || Number(rawLimit) > 50)
    throw invalid('Page size must be between 1 and 50.');
  const limit = Number(rawLimit);
  const scope = JSON.stringify([
    repo.workspaceId,
    q,
    outcome,
    review,
    coordinator,
  ]);
  const rawCursor = params.get('cursor');
  let cursor: Cursor | undefined;
  if (rawCursor !== null) {
    try {
      if (rawCursor.length > 8192 || !/^[A-Za-z0-9_-]+$/.test(rawCursor))
        throw Error();
      const decoded = JSON.parse(
        Buffer.from(rawCursor, 'base64url').toString('utf8'),
      );
      if (
        !decoded ||
        decoded.version !== 1 ||
        decoded.scope !== scope ||
        typeof decoded.created_at !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
          decoded.created_at,
        ) ||
        !Number.isFinite(Date.parse(decoded.created_at)) ||
        typeof decoded.id !== 'string' ||
        !decoded.id ||
        decoded.id.length > 100
      )
        throw Error();
      cursor = decoded as Cursor;
    } catch {
      throw invalid(
        'Invalid cursor. Restart from the first page with these filters.',
      );
    }
  }
  const conditions = ['c.workspace_id=?'];
  const values: unknown[] = [repo.workspaceId];
  if (q) {
    conditions.push(
      "(c.title LIKE ? ESCAPE '\\' OR c.coordinator LIKE ? ESCAPE '\\')",
    );
    const literal = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    values.push(literal, literal);
  }
  if (outcome !== 'all') {
    conditions.push('c.outcome=?');
    values.push(outcome);
  }
  if (review === 'unreviewed') conditions.push('a.id IS NULL');
  else if (review !== 'all') {
    conditions.push('a.kind=?');
    values.push(review);
  }
  if (coordinator) {
    conditions.push('c.coordinator=?');
    values.push(coordinator);
  }
  const join = `FROM consultations c LEFT JOIN assessments a ON a.workspace_id=c.workspace_id
      AND a.call_id=c.id AND a.id=(SELECT b.id FROM assessments b
        WHERE b.workspace_id=c.workspace_id AND b.call_id=c.id
        ORDER BY b.created_at DESC,b.rowid DESC LIMIT 1)`;
  // Count and page are separate reads; concurrent writes may change the count.
  const count = await repo
    .statement(
      `SELECT COUNT(*) AS count ${join}
    WHERE ${conditions.join(' AND ')}`,
      ...values,
    )
    .first<{ count: number }>();
  if (cursor) {
    conditions.push('(c.created_at<? OR (c.created_at=? AND c.id<?))');
    values.push(cursor.created_at, cursor.created_at, cursor.id);
  }
  // A single query avoids N+1 reads and never loads historical revisions.
  const rows = await repo
    .statement(
      `SELECT c.id,c.title,c.coordinator,c.source,c.outcome,c.recorded_at,c.created_at,
    json_array_length(c.turns) AS turn_count,
    a.id AS assessment_id,a.kind AS assessment_kind,
    json_extract(a.content,'$.average') AS assessment_average,
    json_extract(a.content,'$.supported_count') AS assessment_supported_count
    ${join}
    WHERE ${conditions.join(' AND ')}
    ORDER BY c.created_at DESC,c.id DESC LIMIT ?`,
      ...values,
      limit + 1,
    )
    .all<Record<string, string | number | null>>();
  const hasMore = rows.results.length > limit;
  const calls: ConsultationSummary[] = rows.results
    .slice(0, limit)
    .map((row) => ({
      id: String(row.id),
      title: String(row.title),
      coordinator: String(row.coordinator),
      source: row.source as ConsultationSummary['source'],
      outcome: row.outcome as ConsultationSummary['outcome'],
      recorded_at: String(row.recorded_at),
      created_at: String(row.created_at),
      turn_count: Number(row.turn_count),
      latest: row.assessment_id
        ? {
            id: String(row.assessment_id),
            kind: row.assessment_kind as SavedAssessment['kind'],
            content: {
              average:
                row.assessment_average === null
                  ? null
                  : Number(row.assessment_average),
              supported_count: Number(row.assessment_supported_count ?? 0),
            },
          }
        : null,
    }));
  const last = calls.at(-1);
  return {
    calls,
    total: count?.count ?? 0,
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
