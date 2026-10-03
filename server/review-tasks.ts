import { AppError, Repository, requiredText } from './repository.ts';
import type {
  ReviewTask,
  ReviewTaskData,
  ReviewTaskEvent,
  ReviewTaskPage,
  ReviewTaskStatus,
  ReviewTaskSummary,
} from '../lib/review-tasks.ts';

const statuses = ['open', 'in_progress', 'done'];
const conflict = () =>
  new AppError(
    409,
    'review_task_conflict',
    'The assignment, team access, or assessment changed. Refresh the assignment before saving again.',
  );
const denied = () =>
  new AppError(
    403,
    'access_denied',
    'Only the owner or assigned reviewer can change this assignment.',
  );
const invalid = (message: string) =>
  new AppError(422, 'invalid_input', message);

// This expression is only built with internal SQL aliases, never request input.
const eligible = (workspace: string, user: string) =>
  `EXISTS(SELECT 1 FROM workspaces ew WHERE ew.id=${workspace} AND (ew.owner_id=${user} OR EXISTS(SELECT 1 FROM workspace_members em WHERE em.workspace_id=ew.id AND em.user_id=${user} AND em.role='reviewer')))`;
const taskColumns =
  't.id,t.call_id,t.assignee_id,t.due_date,t.status,t.version,t.completion_assessment_id,t.created_at,t.updated_at';
const readTask = <T extends { assignee_active: number }>(row: T) => ({
  ...row,
  assignee_active: Boolean(row.assignee_active),
});

async function access(repo: Repository) {
  if (!repo.actorId) throw denied();
  const row = await repo
    .statement(
      `SELECT CASE WHEN w.owner_id=? THEN 'owner' ELSE m.role END AS role FROM workspaces w LEFT JOIN workspace_members m ON m.workspace_id=w.id AND m.user_id=? WHERE w.id=? AND (w.owner_id=? OR m.role IN ('reviewer','viewer'))`,
      repo.actorId,
      repo.actorId,
      repo.workspaceId,
      repo.actorId,
    )
    .first<{ role: 'owner' | 'reviewer' | 'viewer' }>();
  if (!row) throw denied();
  return row.role;
}
function date(value: unknown) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw invalid('Choose a valid due date or clear it.');
  const parsed = new Date(value + 'T00:00:00.000Z');
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw invalid('Choose a valid calendar date.');
  return value;
}
function input(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalid('Expected an assignment object.');
  const data = value as Record<string, unknown>;
  if (
    typeof data.version !== 'number' ||
    !Number.isSafeInteger(data.version) ||
    data.version < 0
  )
    throw invalid('Refresh the assignment to obtain its current version.');
  const assignee = requiredText(data.assignee_id, 'reviewer user ID', 200);
  if (!/^user_[a-zA-Z0-9]+$/.test(assignee))
    throw invalid('Choose a current owner or reviewer.');
  if (typeof data.status !== 'string' || !statuses.includes(data.status))
    throw invalid('Choose a valid assignment status.');
  const status = data.status as ReviewTaskStatus;
  const assessment =
    status === 'done'
      ? requiredText(
          data.completion_assessment_id,
          'current human assessment',
          100,
        )
      : null;
  if (
    status !== 'done' &&
    data.completion_assessment_id != null &&
    data.completion_assessment_id !== ''
  )
    throw invalid(
      'Only completed assignments can link a completion assessment.',
    );
  return {
    version: data.version,
    assignee,
    due: date(data.due_date),
    status,
    assessment,
  };
}

