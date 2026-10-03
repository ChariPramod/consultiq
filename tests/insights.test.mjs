import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase } from '../server/database.ts';
import { migrate } from '../scripts/migrate-local.mjs';
import { Repository } from '../server/repository.ts';
import { workspaceInsights } from '../server/insights.ts';
import { prepareAssessment } from '../lib/assessment.ts';

const when = '2026-10-03T10:00:00.000Z';
const turns = [
  { role: 'Coordinator', text: 'Private transcript fixture.', time: '' },
  { role: 'Patient', text: 'Private patient fixture.', time: '' },
];
// Mechanical fixtures exercise aggregation, not rubric validity or model quality.
const content = (scores) =>
  prepareAssessment(
    turns,
    Array.from({ length: 8 }, (_, dimension) => ({
      dimension,
      score: scores[dimension] ?? null,
      rationale: 'Private rationale fixture.',
      coaching_note: 'Private coaching fixture.',
      evidence:
        scores[dimension] == null
          ? []
          : [{ turn_index: 0, span: turns[0].text }],
    })),
  );
async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), 'consultiq-insights-'));
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
  async function call(scope, id, coordinator = 'Pat', outcome = 'unknown') {
    await scope
      .statement(
        'INSERT INTO consultations (id,workspace_id,title,coordinator,source,outcome,turns,recorded_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        id,
        scope.workspaceId,
        'Private title fixture.',
        coordinator,
        'synthetic',
        outcome,
        JSON.stringify(turns),
        '2026-10-03',
        when,
      )
      .run();
    return id;
  }
  async function rubric(scope, id, created = when) {
    await scope
      .statement(
        'INSERT INTO rubrics (id,workspace_id,title,definitions,created_at) VALUES (?,?,?,?,?)',
        id,
        scope.workspaceId,
        id,
        '[]',
        created,
      )
      .run();
    return id;
  }
  async function assessment(
    scope,
    id,
    callId,
    rubricId,
    kind,
    scores,
    created = when,
  ) {
    await scope
      .statement(
        'INSERT INTO assessments (id,workspace_id,call_id,rubric_id,kind,content,prompt_version,model,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        id,
        scope.workspaceId,
        callId,
        rubricId,
        kind,
        JSON.stringify(content(scores)),
        'test',
        'test',
        created,
      )
      .run();
    return id;
  }
  return { db, repo, other, call, rubric, assessment };
}

test('empty insights have real zero counts and no invented rubric or numeric mean', async (t) => {
  const { repo, rubric } = await setup(t);
  const empty = await workspaceInsights(repo);
  assert.deepEqual(empty.totals, {
    calls: 0,
    unreviewed: 0,
    latest_human: 0,
    latest_ai: 0,
    fully_supported: 0,
    partially_supported: 0,
    unscored: 0,
  });
  assert.equal(empty.current_rubric, null);
  assert.deepEqual(empty.rubric_groups, {
    total: 0,
    has_more: false,
    items: [],
  });
  assert.deepEqual(empty.coordinators, {
    total: 0,
    has_more: false,
    items: [],
  });
  assert.deepEqual(empty.practice, { pending: 0, completed: 0 });
  assert.deepEqual(empty.jobs, {
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  });
  await rubric(repo, 'empty-rubric');
  const current = (await workspaceInsights(repo)).current_rubric;
  assert.equal(current.human_calls, 0);
  assert.equal(current.dimensions.length, 8);
  for (const dimension of current.dimensions)
    assert.deepEqual(dimension, {
      dimension: dimension.dimension,
      supported: 0,
      unscored: 0,
      mean: null,
    });
});

test('insights count every call beyond the loaded 200, isolate workspace data and never return transcript or rationale text', async (t) => {
  const { db, repo, other, call, rubric, assessment } = await setup(t);
  await db.batch(
    Array.from({ length: 237 }, (_, n) =>
      repo.statement(
        'INSERT INTO consultations (id,workspace_id,title,coordinator,source,outcome,turns,recorded_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        `call-${n}`,
        repo.workspaceId,
        'Private title fixture.',
        `Coordinator ${String(n % 23).padStart(2, '0')}`,
        'synthetic',
        n % 2 ? 'accepted' : 'follow_up',
        JSON.stringify(turns),
        '2026-10-03',
        when,
      ),
    ),
  );
  await call(other, 'foreign-call', 'Secret coordinator', 'not_accepted');
  await rubric(other, 'Secret rubric');
  await assessment(
    other,
    'foreign-assessment',
    'foreign-call',
    'Secret rubric',
    'human',
    Array(8).fill(5),
  );
  const result = await workspaceInsights(repo);
  assert.equal(result.scope, 'all_time');
  assert.ok(Number.isFinite(Date.parse(result.generated_at)));
  assert.equal(result.totals.calls, 237);
  assert.equal(result.totals.unreviewed, 237);
  assert.deepEqual(result.outcomes, {
    unknown: 0,
    accepted: 118,
    not_accepted: 0,
    follow_up: 119,
  });
  assert.equal(result.coordinators.total, 23);
  assert.equal(result.coordinators.items.length, 20);
  assert.equal(result.coordinators.has_more, true);
  assert.equal(result.coordinators.items[0].name, 'Coordinator 00');
  assert.equal(result.coordinators.items[0].calls, 11);
  assert.doesNotMatch(
    JSON.stringify(result),
    /Private|Secret|turns|rationale|coaching_note|evidence/,
  );
  assert.equal(result.current_rubric, null);
});

