import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase } from '../server/database.ts';
import { migrate } from '../scripts/migrate-local.mjs';
import { Repository } from '../server/repository.ts';
import { Team, acceptInvitation } from '../server/team.ts';
import { enqueue, processNextJob, cancelJob } from '../server/queue.ts';
import { handleApi } from '../server/handler.ts';
import { workerAuthorized } from '../server/worker-auth.ts';
const env = {
  ANTHROPIC_API_KEY: 'test-only',
  AI_MODEL: 'test-only',
  CONSULTIQ_ALLOWED_USER_IDS: 'user_owner,user_reviewer,user_viewer',
  ANALYSIS_EXECUTION: 'queued',
};
// Mechanical fixtures only; not approved domain anchors or benchmark data.
const dimensions = Array.from({ length: 8 }, (_, dimension) => ({
  dimension,
  score: null,
  rationale: 'Test abstention.',
  coaching_note: 'Test fixture.',
  evidence: [],
}));
async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), 'consultiq-queue-'));
  const db = await createDatabase({
    DATABASE_URL: pathToFileURL(join(dir, 'app.db')).href,
  });
  t.after(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });
  await migrate(db.client);
  const repo = await Repository.forUser(db, 'user_owner');
  const call = await repo.createCall({
    title: 'Synthetic test',
    coordinator: 'Fixture',
    source: 'synthetic',
    recorded_at: '2026-09-22',
    transcript:
      'Coordinator: Would Thursday work for a follow-up?\nPatient: Thursday works for me.',
  });
  await repo.publishRubric({
    title: 'Mechanical test fixture',
    approved: true,
    definitions: Array.from({ length: 8 }, (_, dimension) => ({
      dimension,
      one: 'Test anchor one',
      three: 'Test anchor three',
      five: 'Test anchor five',
    })),
  });
  const team = new Team(repo, 'user_owner', 'owner');
  const api = async (
    user,
    path,
    method = 'GET',
    data,
    scope = repo.workspaceId,
    key,
  ) => {
    const response = await handleApi(
      new Request('https://app.test/api/' + path, {
        method,
        headers: {
          Origin: 'https://app.test',
          'Content-Type': 'application/json',
          ...(scope ? { 'X-Workspace-Id': scope } : {}),
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      }),
      { ...env, DB: db },
      undefined,
      user,
    );
    return { status: response.status, data: await response.json() };
  };
  const invite = async (user, role) => {
    const invitation = await team.invite({ invitee_id: user, role });
    await acceptInvitation(db, user, { token: invitation.token });
    return invitation;
  };
  return { db, repo, call, team, api, invite };
}
test('team invitations are actor-bound, expire, rotate, cannot replay and never disclose hashes', async (t) => {
  const { db, team, repo } = await setup(t);
  const first = await team.invite({
    invitee_id: 'user_reviewer',
    role: 'reviewer',
  });
  await assert.rejects(
    acceptInvitation(db, 'user_viewer', { token: first.token }),
    { code: 'invalid_invitation' },
  );
  const rotated = await team.invite({
    invitee_id: 'user_reviewer',
    role: 'reviewer',
  });
  await assert.rejects(
    acceptInvitation(db, 'user_reviewer', { token: first.token }),
    { code: 'invalid_invitation' },
  );
  assert.doesNotMatch(JSON.stringify(await team.read()), /token_hash|token/);
  await db
    .prepare(
      "UPDATE workspace_invitations SET expires_at='2000-01-01T00:00:00.000Z' WHERE workspace_id=?",
    )
    .bind(repo.workspaceId)
    .run();
  await assert.rejects(
    acceptInvitation(db, 'user_reviewer', { token: rotated.token }),
    { code: 'invalid_invitation' },
  );
  const fresh = await team.invite({
    invitee_id: 'user_reviewer',
    role: 'reviewer',
  });
  assert.equal(
    (await acceptInvitation(db, 'user_reviewer', { token: fresh.token }))
      .workspace_id,
    repo.workspaceId,
  );
  await assert.rejects(
    acceptInvitation(db, 'user_reviewer', { token: fresh.token }),
    { code: 'invalid_invitation' },
  );
});
test('role enforcement covers destructive/governance writes and workspace boundaries', async (t) => {
  const { api, invite, call, team, repo } = await setup(t);
  await invite('user_reviewer', 'reviewer');
  await invite('user_viewer', 'viewer');
  assert.equal(
    (await api('user_viewer', 'workspace')).data.access.role,
    'viewer',
  );
  assert.equal(
    (await api('user_reviewer', 'consultations/' + call.id)).status,
    200,
  );
  for (const [path, method, data] of [
    ['workspace', 'PATCH', { name: 'bad' }],
    ['rubrics', 'POST', {}],
    ['library', 'POST', {}],
    ['consultations/' + call.id, 'DELETE'],
    ['team/invitations', 'POST', {}],
  ])
    assert.equal((await api('user_reviewer', path, method, data)).status, 403);
  for (const path of [
    'consultations',
    'consultations/' + call.id + '/score',
    'team/invitations',
  ])
    assert.equal((await api('user_viewer', path, 'POST', {})).status, 403);
  assert.equal(
    (await api('user_intruder', 'consultations/' + call.id)).status,
    403,
  );
  assert.equal(
    (await api('user_reviewer', 'workspace', 'GET', undefined, 'unknown'))
      .status,
    403,
  );
  await team.remove('user_reviewer');
  assert.equal((await api('user_reviewer', 'workspace')).status, 403);
  const listed = await api('user_reviewer', 'workspaces');
  assert.ok(!listed.data.workspaces.some((x) => x.id === repo.workspaceId));
  await assert.rejects(team.remove('user_owner'), { code: 'access_denied' });
});
test('enqueue persists an idempotent intent and competing workers invoke model only once', async (t) => {
  const { db, repo, call } = await setup(t);
  const key = crypto.randomUUID();
  const [one, two] = await Promise.all([
    enqueue(repo, 'user_owner', call.id, 'scoring', key, null, env),
    enqueue(repo, 'user_owner', call.id, 'scoring', key, null, env),
  ]);
  assert.equal(one.id, two.id);
  await assert.rejects(
    enqueue(repo, 'user_owner', call.id, 'coaching', key, 'follow-up', env),
    { code: 'request_key_conflict' },
  );
  let calls = 0;
  const invoke = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 20));
    return { dimensions };
  };
  await Promise.all([
    processNextJob(db, env, invoke),
    processNextJob(db, env, invoke),
  ]);
  assert.equal(calls, 1);
  assert.equal((await repo.getCall(call.id)).latest.kind, 'ai');
  assert.equal(
    (
      await db
        .prepare('SELECT status FROM analysis_jobs WHERE id=?')
        .bind(one.id)
        .first()
    ).status,
    'completed',
  );
  assert.equal(
    (await enqueue(repo, 'user_owner', call.id, 'scoring', key, null, env))
      .status,
    'completed',
  );
});
test('cancellation during model call prevents late result and does not retry paid call', async (t) => {
  const { db, repo, call } = await setup(t);
  const job = await enqueue(
    repo,
    'user_owner',
    call.id,
    'scoring',
    crypto.randomUUID(),
    null,
    env,
  );
  let calls = 0;
  await processNextJob(db, env, async () => {
    calls++;
    await cancelJob(repo, 'user_owner', 'owner', job.id);
    return { dimensions };
  });
  assert.equal((await repo.getCall(call.id)).latest, null);
  assert.equal(
    (
      await db
        .prepare('SELECT status FROM analysis_jobs WHERE id=?')
        .bind(job.id)
        .first()
    ).status,
    'cancelled',
  );
  assert.equal(
    (
      await processNextJob(db, env, async () => {
        calls++;
        return { dimensions };
      })
    ).processed,
    false,
  );
  assert.equal(calls, 1);
});
test('member revocation fences running output and queued jobs; expired leases cannot publish', async (t) => {
  const { db, repo, call, team, invite } = await setup(t);
  await invite('user_reviewer', 'reviewer');
  const job = await enqueue(
    repo,
    'user_reviewer',
    call.id,
    'scoring',
    crypto.randomUUID(),
    null,
    env,
  );
  await processNextJob(db, env, async () => {
    await team.remove('user_reviewer');
    return { dimensions };
  });
  assert.equal((await repo.getCall(call.id)).latest, null);
  assert.equal(
    (
      await db
        .prepare('SELECT status FROM analysis_jobs WHERE id=?')
        .bind(job.id)
        .first()
    ).status,
    'cancelled',
  );
  const next = await enqueue(
    repo,
    'user_owner',
    call.id,
    'scoring',
    crypto.randomUUID(),
    null,
    env,
  );
  await processNextJob(db, env, async () => {
    await db
      .prepare(
        "UPDATE analysis_jobs SET lease_until='2000-01-01T00:00:00.000Z' WHERE id=?",
      )
      .bind(next.id)
      .run();
    return { dimensions };
  });
  assert.equal((await repo.getCall(call.id)).latest, null);
});
test('stale queued inputs fail before provider invocation and abandoned leases require explicit new request', async (t) => {
  const { db, repo, call } = await setup(t);
  const job = await enqueue(
    repo,
    'user_owner',
    call.id,
    'scoring',
    crypto.randomUUID(),
    null,
    env,
  );
  const rubric = await repo.rubric();
  await repo.saveAssessment(call.id, {
    rubric_id: rubric.id,
    base_assessment_id: '',
    dimensions,
  });
  let calls = 0;
  await processNextJob(db, env, async () => {
    calls++;
    return { dimensions };
  });
  assert.equal(calls, 0);
  assert.equal(
    (
      await db
        .prepare('SELECT error_code FROM analysis_jobs WHERE id=?')
        .bind(job.id)
        .first()
    ).error_code,
    'stale_assessment',
  );
  const next = await enqueue(
    repo,
    'user_owner',
    call.id,
    'scoring',
    crypto.randomUUID(),
    null,
    env,
  );
  await db
    .prepare(
      "UPDATE analysis_jobs SET status='running',lease_until='2000-01-01T00:00:00.000Z' WHERE id=?",
    )
    .bind(next.id)
    .run();
  assert.equal(
    (
      await processNextJob(db, env, async () => {
        calls++;
        return { dimensions };
      })
    ).processed,
    false,
  );
  assert.equal(
    (
      await db
        .prepare('SELECT error_code FROM analysis_jobs WHERE id=?')
        .bind(next.id)
        .first()
    ).error_code,
    'interrupted',
  );
  assert.equal(calls, 0);
});
test('public analysis route returns accepted queue state without calling provider', async (t) => {
  const { api, call } = await setup(t);
  const response = await api(
    'user_owner',
    'consultations/' + call.id + '/score',
    'POST',
    {},
    undefined,
    crypto.randomUUID(),
  );
  assert.equal(response.status, 202);
  assert.equal(response.data.job.status, 'queued');
});
test('worker credentials fail closed with exact constant-time comparison', () => {
  assert.equal(workerAuthorized(null, undefined), false);
  assert.equal(workerAuthorized('Bearer short', 'short'), false);
  const secret = 'x'.repeat(40);
  assert.equal(workerAuthorized('Bearer ' + secret, secret), true);
  assert.equal(workerAuthorized('Bearer ' + secret + 'y', secret), false);
});