export class ReviewTasks {
  readonly repo: Repository;
  constructor(repo: Repository) {
    this.repo = repo;
  }
  async read(callId: string): Promise<ReviewTaskData> {
    await access(this.repo);
    const call = await this.repo
      .statement(
        'SELECT id FROM consultations WHERE workspace_id=? AND id=?',
        this.repo.workspaceId,
        callId,
      )
      .first();
    if (!call)
      throw new AppError(
        404,
        'not_found',
        'The consultation could not be found.',
      );
    const [row, reviewers, assessment, events] = await Promise.all([
      this.repo
        .statement(
          `SELECT ${taskColumns},${eligible('t.workspace_id', 't.assignee_id')} AS assignee_active FROM review_tasks t WHERE t.workspace_id=? AND t.call_id=?`,
          this.repo.workspaceId,
          callId,
        )
        .first<
          Omit<ReviewTask, 'assignee_active'> & { assignee_active: number }
        >(),
      this.repo
        .statement(
          `SELECT owner_id AS user_id,'owner' AS role FROM workspaces WHERE id=? UNION ALL SELECT user_id,'reviewer' AS role FROM workspace_members WHERE workspace_id=? AND role='reviewer' ORDER BY role,user_id`,
          this.repo.workspaceId,
          this.repo.workspaceId,
        )
        .all<{ user_id: string; role: 'owner' | 'reviewer' }>(),
      this.repo
        .statement(
          'SELECT id,kind FROM assessments WHERE workspace_id=? AND call_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1',
          this.repo.workspaceId,
          callId,
        )
        .first<{ id: string; kind: string }>(),
      this.repo
        .statement(
          `SELECT e.id,e.version,e.actor_id,e.assignee_id,e.due_date,e.status,e.completion_assessment_id,e.created_at FROM review_task_events e JOIN review_tasks t ON t.workspace_id=e.workspace_id AND t.id=e.task_id WHERE e.workspace_id=? AND t.call_id=? ORDER BY e.version DESC LIMIT 30`,
          this.repo.workspaceId,
          callId,
        )
        .all<ReviewTaskEvent>(),
    ]);
    return {
      task: row ? readTask(row) : null,
      eligible_reviewers: reviewers.results,
      latest_human_assessment_id:
        assessment?.kind === 'human' ? assessment.id : null,
      history: events.results,
    };
  }
  async save(callId: string, value: unknown): Promise<ReviewTaskData> {
    const role = await access(this.repo);
    if (role === 'viewer') throw denied();
    const data = input(value);
    const actor = this.repo.actorId!;
    const workspace = this.repo.workspaceId;
    if (data.version === 0 && role !== 'owner') throw denied();
    if (data.version === 0 && data.status !== 'open')
      throw invalid('New assignments begin in Assigned status.');
    const now = new Date().toISOString();
    const taskId = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    const owner =
      'EXISTS(SELECT 1 FROM workspaces ow WHERE ow.id=review_tasks.workspace_id AND ow.owner_id=?)';
    const mutation =
      data.version === 0
        ? this.repo.statement(
            `INSERT OR IGNORE INTO review_tasks(id,workspace_id,call_id,assignee_id,due_date,status,version,completion_assessment_id,created_at,updated_at) SELECT ?,c.workspace_id,c.id,?,?,'open',1,NULL,?,? FROM consultations c JOIN workspaces w ON w.id=c.workspace_id WHERE c.workspace_id=? AND c.id=? AND w.owner_id=? AND ${eligible('c.workspace_id', '?')}`,
            taskId,
            data.assignee,
            data.due,
            now,
            now,
            workspace,
            callId,
            actor,
            data.assignee,
            data.assignee,
          )
        : this.repo.statement(
            `UPDATE review_tasks SET assignee_id=?,due_date=?,status=?,version=version+1,completion_assessment_id=?,updated_at=? WHERE workspace_id=? AND call_id=? AND version=? AND (assignee_id IS NOT ? OR due_date IS NOT ? OR status IS NOT ? OR completion_assessment_id IS NOT ?) AND EXISTS(SELECT 1 FROM consultations c WHERE c.id=review_tasks.call_id AND c.workspace_id=review_tasks.workspace_id) AND ${eligible('review_tasks.workspace_id', '?')} AND (${owner} OR (assignee_id=? AND EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspace_id=review_tasks.workspace_id AND m.user_id=? AND m.role='reviewer') AND assignee_id=? AND due_date IS ? AND status<>'done')) AND (status<>'done' OR (?='open' AND ${owner})) AND (?<>'done' OR EXISTS(SELECT 1 FROM assessments a WHERE a.workspace_id=review_tasks.workspace_id AND a.call_id=review_tasks.call_id AND a.id=? AND a.kind='human' AND a.id=(SELECT last.id FROM assessments last WHERE last.workspace_id=review_tasks.workspace_id AND last.call_id=review_tasks.call_id ORDER BY last.created_at DESC,last.rowid DESC LIMIT 1)))`,
            data.assignee,
            data.due,
            data.status,
            data.assessment,
            now,
            workspace,
            callId,
            data.version,
            data.assignee,
            data.due,
            data.status,
            data.assessment,
            data.assignee,
            data.assignee,
            actor,
            actor,
            actor,
            data.assignee,
            data.due,
            data.status,
            actor,
            data.status,
            data.assessment,
          );
    const [saved] = await this.repo.db.batch([
      mutation,
      this.repo.statement(
        `INSERT INTO review_task_events(id,workspace_id,task_id,version,actor_id,assignee_id,due_date,status,completion_assessment_id,created_at) SELECT ?,workspace_id,id,version,?,assignee_id,due_date,status,completion_assessment_id,? FROM review_tasks WHERE workspace_id=? AND call_id=? AND version=? AND changes()=1`,
        eventId,
        actor,
        now,
        workspace,
        callId,
        data.version + 1,
      ),
      this.repo.statement(
        `INSERT INTO audit_events(id,workspace_id,actor_id,action,entity_id,created_at) SELECT ?,?,?,?, ?,? WHERE changes()=1 AND EXISTS(SELECT 1 FROM review_task_events WHERE workspace_id=? AND id=?)`,
        crypto.randomUUID(),
        workspace,
        actor,
        data.version === 0
          ? 'review_task_assigned'
          : data.status === 'done'
            ? 'review_task_completed'
            : 'review_task_updated',
        eventId,
        now,
        workspace,
        eventId,
      ),
    ]);
    if (!saved.meta.changes) {
      // Distinguish an unchanged current draft from a stale version without
      // mutating timestamps or appending a synthetic history entry.
      if (
        data.version > 0 &&
        (await this.repo
          .statement(
            'SELECT id FROM review_tasks WHERE workspace_id=? AND call_id=? AND version=? AND assignee_id IS ? AND due_date IS ? AND status IS ? AND completion_assessment_id IS ?',
            workspace,
            callId,
            data.version,
            data.assignee,
            data.due,
            data.status,
            data.assessment,
          )
          .first())
      )
        throw new AppError(422, 'no_changes', 'No assignment fields changed.');
      throw conflict();
    }
    return this.read(callId);
  }
}

