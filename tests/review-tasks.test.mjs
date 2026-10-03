import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase } from '../server/database.ts';
import { migrate } from '../scripts/migrate-local.mjs';
import { Repository } from '../server/repository.ts';
import { ReviewTasks, listReviewTasks } from '../server/review-tasks.ts';
import { isReviewTaskOverdue } from '../lib/review-tasks.ts';

// Mechanical fixtures only. No approved domain anchors or model benchmark claims.
const dimensions = Array.from({ length: 8 }, (_, dimension) => ({
  dimension,
  score: null,
  rationale: 'Mechanical abstention fixture.',
  coaching_note: 'Mechanical fixture.',
  evidence: [],
}));
async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'consultiq-review-tasks-'));
  const db = await createDatabase({
    DATABASE_URL: pathToFileURL(join(directory, 'app.db')).href,
  });
  t.after(async () => {
    db.close();
    await rm(directory, { recursive: true, force: true });
  });
  await migrate(db.client);
  const repo = await Repository.forUser(db, 'user_owner');
  for (const [user, role] of [
    ['user_reviewer', 'reviewer'],
    ['user_second', 'reviewer'],
    ['user_viewer', 'viewer'],
  ]) {
    await repo
      .statement(
        'INSERT INTO workspace_members(id,workspace_id,user_id,role,created_at) VALUES(?,?,?,?,?)',
        crypto.randomUUID(),
        repo.workspaceId,
        user,
        role,
        new Date().toISOString(),
      )
      .run();
  }
  const call = await repo.createCall({
    title: 'Synthetic review task',
    coordinator: 'Fixture',
    source: 'synthetic',
    recorded_at: '2026-10-02',
    transcript:
      'Coordinator: Would Thursday work?\nPatient: Thursday works for me.',
  });
  const tasks = new ReviewTasks(repo);
  const asUser = (user) =>
    new ReviewTasks(new Repository(db, repo.workspaceId, user));
  const assign = (extra = {}) =>
    tasks.save(call.id, {
      version: 0,
      assignee_id: 'user_reviewer',
      due_date: null,
      status: 'open',
      ...extra,
    });
  const human = async () => {
    let rubric = await repo.rubric();
    if (!rubric) {
      await repo.publishRubric({
        title: 'Mechanical test rubric',
        approved: true,
        definitions: dimensions.map(({ dimension }) => ({
          dimension,
          one: 'Mechanical one',
          three: 'Mechanical three',
          five: 'Mechanical five',
        })),
      });
      rubric = await repo.rubric();
    }
    const current = (await repo.getCall(call.id)).latest;
    return repo.saveAssessment(call.id, {
      rubric_id: rubric.id,
      base_assessment_id: current?.id ?? '',
      dimensions,
    });
  };
  const counts = async () => ({
    tasks: (
      await repo
        .statement(
          'SELECT COUNT(*) AS n FROM review_tasks WHERE workspace_id=?',
          repo.workspaceId,
        )
        .first()
    ).n,
    events: (
      await repo
        .statement(
          'SELECT COUNT(*) AS n FROM review_task_events WHERE workspace_id=?',
          repo.workspaceId,
        )
        .first()
    ).n,
    audits: (
      await repo
        .statement(
          "SELECT COUNT(*) AS n FROM audit_events WHERE workspace_id=? AND action LIKE 'review_task_%'",
          repo.workspaceId,
        )
        .first()
    ).n,
  });
  return { db, repo, call, tasks, asUser, assign, human, counts };
}
function edit(task, changes = {}) {
  return {
    version: task.version,
    assignee_id: task.assignee_id,
    due_date: task.due_date,
    status: task.status,
    completion_assessment_id: task.completion_assessment_id,
    ...changes,
  };
}

