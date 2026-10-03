import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase } from '../server/database.ts';
import { migrate } from '../scripts/migrate-local.mjs';
import { Repository } from '../server/repository.ts';
import { queryPracticeInbox } from '../server/practice-inbox.ts';
import { practiceScoreChange } from '../lib/practice-inbox.ts';

const time = '2026-09-22T10:00:00.000Z';
async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), 'consultiq-practice-inbox-'));
  const db = await createDatabase({
    DATABASE_URL: pathToFileURL(join(dir, 'app.db')).href,
  });
  t.after(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });
  await migrate(db.client);
  const repo = await Repository.forUser(db, 'owner');
  const other = await Repository.forUser(db, 'other');
  for (const scope of [repo, other]) {
    await scope
      .statement(
        'INSERT INTO rubrics (id,workspace_id,title,definitions,created_at) VALUES (?,?,?,?,?)',
        `r-${scope.workspaceId}`,
        scope.workspaceId,
        'Mechanical test fixture',
        '[]',
        time,
      )
      .run();
  }
  const call = async (scope, id, title = id, coordinator = 'Pat') => {
    await scope
      .statement(
        'INSERT INTO consultations (id,workspace_id,title,coordinator,source,outcome,turns,recorded_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        id,
        scope.workspaceId,
        title,
        coordinator,
        'synthetic',
        'unknown',
        '[{"role":"Coordinator","text":"Private transcript","time":"00:00"}]',
        '2026-09-22',
        time,
      )
      .run();
    return id;
  };
  const assessment = async (
    scope,
    id,
    callId,
    score = 3,
    rubric = `r-${scope.workspaceId}`,
  ) => {
    await scope
      .statement(
        'INSERT INTO assessments (id,workspace_id,call_id,rubric_id,kind,content,prompt_version,model,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        id,
        scope.workspaceId,
        callId,
        rubric,
        'human',
        JSON.stringify({
          dimensions: [
            { dimension: 7, score: 5 },
            {
              dimension: 1,
              score,
              unsupported: score === null,
              rationale: 'Private rationale',
              evidence: [{ span: 'Private evidence' }],
            },
          ],
        }),
        'mechanical-fixture',
        'human',
        time,
      )
      .run();
    return id;
  };
  const assignment = async (
    scope,
    id,
    callId,
    baselineId,
    instruction = 'Practice one reviewed behavior.',
    createdAt = time,
  ) => {
    await scope
      .statement(
        'INSERT INTO practice_assignments (id,workspace_id,call_id,baseline_id,dimension,instruction,created_at) VALUES (?,?,?,?,?,?,?)',
        id,
        scope.workspaceId,
        callId,
        baselineId,
        1,
        instruction,
        createdAt,
      )
      .run();
    return id;
  };
  const complete = async (scope, assignmentId, assessmentId) => {
    await scope
      .statement(
        'INSERT INTO practice_completions (id,workspace_id,assignment_id,assessment_id,reflection,created_at) VALUES (?,?,?,?,?,?)',
        `completion-${assignmentId}`,
        scope.workspaceId,
        assignmentId,
        assessmentId,
        'Private reflection',
        time,
      )
      .run();
  };
  const query = (params = {}) =>
    queryPracticeInbox(repo, new URLSearchParams(params));
  return { repo, other, call, assessment, assignment, complete, query };
}

test('workspace inbox paginates all practice with a stable tie-breaker and scoped cursors', async (t) => {
  const { repo, other, call, assessment, assignment, query } = await setup(t);
  await call(repo, 'call');
  await assessment(repo, 'baseline', 'call');
  for (const id of ['c', 'a', 'b', 'd', 'e'])
    await assignment(repo, id, 'call', 'baseline');
  await call(other, 'private-call');
  await assessment(other, 'private-baseline', 'private-call');
  await assignment(
    other,
    'private-assignment',
    'private-call',
    'private-baseline',
    'Workspace secret',
  );
  const first = await query({ limit: '2' });
  assert.equal(first.total, 5);
  assert.deepEqual(
    first.assignments.map((item) => item.id),
    ['a', 'b'],
  );
  assert.equal(first.has_more, true);
  const second = await query({ limit: '2', cursor: first.next_cursor });
  assert.deepEqual(
    second.assignments.map((item) => item.id),
    ['c', 'd'],
  );
  const last = await query({ limit: '2', cursor: second.next_cursor });
  assert.deepEqual(
    last.assignments.map((item) => item.id),
    ['e'],
  );
  assert.equal(last.has_more, false);
  assert.equal(last.next_cursor, null);
  assert.doesNotMatch(
    JSON.stringify([first, second, last]),
    /private-|Workspace secret/,
  );
  await assert.rejects(
    queryPracticeInbox(
      other,
      new URLSearchParams({ cursor: first.next_cursor }),
    ),
    (error) => error.status === 422,
  );
});