export async function listReviewTasks(
  repo: Repository,
  params: URLSearchParams,
): Promise<ReviewTaskPage> {
  await access(repo);
  const status = params.get('status') || 'all';
  if (status !== 'all' && !statuses.includes(status))
    throw invalid('Choose a valid assignment filter.');
  const mine = params.get('mine') || 'false';
  if (mine !== 'true' && mine !== 'false')
    throw invalid('Choose a valid assignee filter.');
  const rawLimit = params.get('limit') || '25';
  if (!/^\d+$/.test(rawLimit))
    throw invalid('Choose a page size from 1 to 50.');
  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw invalid('Choose a page size from 1 to 50.');
  const clauses = ['t.workspace_id=?'];
  const values: unknown[] = [repo.workspaceId];
  if (status !== 'all') {
    clauses.push('t.status=?');
    values.push(status);
  }
  if (mine === 'true') {
    clauses.push('t.assignee_id=?');
    values.push(repo.actorId);
  }
  const cursor = params.get('cursor');
  if (cursor) {
    let data: unknown;
    try {
      if (cursor.length > 600 || !/^[A-Za-z0-9_-]+$/.test(cursor))
        throw new Error();
      data = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    } catch {
      throw invalid(
        'The assignment page cursor is invalid. Start from the first page.',
      );
    }
    const c = data as Record<string, unknown> | null;
    if (
      !c ||
      Array.isArray(c) ||
      c.workspace !== repo.workspaceId ||
      c.status !== status ||
      c.mine !== mine ||
      c.actor !== (mine === 'true' ? repo.actorId : null) ||
      typeof c.updated !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(c.updated) ||
      typeof c.id !== 'string' ||
      c.id.length > 100 ||
      !c.id
    )
      throw invalid(
        'The assignment page cursor does not match these filters. Start from the first page.',
      );
    clauses.push('(t.updated_at<? OR (t.updated_at=? AND t.id<?))');
    values.push(c.updated, c.updated, c.id);
  }
  const rows = (
    await repo
      .statement(
        `SELECT ${taskColumns},c.title,c.coordinator,${eligible('t.workspace_id', 't.assignee_id')} AS assignee_active FROM review_tasks t JOIN consultations c ON c.id=t.call_id AND c.workspace_id=t.workspace_id WHERE ${clauses.join(' AND ')} ORDER BY t.updated_at DESC,t.id DESC LIMIT ?`,
        ...values,
        limit + 1,
      )
      .all<
        Omit<ReviewTaskSummary, 'assignee_active'> & { assignee_active: number }
      >()
  ).results;
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    tasks: page.map(readTask),
    next_cursor:
      rows.length > limit && last
        ? Buffer.from(
            JSON.stringify({
              workspace: repo.workspaceId,
              status,
              mine,
              actor: mine === 'true' ? repo.actorId : null,
              updated: last.updated_at,
              id: last.id,
            }),
          ).toString('base64url')
        : null,
  };
}