test('owner assigns eligible reviewers with actor-attributed immutable history; viewers only read', async (t) => {
  const { tasks, call, assign, asUser, repo, counts } = await setup(t);
  const empty = await tasks.read(call.id);
  assert.equal(empty.task, null);
  assert.deepEqual(
    empty.eligible_reviewers.map((reviewer) => reviewer.user_id),
    ['user_owner', 'user_reviewer', 'user_second'],
  );
  const data = await assign({ due_date: '2026-10-03' });
  assert.equal(data.task.version, 1);
  assert.equal(data.task.assignee_active, true);
  assert.equal(data.history[0].actor_id, 'user_owner');
  assert.equal(data.history[0].due_date, '2026-10-03');
  assert.equal(
    (await asUser('user_viewer').read(call.id)).task.id,
    data.task.id,
  );
  await assert.rejects(
    asUser('user_viewer').save(
      call.id,
      edit(data.task, { status: 'in_progress' }),
    ),
    { code: 'access_denied' },
  );
  const audit = await repo
    .statement(
      "SELECT actor_id,entity_id FROM audit_events WHERE workspace_id=? AND action='review_task_assigned'",
      repo.workspaceId,
    )
    .first();
  assert.equal(audit.actor_id, 'user_owner');
  assert.equal(audit.entity_id, data.history[0].id);
  assert.deepEqual(await counts(), { tasks: 1, events: 1, audits: 1 });
});

test('reviewer can advance only their assignment and cannot change reviewer or due date', async (t) => {
  const { call, assign, asUser, counts } = await setup(t);
  await assert.rejects(
    asUser('user_reviewer').save(call.id, {
      version: 0,
      assignee_id: 'user_reviewer',
      due_date: null,
      status: 'open',
    }),
    { code: 'access_denied' },
  );
  const { task } = await assign();
  for (const change of [
    { due_date: '2026-11-01' },
    { assignee_id: 'user_second' },
  ]) {
    await assert.rejects(
      asUser('user_reviewer').save(call.id, edit(task, change)),
      { code: 'review_task_conflict' },
    );
  }
  await assert.rejects(
    asUser('user_second').save(call.id, edit(task, { status: 'in_progress' })),
    { code: 'review_task_conflict' },
  );
  const updated = await asUser('user_reviewer').save(
    call.id,
    edit(task, { status: 'in_progress' }),
  );
  assert.equal(updated.task.status, 'in_progress');
  assert.equal(updated.history[0].actor_id, 'user_reviewer');
  assert.deepEqual(await counts(), { tasks: 1, events: 2, audits: 2 });
});

test('version checks prevent concurrent lost updates, duplicate assignments and stale replays', async (t) => {
  const { call, tasks, assign, counts } = await setup(t);
  const created = await Promise.allSettled([assign(), assign()]);
  assert.equal(created.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    created.find((r) => r.status === 'rejected').reason.code,
    'review_task_conflict',
  );
  const task = (await tasks.read(call.id)).task;
  const changed = await Promise.allSettled([
    tasks.save(call.id, edit(task, { due_date: '2026-10-10' })),
    tasks.save(call.id, edit(task, { assignee_id: 'user_second' })),
  ]);
  assert.equal(changed.filter((r) => r.status === 'fulfilled').length, 1);
  await assert.rejects(
    tasks.save(call.id, edit(task, { status: 'in_progress' })),
    { code: 'review_task_conflict' },
  );
  assert.equal((await tasks.read(call.id)).task.version, 2);
  assert.deepEqual(await counts(), { tasks: 1, events: 2, audits: 2 });
});