test('summaries retain pinned dimension scores without exposing assessment or transcript content', async (t) => {
  const { repo, call, assessment, assignment, complete, query } =
    await setup(t);
  await call(repo, 'baseline-call', 'Original role-play');
  await call(repo, 'followup-call', 'Follow-up role-play');
  await assessment(repo, 'baseline', 'baseline-call', 2);
  await assessment(repo, 'followup', 'followup-call', 4);
  await assignment(
    repo,
    'practice',
    'baseline-call',
    'baseline',
    'a'.repeat(700) + 'Hidden instruction tail',
  );
  await complete(repo, 'practice', 'followup');
  // Later revisions must not silently replace the pinned comparison.
  await assessment(repo, 'new-baseline', 'baseline-call', 1);
  await assessment(repo, 'new-followup', 'followup-call', 5);
  assert.equal((await query()).total, 0);
  const page = await query({ status: 'completed' });
  assert.equal(page.total, 1);
  const item = page.assignments[0];
  assert.equal(item.baseline_id, 'baseline');
  assert.equal(item.followup_id, 'followup');
  assert.equal(item.baseline_score, 2);
  assert.equal(item.followup_score, 4);
  assert.equal(item.followup_call_id, 'followup-call');
  assert.equal(item.followup_call_title, 'Follow-up role-play');
  assert.equal(item.status, 'completed');
  assert.equal(item.instruction_preview.length, 600);
  assert.equal(item.instruction_truncated, true);
  assert.equal(practiceScoreChange(item), 2);
  assert.doesNotMatch(
    JSON.stringify(page),
    /Private transcript|Private rationale|Private evidence|Private reflection|Hidden instruction tail/,
  );
  assert.equal((await query({ status: 'all' })).total, 1);
});

test('null scores and different rubric versions never imply improvement', async (t) => {
  const { repo, call, assessment, assignment, complete, query } =
    await setup(t);
  await repo
    .statement(
      'INSERT INTO rubrics (id,workspace_id,title,definitions,created_at) VALUES (?,?,?,?,?)',
      'different-rubric',
      repo.workspaceId,
      'Different mechanical fixture',
      '[]',
      time,
    )
    .run();
  await call(repo, 'before');
  await call(repo, 'after');
  await assessment(repo, 'baseline', 'before', null);
  await assessment(repo, 'followup', 'after', 4, 'different-rubric');
  await assignment(repo, 'practice', 'before', 'baseline');
  await complete(repo, 'practice', 'followup');
  const item = (await query({ status: 'all' })).assignments[0];
  assert.equal(item.baseline_score, null);
  assert.equal(item.followup_score, 4);
  assert.equal(item.followup_rubric_id, 'different-rubric');
  assert.equal(practiceScoreChange(item), null);
  assert.equal(practiceScoreChange({ ...item, baseline_score: 2 }), null);
  assert.equal(
    practiceScoreChange({
      ...item,
      followup_rubric_id: item.baseline_rubric_id,
    }),
    null,
  );
  assert.equal(
    practiceScoreChange({
      ...item,
      baseline_score: 2,
      followup_rubric_id: item.baseline_rubric_id,
      status: 'open',
    }),
    null,
  );
});

test('status and literal search combine with exact coordinator filters', async (t) => {
  const { repo, call, assessment, assignment, complete, query } =
    await setup(t);
  for (const [id, title, coordinator] of [
    ['a', '100% complete', 'Pat'],
    ['b', '1000 complete', 'Pat Jones'],
    ['c', 'a_b', 'Pat'],
    ['d', 'aXb', 'Other'],
  ]) {
    await call(repo, id, title, coordinator);
    await assessment(repo, `baseline-${id}`, id);
    await assignment(repo, `practice-${id}`, id, `baseline-${id}`);
  }
  await complete(repo, 'practice-c', 'baseline-d');
  assert.deepEqual(
    (await query({ q: '%' })).assignments.map((item) => item.id),
    ['practice-a'],
  );
  assert.deepEqual(
    (await query({ q: '_', status: 'all' })).assignments.map((item) => item.id),
    ['practice-c'],
  );
  assert.deepEqual(
    (
      await query({ coordinator: 'Pat', q: 'PAT', status: 'completed' })
    ).assignments.map((item) => item.id),
    ['practice-c'],
  );
  assert.equal((await query({ q: "' OR 1=1 --", status: 'all' })).total, 0);
  assert.equal((await query({ status: 'all' })).total, 4);
  assert.equal((await query()).total, 3);
});