test('only latest revisions count; human dimension means keep current rubric, distinct support denominators and abstentions', async (t) => {
  const { repo, call, rubric, assessment } = await setup(t);
  await rubric(repo, 'older');
  await rubric(repo, 'current'); // same timestamp, most recently inserted wins
  for (const id of ['one', 'two', 'three', 'four', 'five', 'six'])
    await call(repo, id);
  await assessment(
    repo,
    'old-revision',
    'one',
    'older',
    'ai',
    Array(8).fill(5),
  );
  await assessment(repo, 'one-latest', 'one', 'current', 'human', [2, null, 4]); // same timestamp, rowid wins
  await assessment(repo, 'two-latest', 'two', 'current', 'human', [
    4,
    null,
    null,
  ]);
  await assessment(
    repo,
    'three-latest',
    'three',
    'current',
    'ai',
    Array(8).fill(5),
  );
  await assessment(
    repo,
    'four-latest',
    'four',
    'older',
    'human',
    Array(8).fill(1),
  );
  await assessment(repo, 'five-latest', 'five', 'current', 'human', []);
  const result = await workspaceInsights(repo);
  assert.deepEqual(result.totals, {
    calls: 6,
    unreviewed: 1,
    latest_human: 4,
    latest_ai: 1,
    fully_supported: 2,
    partially_supported: 2,
    unscored: 1,
  });
  assert.equal(result.current_rubric.id, 'current');
  assert.equal(result.current_rubric.human_calls, 3);
  assert.deepEqual(result.current_rubric.dimensions[0], {
    dimension: 0,
    supported: 2,
    unscored: 1,
    mean: 3,
  });
  assert.deepEqual(result.current_rubric.dimensions[1], {
    dimension: 1,
    supported: 0,
    unscored: 3,
    mean: null,
  });
  assert.deepEqual(result.current_rubric.dimensions[2], {
    dimension: 2,
    supported: 1,
    unscored: 2,
    mean: 4,
  });
  const groups = Object.fromEntries(
    result.rubric_groups.items.map((x) => [x.id, x]),
  );
  assert.equal(groups.older.calls, 1);
  assert.equal(groups.current.calls, 4);
  assert.equal(groups.current.latest_human, 3);
  assert.equal(groups.current.latest_ai, 1);
  assert.equal(result.coordinators.items[0].latest_human, 4);
  assert.equal('average' in result.totals, false);
  assert.equal('mean' in groups.current, false);
});

test('practice and job aggregates include only scoped records and distinguish pending from completed assignments', async (t) => {
  const { repo, other, call, rubric, assessment } = await setup(t);
  for (const { scope, prefix } of [
    { scope: repo, prefix: 'ours' },
    { scope: other, prefix: 'foreign' },
  ]) {
    await call(scope, `${prefix}-call`);
    await rubric(scope, `${prefix}-rubric`);
    await assessment(
      scope,
      `${prefix}-assessment`,
      `${prefix}-call`,
      `${prefix}-rubric`,
      'human',
      [3],
    );
    for (const suffix of ['pending', 'done'])
      await scope
        .statement(
          'INSERT INTO practice_assignments (id,workspace_id,call_id,baseline_id,dimension,instruction,created_at) VALUES (?,?,?,?,?,?,?)',
          `${prefix}-${suffix}`,
          scope.workspaceId,
          `${prefix}-call`,
          `${prefix}-assessment`,
          0,
          'Private instruction',
          when,
        )
        .run();
    await scope
      .statement(
        'INSERT INTO practice_completions (id,workspace_id,assignment_id,assessment_id,reflection,created_at) VALUES (?,?,?,?,?,?)',
        `${prefix}-completion`,
        scope.workspaceId,
        `${prefix}-done`,
        `${prefix}-assessment`,
        'Private reflection',
        when,
      )
      .run();
    for (const status of [
      'queued',
      'running',
      'completed',
      'failed',
      'cancelled',
    ])
      await scope
        .statement(
          'INSERT INTO analysis_jobs (id,workspace_id,call_id,kind,status,created_at) VALUES (?,?,?,?,?,?)',
          `${prefix}-${status}`,
          scope.workspaceId,
          `${prefix}-call`,
          'scoring',
          status,
          when,
        )
        .run();
  }
  const result = await workspaceInsights(repo);
  assert.deepEqual(result.practice, { pending: 1, completed: 1 });
  assert.deepEqual(result.jobs, {
    queued: 1,
    running: 1,
    completed: 1,
    failed: 1,
    cancelled: 1,
  });
  assert.doesNotMatch(JSON.stringify(result), /Private|foreign/);
});

test('rubric summary is bounded and reports omitted versions without averaging their scores', async (t) => {
  const { repo, call, rubric, assessment } = await setup(t);
  for (let n = 0; n < 53; n++) {
    await call(repo, `call-${n}`);
    await rubric(repo, `rubric-${n}`);
    await assessment(
      repo,
      `assessment-${n}`,
      `call-${n}`,
      `rubric-${n}`,
      'human',
      [(n % 5) + 1],
    );
  }
  const result = await workspaceInsights(repo);
  assert.equal(result.rubric_groups.total, 53);
  assert.equal(result.rubric_groups.items.length, 50);
  assert.equal(result.rubric_groups.has_more, true);
  assert.equal(result.totals.calls, 53);
  assert.equal(result.current_rubric.id, 'rubric-52');
  assert.equal(result.current_rubric.human_calls, 1);
});
