import type {
  PracticeInboxItem,
  PracticeInboxPage,
} from '../lib/practice-inbox.ts';
import { AppError, type Repository } from './repository.ts';

type Cursor = { version: 1; scope: string; created_at: string; id: string };
const invalid = (message: string) =>
  new AppError(422, 'invalid_query', message);

/** Read-only, workspace-scoped inbox over pinned practice records.
 * Pages are oldest first. Count and page reads are current data, not a snapshot;
 * concurrent completion/deletion can change membership between requests.
 */
export async function queryPracticeInbox(
  repo: Repository,
  params: URLSearchParams,
): Promise<PracticeInboxPage> {
  for (const key of ['status', 'q', 'coordinator', 'limit', 'cursor']) {
    if (params.getAll(key).length > 1)
      throw invalid(`Provide ${key} only once.`);
  }
  const status = params.get('status') ?? 'open';
  const q = (params.get('q') ?? '').trim();
  const coordinator = params.get('coordinator') ?? '';
  const rawLimit = params.get('limit') ?? '25';
  if (!['open', 'completed', 'all'].includes(status))
    throw invalid('Unknown practice status.');
  if (q.length > 200) throw invalid('Search must be at most 200 characters.');
  if (coordinator.length > 200)
    throw invalid('Coordinator must be at most 200 characters.');
  if (!/^[1-9]\d?$/.test(rawLimit) || Number(rawLimit) > 50)
    throw invalid('Page size must be between 1 and 50.');
  const limit = Number(rawLimit);
  const scope = JSON.stringify([repo.workspaceId, status, q, coordinator]);
  const rawCursor = params.get('cursor');
  let cursor: Cursor | undefined;
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
        'Invalid cursor. Restart from the first page with these filters.',
      );
    }
  }
  const conditions = ['p.workspace_id=?'];
  const values: unknown[] = [repo.workspaceId];
  if (status === 'open') conditions.push('pc.id IS NULL');
  if (status === 'completed') conditions.push('pc.id IS NOT NULL');
  if (q) {
    conditions.push(
      "(c.title LIKE ? ESCAPE '\\' OR c.coordinator LIKE ? ESCAPE '\\')",
    );
    const literal = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    values.push(literal, literal);
  }
  if (coordinator) {
    conditions.push('c.coordinator=?');
    values.push(coordinator);
  }
  const join = `FROM practice_assignments p
    JOIN consultations c ON c.id=p.call_id AND c.workspace_id=p.workspace_id
    JOIN assessments b ON b.id=p.baseline_id AND b.workspace_id=p.workspace_id AND b.call_id=p.call_id AND b.kind='human'
    LEFT JOIN practice_completions pc ON pc.assignment_id=p.id AND pc.workspace_id=p.workspace_id
    LEFT JOIN assessments a ON a.id=pc.assessment_id AND a.workspace_id=p.workspace_id AND a.kind='human'
    LEFT JOIN consultations ac ON ac.id=a.call_id AND ac.workspace_id=p.workspace_id`;
  const count = await repo
    .statement(
      `SELECT COUNT(*) AS count ${join} WHERE ${conditions.join(' AND ')}`,
      ...values,
    )
    .first<{ count: number }>();
  if (cursor) {
    conditions.push('(p.created_at>? OR (p.created_at=? AND p.id>?))');
    values.push(cursor.created_at, cursor.created_at, cursor.id);
  }
  // Extract the target dimension by identity, never by its array position.
  // Do not read transcript, full assessment, evidence, or reviewer reflection.
  const score = (alias: string) => `(SELECT CASE
    WHEN json_type(d.value,'$.score')='integer'
      AND json_extract(d.value,'$.score') BETWEEN 1 AND 5
      AND json_array_length(d.value,'$.evidence')>0
      AND json_extract(d.value,'$.unsupported')=0
    THEN json_extract(d.value,'$.score') ELSE NULL END
    FROM json_each(${alias}.content,'$.dimensions') d
    WHERE json_extract(d.value,'$.dimension')=p.dimension LIMIT 1)`;
  const rows = await repo
    .statement(
      `SELECT p.id,p.call_id,c.title AS call_title,c.coordinator,p.dimension,
      substr(p.instruction,1,600) AS instruction_preview,
      length(p.instruction)>600 AS instruction_truncated,p.created_at,
      p.baseline_id,b.rubric_id AS baseline_rubric_id,${score('b')} AS baseline_score,
      a.id AS followup_id,a.call_id AS followup_call_id,ac.title AS followup_call_title,
      a.rubric_id AS followup_rubric_id,${score('a')} AS followup_score,
      pc.id AS completion_id,pc.created_at AS completed_at
      ${join} WHERE ${conditions.join(' AND ')}
      ORDER BY p.created_at ASC,p.id ASC LIMIT ?`,
      ...values,
      limit + 1,
    )
    .all<Record<string, string | number | null>>();
  const hasMore = rows.results.length > limit;
  const textOrNull = (value: string | number | null) =>
    value === null ? null : String(value);
  const scoreOrNull = (value: string | number | null) =>
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
      ? value
      : null;
  const assignments: PracticeInboxItem[] = rows.results
    .slice(0, limit)
    .map((row) => ({
      id: String(row.id),
      call_id: String(row.call_id),
      call_title: String(row.call_title),
      coordinator: String(row.coordinator),
      dimension: Number(row.dimension),
      instruction_preview: String(row.instruction_preview),
      instruction_truncated: Boolean(row.instruction_truncated),
      created_at: String(row.created_at),
      status: row.completion_id ? 'completed' : 'open',
      baseline_id: String(row.baseline_id),
      baseline_rubric_id: String(row.baseline_rubric_id),
      baseline_score: scoreOrNull(row.baseline_score),
      followup_id: textOrNull(row.followup_id),
      followup_call_id: textOrNull(row.followup_call_id),
      followup_call_title: textOrNull(row.followup_call_title),
      followup_rubric_id: textOrNull(row.followup_rubric_id),
      followup_score: scoreOrNull(row.followup_score),
      completion_id: textOrNull(row.completion_id),
      completed_at: textOrNull(row.completed_at),
    }));
  const last = assignments.at(-1);
  return {
    assignments,
    total: Number(count?.count ?? 0),
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