test('all joins refuse cross-workspace references even if inconsistent rows exist', async (t) => {
  const { repo, other, call, assessment, assignment, complete, query } =
    await setup(t);
  await call(repo, 'public');
  await assessment(repo, 'baseline', 'public', 2);
  await call(other, 'private-call', 'Private title');
  await assessment(other, 'private-baseline', 'private-call', 5);
  await assignment(repo, 'bad-baseline', 'public', 'private-baseline');
  await assignment(repo, 'bad-followup', 'public', 'baseline');
  await complete(repo, 'bad-followup', 'private-baseline');
  const page = await query({ status: 'all' });
  assert.equal(page.total, 1);
  assert.equal(page.assignments[0].followup_id, null);
  assert.equal(page.assignments[0].followup_score, null);
  assert.equal(page.assignments[0].followup_call_title, null);
  assert.equal(practiceScoreChange(page.assignments[0]), null);
  assert.doesNotMatch(
    JSON.stringify(page),
    /Private title|private-call|private-baseline/,
  );
});

test('invalid filters, duplicate parameters and cursor filter changes are rejected', async (t) => {
  const { repo, call, assessment, assignment, query } = await setup(t);
  await call(repo, 'call');
  await assessment(repo, 'baseline', 'call');
  await assignment(repo, 'a', 'call', 'baseline');
  await assignment(repo, 'b', 'call', 'baseline');
  for (const params of [
    { status: 'overdue' },
    { q: 'x'.repeat(201) },
    { coordinator: 'x'.repeat(201) },
    { limit: '0' },
    { limit: '51' },
    { limit: '1e1' },
    { limit: '1.5' },
    { cursor: '' },
    { cursor: 'not-a-cursor' },
  ]) {
    await assert.rejects(query(params), (error) => error.status === 422);
  }
  for (const key of ['status', 'q', 'coordinator', 'cursor', 'limit']) {
    await assert.rejects(
      queryPracticeInbox(repo, new URLSearchParams(`${key}=1&${key}=2`)),
      (error) => error.status === 422,
    );
  }
  const first = await query({ limit: '1' });
  for (const changes of [
    { q: 'call' },
    { coordinator: 'Pat' },
    { status: 'completed' },
  ]) {
    await assert.rejects(
      query({ ...changes, cursor: first.next_cursor }),
      (error) => error.status === 422,
    );
  }
  assert.equal((await query({ limit: '50' })).assignments.length, 2);
});

test('completion between pages changes totals without reusing earlier assignments', async (t) => {
  const { repo, call, assessment, assignment, complete, query } =
    await setup(t);
  await call(repo, 'call');
  await assessment(repo, 'baseline', 'call');
  for (const id of ['a', 'b', 'c'])
    await assignment(repo, id, 'call', 'baseline');
  const first = await query({ limit: '1' });
  await complete(repo, 'a', 'baseline');
  const second = await query({ limit: '1', cursor: first.next_cursor });
  assert.equal(first.total, 3);
  assert.equal(second.total, 2);
  assert.deepEqual(
    second.assignments.map((item) => item.id),
    ['b'],
  );
});

test('summary scores abstain on unsupported, absent or malformed target dimensions', async (t) => {
  const { repo, call, assessment, assignment, query } = await setup(t);
  await call(repo, 'call');
  await assessment(repo, 'baseline', 'call');
  await assignment(repo, 'practice', 'call', 'baseline');
  const target = {
    dimension: 1,
    score: 3,
    unsupported: false,
    evidence: [{ span: 'Mechanical fixture' }],
  };
  for (const dimension of [
    { ...target, unsupported: true },
    { ...target, evidence: [] },
    { ...target, score: '3' },
    { ...target, score: 6 },
    { ...target, score: 2.5 },
    { ...target, dimension: 0 },
  ]) {
    await repo
      .statement(
        'UPDATE assessments SET content=? WHERE workspace_id=? AND id=?',
        JSON.stringify({ dimensions: [dimension] }),
        repo.workspaceId,
        'baseline',
      )
      .run();
    assert.equal((await query()).assignments[0].baseline_score, null);
  }
});