test('unchanged current drafts cannot append history, move the worklist, or consume a version', async (t) => {
  const { call, tasks, assign, asUser, counts } = await setup(t);
  const { task } = await assign();
  for (const actor of [tasks, asUser('user_reviewer')]) {
    await assert.rejects(actor.save(call.id, edit(task)), {
      status: 422,
      code: 'no_changes',
    });
  }
  assert.deepEqual((await tasks.read(call.id)).task, task);
  assert.deepEqual(await counts(), { tasks: 1, events: 1, audits: 1 });
  // Null-safe comparison permits adding and clearing a date, while an
  // identical non-null value also remains a no-op.
  const dated = await tasks.save(
    call.id,
    edit(task, { due_date: '2026-11-01' }),
  );
  await assert.rejects(tasks.save(call.id, edit(dated.task)), {
    code: 'no_changes',
  });
  const cleared = await tasks.save(
    call.id,
    edit(dated.task, { due_date: null }),
  );
  assert.equal(cleared.task.version, 3);
  assert.equal(cleared.task.due_date, null);
  assert.deepEqual(await counts(), { tasks: 1, events: 3, audits: 3 });
  // Matching fields on an old version are still stale, never a replay success.
  await assert.rejects(tasks.save(call.id, edit(task)), {
    status: 409,
    code: 'review_task_conflict',
  });
  assert.deepEqual(await counts(), { tasks: 1, events: 3, audits: 3 });
});

test('completion pins the current human assessment and reopening is owner-only', async (t) => {
  const { call, tasks, assign, asUser, human } = await setup(t);
  const initial = await assign();
  await assert.rejects(
    asUser('user_reviewer').save(
      call.id,
      edit(initial.task, {
        status: 'done',
        completion_assessment_id: 'missing',
      }),
    ),
    { code: 'review_task_conflict' },
  );
  await human();
  const current = await tasks.read(call.id);
  const finished = await asUser('user_reviewer').save(
    call.id,
    edit(current.task, {
      status: 'done',
      completion_assessment_id: current.latest_human_assessment_id,
    }),
  );
  assert.equal(
    finished.task.completion_assessment_id,
    current.latest_human_assessment_id,
  );
  await human();
  const newer = await tasks.read(call.id);
  assert.notEqual(
    newer.latest_human_assessment_id,
    finished.task.completion_assessment_id,
  );
  assert.equal(newer.task.status, 'done');
  await assert.rejects(
    asUser('user_reviewer').save(
      call.id,
      edit(newer.task, { status: 'open', completion_assessment_id: null }),
    ),
    { code: 'review_task_conflict' },
  );
  await assert.rejects(
    tasks.save(call.id, edit(newer.task, { due_date: '2026-11-01' })),
    { code: 'review_task_conflict' },
  );
  const reopened = await tasks.save(
    call.id,
    edit(newer.task, { status: 'open', completion_assessment_id: null }),
  );
  assert.equal(reopened.task.completion_assessment_id, null);
  assert.equal(
    reopened.history[1].completion_assessment_id,
    finished.task.completion_assessment_id,
  );
  assert.equal(reopened.task.version, 3);
});

test('AI-only and stale human assessments cannot complete a review', async (t) => {
  const { db, call, tasks, assign, human, repo, counts } = await setup(t);
  const { task } = await assign();
  await human();
  const current = await tasks.read(call.id);
  await repo
    .statement(
      "UPDATE assessments SET kind='ai' WHERE workspace_id=? AND id=?",
      repo.workspaceId,
      current.latest_human_assessment_id,
    )
    .run();
  assert.equal((await tasks.read(call.id)).latest_human_assessment_id, null);
  await assert.rejects(
    tasks.save(
      call.id,
      edit(task, {
        status: 'done',
        completion_assessment_id: current.latest_human_assessment_id,
      }),
    ),
    { code: 'review_task_conflict' },
  );
  await human();
  const preRace = await tasks.read(call.id);
  const batch = db.batch.bind(db);
  let inject = true;
  db.batch = async (statements) => {
    if (inject) {
      inject = false;
      await human();
    }
    return batch(statements);
  };
  await assert.rejects(
    tasks.save(
      call.id,
      edit(task, {
        status: 'done',
        completion_assessment_id: preRace.latest_human_assessment_id,
      }),
    ),
    { code: 'review_task_conflict' },
  );
  assert.deepEqual(await counts(), { tasks: 1, events: 1, audits: 1 });
});

