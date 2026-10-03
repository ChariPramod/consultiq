import {
  AUDIT_ACTIONS,
  type AuditEvent,
  type AuditEventPage,
} from '../lib/audit-query.ts';
import { AppError, type Repository } from './repository.ts';

type Cursor = { version: 1; scope: string; created_at: string; id: string };
const invalid = (message: string) =>
  new AppError(422, 'invalid_query', message);

/** Caller must enforce owner access. The repository supplies authenticated scope. */
export async function queryAuditEvents(
  repo: Repository,
  params: URLSearchParams,
): Promise<AuditEventPage> {
  for (const key of ['action', 'limit', 'cursor']) {
    if (params.getAll(key).length > 1)
      throw invalid(`Provide ${key} only once.`);
  }
  const action = params.get('action') ?? 'all';
  if (action !== 'all' && !AUDIT_ACTIONS.some((value) => value === action))
    throw invalid('Unknown audit action filter.');
  const rawLimit = params.get('limit') ?? '25';
  if (!/^[1-9]\d?$/.test(rawLimit) || Number(rawLimit) > 50)
    throw invalid('Page size must be between 1 and 50.');
  const limit = Number(rawLimit);
  const scope = JSON.stringify([repo.workspaceId, action]);
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
        new Date(value.created_at).toISOString() !== value.created_at ||
        typeof value.id !== 'string' ||
        !value.id ||
        value.id.length > 100
      )
        throw Error();
      cursor = value as Cursor;
    } catch {
      throw invalid(
        'Invalid cursor. Return to the newest audit events with this filter.',
      );
    }
  }
  const where = ['workspace_id=?'];
  const values: unknown[] = [repo.workspaceId];
  if (action !== 'all') {
    where.push('action=?');
    values.push(action);
  }
  if (cursor) {
    where.push('(created_at,id)<(?,?)');
    values.push(cursor.created_at, cursor.id);
  }
  const rows = await repo
    .statement(
      `SELECT id,action,entity_id,actor_id,created_at FROM audit_events
     WHERE ${where.join(' AND ')} ORDER BY created_at DESC,id DESC LIMIT ?`,
      ...values,
      limit + 1,
    )
    .all<AuditEvent>();
  const hasMore = rows.results.length > limit;
  const events = rows.results.slice(0, limit);
  const last = events.at(-1);
  return {
    events,
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