test('queued baseline remains pinned across a review between worker precheck and orchestration', async (t) => {
  const { db, repo, call } = await setup(t);
  const rubric = await repo.rubric();
  await enqueue(
    repo,
    'user_owner',
    call.id,
    'scoring',
    crypto.randomUUID(),
    null,
    env,
  );
  const prepare = db.prepare.bind(db);
  let injected = false;
  db.prepare = (sql) => {
    const statement = prepare(sql);
    if (sql.startsWith('SELECT * FROM rubrics')) {
      const bind = statement.bind.bind(statement);
      statement.bind = (...values) => {
        const bound = bind(...values);
        const first = bound.first.bind(bound);
        bound.first = async () => {
          const value = await first();
          if (!injected) {
            injected = true;
            await repo.saveAssessment(call.id, {
              rubric_id: rubric.id,
              base_assessment_id: '',
              dimensions,
            });
          }
          return value;
        };
        return bound;
      };
    }
    return statement;
  };
  let calls = 0;
  await processNextJob(db, env, async () => {
    calls++;
    return { dimensions };
  });
  assert.equal(calls, 0);
  assert.equal((await repo.getCall(call.id)).latest.kind, 'human');
});
test('invitation expiry is enforced at insertion even after the initial lookup succeeds', async (t) => {
  const { db, team, repo } = await setup(t);
  const invitation = await team.invite({
    invitee_id: 'user_viewer',
    role: 'viewer',
  });
  const batch = db.batch.bind(db);
  db.batch = async (statements) => {
    await db
      .prepare(
        "UPDATE workspace_invitations SET expires_at='2000-01-01T00:00:00.000Z' WHERE workspace_id=?",
      )
      .bind(repo.workspaceId)
      .run();
    return batch(statements);
  };
  await assert.rejects(
    acceptInvitation(db, 'user_viewer', { token: invitation.token }),
    { code: 'invitation_changed' },
  );
  assert.equal(
    await db
      .prepare('SELECT id FROM workspace_members WHERE workspace_id=?')
      .bind(repo.workspaceId)
      .first(),
    null,
  );
});
test('coaching workers validate actual retrieved citations and finish atomically', async (t) => {
  const { db, repo, call } = await setup(t);
  await repo.addDocument({
    title: 'Synthetic test source',
    body: 'For follow-up practice, confirm who will make the next contact.',
    approved: true,
  });
  const job = await enqueue(
    repo,
    'user_owner',
    call.id,
    'coaching',
    crypto.randomUUID(),
    'follow-up practice',
    env,
  );
  await processNextJob(db, env, async (_system, input) => ({
    answer: 'Confirm the next contact owner.',
    citations: [
      {
        chunk_id: input.sources[0].chunk_id,
        span: 'confirm who will make the next contact',
      },
    ],
  }));
  assert.equal(
    (
      await db
        .prepare('SELECT status FROM analysis_jobs WHERE id=?')
        .bind(job.id)
        .first()
    ).status,
    'completed',
  );
  assert.equal((await repo.detail(call.id)).coaching.length, 1);
});

test('operational aggregates are owner-only and scoped across workspaces', async (t) => {
  const { api, invite, repo, call } = await setup(t);
  await invite('user_viewer', 'viewer');
  await enqueue(
    repo,
    'user_owner',
    call.id,
    'scoring',
    crypto.randomUUID(),
    null,
    env,
  );
  assert.equal((await api('user_owner', 'operations')).data.queued, 1);
  assert.equal((await api('user_viewer', 'operations')).status, 403);
  const personal = await api(
    'user_viewer',
    'operations',
    'GET',
    undefined,
    null,
  );
  assert.equal(personal.status, 200);
  assert.equal(personal.data.queued, 0);
  assert.equal(personal.data.last_started_at, null);
});
