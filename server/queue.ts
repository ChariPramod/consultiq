import {
  AppError,
  Repository,
  requiredText,
  type Database,
} from './repository.ts';
import { configuration, dailyLimit, type RuntimeConfig } from './config.ts';
import { runScoring, runCoaching, type ModelCall } from './ai.ts';
import { workspaceAccess } from './team.ts';
import { allowedUser } from './access.ts';
type Job = {
  id: string;
  workspace_id: string;
  call_id: string;
  kind: 'scoring' | 'coaching';
  status: string;
  requested_by: string;
  payload_json: string;
};
type Payload = {
  version: 1;
  question: string | null;
  rubric_id: string | null;
  base_assessment_id: string;
};
export async function enqueue(
  repo: Repository,
  actor: string,
  callId: string,
  kind: Job['kind'],
  key: unknown,
  question: unknown,
  env: RuntimeConfig,
) {
  if (!configuration(env).scoring)
    throw new AppError(
      503,
      'provider_not_configured',
      'AI is not configured. Manual review and source search remain available.',
    );
  const requestKey = requiredText(key, 'Idempotency-Key header', 100);
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(requestKey))
    throw new AppError(
      422,
      'invalid_input',
      'Use a unique request key of 16 to 100 letters, digits, hyphens or underscores.',
    );
  const q =
    kind === 'coaching'
      ? requiredText(question, 'coaching question', 500)
      : null;
  const existing = await repo
    .statement(
      'SELECT * FROM analysis_jobs WHERE workspace_id=? AND request_key=?',
      repo.workspaceId,
      requestKey,
    )
    .first<Job>();
  if (existing) {
    if (
      existing.requested_by !== actor ||
      existing.call_id !== callId ||
      existing.kind !== kind ||
      JSON.parse(existing.payload_json).question !== q
    )
      throw new AppError(
        409,
        'request_key_conflict',
        'That request key was already used for a different operation.',
      );
    return { id: existing.id, status: existing.status };
  }
  const call = await repo.getCall(callId);
  const rubric = await repo.rubric();
  if (kind === 'scoring' && !rubric)
    throw new AppError(
      422,
      'rubric_required',
      'Publish an approved rubric before scoring.',
    );
  if (q && !(await repo.retrieve(q)).length)
    throw new AppError(
      422,
      'insufficient_context',
      'No relevant approved material was found. Search the library or add guidance first.',
    );
  const payload: Payload = {
    version: 1,
    question: q,
    rubric_id: rubric?.id ?? null,
    base_assessment_id: call.latest?.id ?? '',
  };
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - 86400000).toISOString();
  const [saved] = await repo.db.batch([
    repo.statement(
      "INSERT OR IGNORE INTO analysis_jobs(id,workspace_id,call_id,kind,status,created_at,requested_by,request_key,payload_json) SELECT ?,?,?,?,'queued',?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM analysis_jobs WHERE workspace_id=? AND call_id=? AND status IN ('queued','running')) AND (SELECT COUNT(*) FROM analysis_jobs WHERE workspace_id=? AND created_at>?)<?",
      id,
      repo.workspaceId,
      callId,
      kind,
      now,
      actor,
      requestKey,
      JSON.stringify(payload),
      repo.workspaceId,
      callId,
      repo.workspaceId,
      cutoff,
      dailyLimit(env),
    ),
    repo.statement(
      "INSERT INTO audit_events(id,workspace_id,action,entity_id,created_at,actor_id) SELECT ?,?,'analysis_queued',?,?,? WHERE changes()>0",
      crypto.randomUUID(),
      repo.workspaceId,
      id,
      now,
      actor,
    ),
  ]);
  if (!saved.meta.changes) {
    const concurrent = await repo
      .statement(
        'SELECT * FROM analysis_jobs WHERE workspace_id=? AND request_key=?',
        repo.workspaceId,
        requestKey,
      )
      .first<Job>();
    if (
      concurrent &&
      concurrent.requested_by === actor &&
      concurrent.call_id === callId &&
      concurrent.kind === kind &&
      JSON.parse(concurrent.payload_json).question === q
    )
      return { id: concurrent.id, status: concurrent.status };
    if (concurrent)
      throw new AppError(
        409,
        'request_key_conflict',
        'That request key was already used.',
      );
    throw new AppError(
      429,
      'processing_limit',
      'This conversation has an active job or the daily limit has been reached.',
    );
  }
  return { id, status: 'queued' };
}
export async function cancelJob(
  repo: Repository,
  actor: string,
  role: string,
  id: string,
) {
  const job = await repo
    .statement(
      'SELECT requested_by,status FROM analysis_jobs WHERE workspace_id=? AND id=?',
      repo.workspaceId,
      id,
    )
    .first<{ requested_by: string; status: string }>();
  if (!job) throw new AppError(404, 'not_found', 'Analysis job not found.');
  if (role !== 'owner' && job.requested_by !== actor)
    throw new AppError(
      403,
      'access_denied',
      'Only the requester or workspace owner may cancel this job.',
    );
  const now = new Date().toISOString();
  await repo.db.batch([
    repo.statement(
      "UPDATE analysis_jobs SET status='cancelled',error_code='cancelled',finished_at=? WHERE workspace_id=? AND id=? AND status IN ('queued','running')",
      now,
      repo.workspaceId,
      id,
    ),
    repo.statement(
      "INSERT INTO audit_events(id,workspace_id,action,entity_id,created_at,actor_id) SELECT ?,?,'analysis_cancelled',?,?,? WHERE changes()>0",
      crypto.randomUUID(),
      repo.workspaceId,
      id,
      now,
      actor,
    ),
  ]);
  return {
    job: await repo
      .statement(
        'SELECT id,status FROM analysis_jobs WHERE workspace_id=? AND id=?',
        repo.workspaceId,
        id,
      )
      .first(),
  };
}
/** Privileged dispatcher only. Discovery returns metadata; all execution is scoped to its recorded workspace. */
export async function processNextJob(
  db: Database,
  env: RuntimeConfig & { CONSULTIQ_ALLOWED_USER_IDS?: string },
  invoke?: ModelCall,
) {
  const now = new Date().toISOString();
  // Service-authorized discovery reads only job routing metadata. Every mutation is scoped.
  const expired = await db
    .prepare(
      "SELECT DISTINCT workspace_id FROM analysis_jobs WHERE status='running' AND lease_until IS NOT NULL AND lease_until<=? LIMIT 100",
    )
    .bind(now)
    .all<{ workspace_id: string }>();
  for (const row of expired.results) {
    await db
      .prepare(
        "UPDATE analysis_jobs SET status='failed',error_code='interrupted',finished_at=? WHERE workspace_id=? AND status='running' AND lease_until IS NOT NULL AND lease_until<=?",
      )
      .bind(now, row.workspace_id, now)
      .run();
  }
  const candidate = await db
    .prepare(
      "SELECT id,workspace_id FROM analysis_jobs WHERE status='queued' ORDER BY created_at,id LIMIT 1",
    )
    .first<{ id: string; workspace_id: string }>();
  if (!candidate) return { processed: false };
  const lease = new Date(Date.now() + 180000).toISOString();
  const job = await db
    .prepare(
      "UPDATE analysis_jobs SET status='running',started_at=?,lease_until=? WHERE id=? AND workspace_id=? AND status='queued' RETURNING *",
    )
    .bind(now, lease, candidate.id, candidate.workspace_id)
    .first<Job>();
  if (!job) return { processed: false };
  const repo = new Repository(db, job.workspace_id, job.requested_by);
  try {
    if (!allowedUser(job.requested_by, env.CONSULTIQ_ALLOWED_USER_IDS))
      throw new AppError(
        403,
        'access_revoked',
        'The requesting account no longer has access.',
      );
    const access = await workspaceAccess(
      db,
      job.requested_by,
      job.workspace_id,
    );
    if (access.role === 'viewer')
      throw new AppError(
        403,
        'access_revoked',
        'Review permission is required.',
      );
    const payload = JSON.parse(job.payload_json) as Payload;
    if (payload.version !== 1)
      throw new AppError(422, 'invalid_job', 'Unsupported job payload.');
    const call = await repo.getCall(job.call_id);
    if ((call.latest?.id ?? '') !== payload.base_assessment_id)
      throw new AppError(
        409,
        'stale_assessment',
        'The assessment changed after this job was queued.',
      );
    if (job.kind === 'scoring') {
      if ((await repo.rubric())?.id !== payload.rubric_id)
        throw new AppError(
          409,
          'rubric_changed',
          'The approved rubric changed after this job was queued.',
        );
      await runScoring(repo, job.call_id, env, invoke, job.id, {
        baseId: payload.base_assessment_id,
        rubricId: payload.rubric_id!,
      });
    } else if (job.kind === 'coaching')
      await runCoaching(
        repo,
        job.call_id,
        payload.question,
        env,
        invoke,
        job.id,
      );
    else throw new AppError(422, 'invalid_job', 'Unsupported job kind.');
    return { processed: true, job_id: job.id };
  } catch (error) {
    await repo.finishJob(
      job.id,
      error instanceof AppError ? error.code : 'analysis_failed',
    );
    return { processed: true, job_id: job.id };
  }
}