test('membership revocation after admission fences writes and owner can reassign orphaned work', async (t) => {
  const { db, call, repo, tasks, assign, asUser, counts } = await setup(t);
  const { task } = await assign();
  const batch = db.batch.bind(db);
  db.batch = async (statements) => {
    await repo
      .statement(
        'DELETE FROM workspace_members WHERE workspace_id=? AND user_id=?',
        repo.workspaceId,
        'user_reviewer',
      )
      .run();
    return batch(statements);
  };
  await assert.rejects(
    asUser('user_reviewer').save(
      call.id,
      edit(task, { status: 'in_progress' }),
    ),
    { code: 'review_task_conflict' },
  );
  const data = await tasks.read(call.id);
  assert.equal(data.task.assignee_active, false);
  await assert.rejects(asUser('user_reviewer').read(call.id), {
    code: 'access_denied',
  });
  await assert.rejects(
    tasks.save(call.id, edit(task, { status: 'in_progress' })),
    { code: 'review_task_conflict' },
  );
  const reassigned = await tasks.save(
    call.id,
    edit(task, { assignee_id: 'user_second' }),
  );
  assert.equal(reassigned.task.assignee_active, true);
  assert.deepEqual(await counts(), { tasks: 1, events: 2, audits: 2 });
});

test('assignment validates real dates and rejects viewers, unknown identities and bad state', async (t) => {
  const { assign, counts } = await setup(t);
  for (const due_date of [
    '2026-02-29',
    '2026-13-01',
    '2026-1-01',
    0,
    undefined,
  ])
    await assert.rejects(assign({ due_date }), { code: 'invalid_input' });
  for (const assignee_id of ['user_viewer', 'user_unknown'])
    await assert.rejects(assign({ assignee_id }), {
      code: 'review_task_conflict',
    });
  for (const status of ['done', 'in_progress', 'invalid'])
    await assert.rejects(assign({ status }), { code: 'invalid_input' });
  for (const version of [-1, '0', 0.1])
    await assert.rejects(assign({ version }), { code: 'invalid_input' });
  assert.deepEqual(await counts(), { tasks: 0, events: 0, audits: 0 });
  assert.equal(
    (await assign({ due_date: '2028-02-29' })).task.due_date,
    '2028-02-29',
  );
});

test('workspace boundaries reject foreign consultation and assessment IDs', async (t) => {
  const { db, repo, call, tasks, assign, human } = await setup(t);
  const other = await Repository.forUser(db, 'user_other');
  const otherTasks = new ReviewTasks(other);
  await assert.rejects(otherTasks.read(call.id), { code: 'not_found' });
  await assert.rejects(
    otherTasks.save(call.id, {
      version: 0,
      assignee_id: 'user_other',
      due_date: null,
      status: 'open',
    }),
    { code: 'review_task_conflict' },
  );
  const { task } = await assign();
  await human();
  const foreign = await other.createCall({
    title: 'Foreign synthetic record',
    coordinator: 'Other',
    source: 'synthetic',
    recorded_at: '2026-10-02',
    transcript: 'Coordinator: Hello.\nPatient: Hello.',
  });
  const rubric = await repo.rubric();
  await other
    .statement(
      "INSERT INTO assessments(id,workspace_id,call_id,rubric_id,kind,content,prompt_version,model,created_at) VALUES(?,?,?,?,'human','{}','fixture','fixture',?)",
      'foreign-assessment',
      other.workspaceId,
      foreign.id,
      rubric.id,
      new Date().toISOString(),
    )
    .run();
  await assert.rejects(
    tasks.save(
      call.id,
      edit(task, {
        status: 'done',
        completion_assessment_id: 'foreign-assessment',
      }),
    ),
    { code: 'review_task_conflict' },
  );
  assert.deepEqual(
    (await listReviewTasks(other, new URLSearchParams())).tasks,
    [],
  );
});

