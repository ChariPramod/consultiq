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
import { handleApi } from '../server/handler.ts';

async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), 'consultiq-workflow-api-'));
  const db = await createDatabase({
    DATABASE_URL: pathToFileURL(join(dir, 'app.db')).href,
  });
  t.after(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });
  await migrate(db.client);
  const repo = await Repository.forUser(db, 'user_owner');
  const other = await Repository.forUser(db, 'user_other');
  const input = {
    title: 'Workflow fixture',
    coordinator: 'Test coordinator',
    source: 'synthetic',
    recorded_at: '2026-09-22',
    transcript: 'Coordinator: Would Thursday work?\nPatient: Yes, Thursday.',
  };
  const call = await repo.createCall(input);
  const privateCall = await other.createCall({
    ...input,
    title: 'Other workspace secret',
  });
  for (const [userId, role] of [
    ['user_reviewer', 'reviewer'],
    ['user_viewer', 'viewer'],
  ]) {
    const invitation = await new Team(repo, 'user_owner', 'owner').invite({
      invitee_id: userId,
      role,
    });
    await acceptInvitation(db, userId, { token: invitation.token });
  }
  const request = (
    user,
    path,
    { method = 'GET', body, workspace = repo.workspaceId, headers = {} } = {},
  ) =>
    handleApi(
      new Request('https://app.test/api/' + path, {
        method,
        headers: {
          'X-Workspace-Id': workspace,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      { DB: db },
      undefined,
      user,
    );
  const assignment = {
    version: 0,
    assignee_id: 'user_reviewer',
    due_date: null,
    status: 'open',
  };
  return { db, repo, other, call, privateCall, request, assignment };
}

test('workflow routes require verified identity and selected workspace access before reading', async (t) => {
  const { repo, other, call, request } = await setup(t);
  for (const path of [
    'insights',
    'practice',
    'review-tasks',
    `consultations/${call.id}/review-task`,
  ]) {
    assert.equal((await request(null, path)).status, 401);
    assert.equal(
      (
        await request(null, path, {
          headers: {
            'X-User-Id': 'user_owner',
            'X-Sites-User-Id': 'user_owner',
          },
        })
      ).status,
      401,
    );
    assert.equal((await request('user_other', path)).status, 403);
    assert.equal(
      (await request('user_viewer', path, { workspace: other.workspaceId }))
        .status,
      403,
    );
    for (const user of ['user_owner', 'user_reviewer', 'user_viewer']) {
      const response = await request(user, path, {
        workspace: repo.workspaceId,
      });
      assert.equal(response.status, 200, `${user}: ${path}`);
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.doesNotMatch(
        await response.text(),
        /Would Thursday work|Other workspace secret/,
      );
    }
  }
});

test('task assignment and progress work through the API without allowing viewer writes or stale saves', async (t) => {
  const { repo, call, request, assignment } = await setup(t);
  const path = `consultations/${call.id}/review-task`;
  assert.equal(
    (
      await request('user_reviewer', path, {
        method: 'PATCH',
        body: assignment,
      })
    ).status,
    403,
  );
  let response = await request('user_owner', path, {
    method: 'PATCH',
    body: assignment,
  });
  assert.equal(response.status, 200);
  let result = await response.json();
  assert.equal(result.task.assignee_id, 'user_reviewer');
  assert.equal(result.task.status, 'open');
  assert.equal(result.task.version, 1);
  assert.deepEqual(
    result.eligible_reviewers.map((reviewer) => reviewer.user_id).sort(),
    ['user_owner', 'user_reviewer'],
  );
  const progress = { ...assignment, version: 1, status: 'in_progress' };
  assert.equal(
    (await request('user_viewer', path, { method: 'PATCH', body: progress }))
      .status,
    403,
  );
  response = await request('user_reviewer', path, {
    method: 'PATCH',
    body: progress,
  });
  assert.equal(response.status, 200);
  result = await response.json();
  assert.equal(result.task.version, 2);
  assert.equal(result.task.status, 'in_progress');
  assert.equal(
    (await request('user_owner', path, { method: 'PATCH', body: progress }))
      .status,
    409,
  );

  const time = new Date().toISOString();
  await repo
    .statement(
      'INSERT INTO rubrics (id,workspace_id,title,definitions,created_at) VALUES (?,?,?,?,?)',
      'rubric',
      repo.workspaceId,
      'Mechanical test fixture',
      '[]',
      time,
    )
    .run();
  await repo
    .statement(
      'INSERT INTO assessments (id,workspace_id,call_id,rubric_id,kind,content,prompt_version,model,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      'human-review',
      repo.workspaceId,
      call.id,
      'rubric',
      'human',
      '{"dimensions":[],"supported_count":0,"average":null}',
      'test',
      'human',
      time,
    )
    .run();
  response = await request('user_reviewer', path, {
    method: 'PATCH',
    body: {
      ...assignment,
      version: 2,
      status: 'done',
      completion_assessment_id: 'human-review',
    },
  });
  assert.equal(response.status, 200);
  result = await response.json();
  assert.equal(result.task.status, 'done');
  assert.equal(result.task.version, 3);
  assert.equal(result.task.completion_assessment_id, 'human-review');
  assert.deepEqual(
    result.history.map((event) => event.actor_id),
    ['user_reviewer', 'user_reviewer', 'user_owner'],
  );
  const visible = await (await request('user_viewer', 'review-tasks')).json();
  assert.equal(visible.tasks.length, 1);
  assert.equal(visible.tasks[0].call_id, call.id);
  const mine = await (
    await request('user_reviewer', 'review-tasks?mine=true')
  ).json();
  assert.equal(mine.tasks.length, 1);
  assert.equal(
    (await (await request('user_owner', 'review-tasks?mine=true')).json()).tasks
      .length,
    0,
  );
});

test('foreign consultations and cross-origin assignment requests cannot write or leak records', async (t) => {
  const { repo, privateCall, call, request, assignment } = await setup(t);
  const foreignPath = `consultations/${privateCall.id}/review-task`;
  for (const user of ['user_owner', 'user_reviewer', 'user_viewer']) {
    const response = await request(user, foreignPath);
    assert.equal(response.status, 404);
    assert.doesNotMatch(await response.text(), /Other workspace secret/);
  }
  const response = await request('user_owner', foreignPath, {
    method: 'PATCH',
    body: assignment,
  });
  assert.equal(response.status, 409);
  assert.doesNotMatch(await response.text(), /Other workspace secret/);
  const path = `consultations/${call.id}/review-task`;
  assert.equal(
    (await request(null, path, { method: 'PATCH', body: assignment })).status,
    401,
  );
  assert.equal(
    (await request('user_other', path, { method: 'PATCH', body: assignment }))
      .status,
    403,
  );
  assert.equal(
    (
      await request('user_owner', path, {
        method: 'PATCH',
        body: assignment,
        headers: { origin: 'https://unrelated.test' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await repo
        .statement(
          'SELECT COUNT(*) AS count FROM review_tasks WHERE workspace_id=?',
          repo.workspaceId,
        )
        .first()
    ).count,
    0,
  );
});

test('storage metrics require workspace ownership and never return stored content', async (t) => {
  const { repo, other, request } = await setup(t);
  for (const user of [null, 'user_reviewer', 'user_viewer', 'user_other']) {
    const response = await request(user, 'storage');
    assert.equal(response.status, user === null ? 401 : 403);
  }
  const first = await request('user_owner', 'storage');
  assert.equal(first.status, 200);
  assert.match(first.headers.get('cache-control'), /no-store/);
  const before = await first.json();
  assert.ok(before.logical_text_bytes > 0);
  assert.equal(
    before.tables.find((row) => row.table === 'consultations').records,
    1,
  );
  assert.doesNotMatch(
    JSON.stringify(before),
    /Would Thursday work|Test coordinator|Other workspace secret|user_owner/,
  );
  await other.addDocument({
    title: 'Private',
    body: 'Other workspace secret '.repeat(500),
    approved: true,
  });
  const after = await (await request('user_owner', 'storage')).json();
  assert.equal(after.logical_text_bytes, before.logical_text_bytes);
  assert.equal(after.total_records, before.total_records);
  assert.equal(
    (await request('user_owner', 'storage', { workspace: other.workspaceId }))
      .status,
    403,
  );
  await repo.addDocument({
    title: 'Own fixture',
    body: 'Synthetic local material',
    approved: true,
  });
  const changed = await (await request('user_owner', 'storage')).json();
  assert.ok(changed.logical_text_bytes > before.logical_text_bytes);
  assert.equal(
    changed.tables.find((row) => row.table === 'knowledge_documents').records,
    1,
  );
});

test('follow-up candidate API enforces membership, scopes assignments and bounds payloads', async (t) => {
  const { repo, other, call, request } = await setup(t);
  const at = '2026-09-22T10:00:00.000Z';
  await repo
    .statement(
      'INSERT INTO rubrics(id,workspace_id,title,definitions,created_at) VALUES(?,?,?,?,?)',
      'candidate-rubric',
      repo.workspaceId,
      'Mechanical fixture',
      '[]',
      at,
    )
    .run();
  const followup = await repo.createCall({
    title: 'Searchable follow-up fixture',
    coordinator: call.coordinator,
    source: 'synthetic',
    recorded_at: '2026-09-23',
    transcript:
      'Coordinator: Private conversation.\nPatient: Private response.',
  });
  for (const [id, callId] of [
    ['baseline-fixture', call.id],
    ['followup-fixture', followup.id],
  ]) {
    await repo
      .statement(
        'INSERT INTO assessments(id,workspace_id,call_id,rubric_id,kind,content,prompt_version,model,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
        id,
        repo.workspaceId,
        callId,
        'candidate-rubric',
        'human',
        '{"dimensions":[],"private":"Hidden assessment content"}',
        'fixture',
        'human',
        at,
      )
      .run();
  }
  await repo
    .statement(
      'INSERT INTO practice_assignments(id,workspace_id,call_id,baseline_id,dimension,instruction,created_at) VALUES(?,?,?,?,?,?,?)',
      'candidate-practice',
      repo.workspaceId,
      call.id,
      'baseline-fixture',
      1,
      'Private practice instruction',
      at,
    )
    .run();
  const path = 'practice/candidate-practice/candidates';
  assert.equal(
    (
      await request(null, path, {
        headers: { 'X-Sites-User-Id': 'user_owner' },
      })
    ).status,
    401,
  );
  assert.equal((await request('user_other', path)).status, 403);
  assert.equal(
    (await request('user_other', path, { workspace: other.workspaceId }))
      .status,
    404,
  );
  assert.equal((await request('user_owner', path + '?limit=51')).status, 422);
  for (const user of ['user_owner', 'user_reviewer', 'user_viewer']) {
    const response = await request(user, path + '?q=Searchable&limit=1');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
    const result = await response.json();
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].assessment_id, 'followup-fixture');
    assert.equal(result.next_cursor, null);
    assert.doesNotMatch(
      JSON.stringify(result),
      /Private conversation|Hidden assessment content|Private practice instruction/,
    );
  }
  // The picker must not offer an old human revision once AI becomes latest.
  await repo
    .statement(
      'INSERT INTO assessments(id,workspace_id,call_id,rubric_id,kind,content,prompt_version,model,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
      'new-ai-fixture',
      repo.workspaceId,
      followup.id,
      'candidate-rubric',
      'ai',
      '{"dimensions":[]}',
      'fixture',
      'fixture',
      '2026-09-23T10:00:00.000Z',
    )
    .run();
  assert.deepEqual(
    (await (await request('user_reviewer', path)).json()).candidates,
    [],
  );
});

test('analysis history API authorizes every page and excludes job payloads', async (t) => {
  const { repo, other, call, privateCall, request } = await setup(t);
  for (const [scope, id, callId, requestedBy] of [
    [repo, 'own-analysis', call.id, 'user_reviewer'],
    [other, 'private-analysis', privateCall.id, 'user_other'],
  ]) {
    await scope
      .statement(
        'INSERT INTO analysis_jobs(id,workspace_id,call_id,kind,status,created_at,requested_by,payload_json,request_key) VALUES(?,?,?,?,?,?,?,?,?)',
        id,
        scope.workspaceId,
        callId,
        'coaching',
        'queued',
        '2026-10-03T00:00:00.000Z',
        requestedBy,
        '{"question":"PRIVATE_JOB_PAYLOAD"}',
        'PRIVATE_REQUEST_KEY',
      )
      .run();
  }
  assert.equal((await request(null, 'jobs')).status, 401);
  assert.equal((await request('user_other', 'jobs')).status, 403);
  assert.equal(
    (await request('user_owner', 'jobs', { workspace: other.workspaceId }))
      .status,
    403,
  );
  for (const user of ['user_owner', 'user_reviewer', 'user_viewer']) {
    const response = await request(
      user,
      'jobs?status=queued&kind=coaching&q=Workflow&limit=1',
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
    const result = await response.json();
    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].id, 'own-analysis');
    assert.equal(result.jobs[0].can_cancel, user !== 'user_viewer');
    assert.equal(result.has_more, false);
    assert.doesNotMatch(
      JSON.stringify(result),
      /PRIVATE_JOB_PAYLOAD|PRIVATE_REQUEST_KEY|Other workspace secret|private-analysis|requested_by|payload_json|token/,
    );
  }
  assert.equal((await request('user_owner', 'jobs?limit=51')).status, 422);
  assert.equal((await request('user_owner', 'jobs?status=bogus')).status, 422);
  assert.equal(
    (await request('user_owner', 'jobs?cursor=not-a-cursor')).status,
    422,
  );
  await repo
    .statement(
      "UPDATE analysis_jobs SET status='completed' WHERE id=? AND workspace_id=?",
      'own-analysis',
      repo.workspaceId,
    )
    .run();
  const refreshed = await (await request('user_owner', 'jobs')).json();
  assert.equal(refreshed.jobs[0].can_cancel, false);
});