test('audit failure rolls back task and history together; deleting consultation removes assignment data', async (t) => {
  const { db, repo, call, assign, counts } = await setup(t);
  await db.client.execute(
    "CREATE TRIGGER fail_task_audit BEFORE INSERT ON audit_events WHEN NEW.action='review_task_assigned' BEGIN SELECT RAISE(ABORT,'fixture failure'); END",
  );
  await assert.rejects(assign());
  assert.deepEqual(await counts(), { tasks: 0, events: 0, audits: 0 });
  await db.client.execute('DROP TRIGGER fail_task_audit');
  await assign();
  await repo
    .statement(
      'DELETE FROM consultations WHERE id=? AND workspace_id=?',
      call.id,
      repo.workspaceId,
    )
    .run();
  assert.deepEqual(await counts(), { tasks: 0, events: 0, audits: 1 });
});

test('worklist is paginated, scoped, filter-bound and indicates removed assignees', async (t) => {
  const { repo, call, tasks, assign } = await setup(t);
  await assign();
  for (let i = 0; i < 3; i++) {
    const another = await repo.createCall({
      title: `Synthetic ${i}`,
      coordinator: `Fixture ${i}`,
      source: 'synthetic',
      recorded_at: '2026-10-02',
      transcript: 'Coordinator: Hello.\nPatient: Hello.',
    });
    await tasks.save(another.id, {
      version: 0,
      assignee_id: i === 0 ? 'user_owner' : 'user_second',
      due_date: null,
      status: 'open',
    });
  }
  const first = await listReviewTasks(repo, new URLSearchParams('limit=2'));
  assert.equal(first.tasks.length, 2);
  assert.ok(first.next_cursor);
  const second = await listReviewTasks(
    repo,
    new URLSearchParams({ limit: '2', cursor: first.next_cursor }),
  );
  assert.equal(second.tasks.length, 2);
  assert.equal(second.next_cursor, null);
  assert.equal(
    new Set([...first.tasks, ...second.tasks].map((task) => task.id)).size,
    4,
  );
  assert.equal(
    (await listReviewTasks(repo, new URLSearchParams('mine=true'))).tasks
      .length,
    1,
  );
  assert.equal(
    (await listReviewTasks(repo, new URLSearchParams('status=done'))).tasks
      .length,
    0,
  );
  await assert.rejects(
    listReviewTasks(
      repo,
      new URLSearchParams({ status: 'done', cursor: first.next_cursor }),
    ),
    { code: 'invalid_input' },
  );
  for (const params of [
    'limit=51',
    'limit=NaN',
    'status=bogus',
    'mine=yes',
    'cursor=garbage',
  ])
    await assert.rejects(listReviewTasks(repo, new URLSearchParams(params)), {
      code: 'invalid_input',
    });
  await repo
    .statement(
      'DELETE FROM workspace_members WHERE workspace_id=? AND user_id=?',
      repo.workspaceId,
      'user_reviewer',
    )
    .run();
  assert.equal(
    (await listReviewTasks(repo, new URLSearchParams())).tasks.find(
      (task) => task.call_id === call.id,
    ).assignee_active,
    false,
  );
});

test('overdue status respects date-only deadlines and completed assignments', () => {
  assert.equal(
    isReviewTaskOverdue(
      { status: 'open', due_date: '2026-10-02' },
      '2026-10-02',
    ),
    false,
  );
  assert.equal(
    isReviewTaskOverdue(
      { status: 'in_progress', due_date: '2026-10-01' },
      '2026-10-02',
    ),
    true,
  );
  assert.equal(
    isReviewTaskOverdue(
      { status: 'done', due_date: '2026-10-01' },
      '2026-10-02',
    ),
    false,
  );
  assert.equal(
    isReviewTaskOverdue({ status: 'open', due_date: null }, '2026-10-02'),
    false,
  );
});
