import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase } from '../server/database.ts';
import { migrate } from '../scripts/migrate-local.mjs';
import { Repository } from '../server/repository.ts';
import { Learning } from '../server/learning.ts';
import { queryFollowupCandidates } from '../server/followup-candidates.ts';

const time = '2026-09-22T10:00:00.000Z';
const later = '2026-09-23T10:00:00.000Z';
async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), 'consultiq-followup-'));
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
        `rubric-${scope.workspaceId}`,
        scope.workspaceId,
        'Mechanical fixture only',
        '[]',
        time,
      )
      .run();
  }
  const call = async (scope, id, options = {}) => {
    await scope
      .statement(
        'INSERT INTO consultations (id,workspace_id,title,coordinator,source,outcome,turns,recorded_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        id,
        scope.workspaceId,
        options.title ?? id,
        options.coordinator ?? 'Pat',
        'synthetic',
        'unknown',
        '[{"role":"Coordinator","text":"Private transcript","time":"00:00"}]',
        options.recorded_at ?? '2026-09-22',
        options.created_at ?? time,
      )
      .run();
    return id;
  };
  const assessment = async (scope, id, callId, options = {}) => {
    await scope
      .statement(
        'INSERT INTO assessments (id,workspace_id,call_id,rubric_id,kind,content,prompt_version,model,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        id,
        scope.workspaceId,
        callId,
        options.rubric_id ?? `rubric-${scope.workspaceId}`,
        options.kind ?? 'human',
        '{"dimensions":[],"private":"Private assessment prose"}',
        'mechanical-fixture',
        'fixture',
        options.created_at ?? later,
      )
      .run();
    return id;
  };
  const assignment = async (
    scope,
    id,
    callId = 'baseline-call',
    baselineId = 'baseline',
    reviewId = null,
  ) => {
    await scope
      .statement(
        'INSERT INTO practice_assignments (id,workspace_id,call_id,baseline_id,review_id,dimension,instruction,created_at) VALUES (?,?,?,?,?,?,?,?)',
        id,
        scope.workspaceId,
        callId,
        baselineId,
        reviewId,
        1,
        'Private practice instruction',
        time,
      )
      .run();
    return id;
  };
  await call(repo, 'baseline-call');
  await assessment(repo, 'baseline', 'baseline-call', { created_at: time });
  await assignment(repo, 'practice');
  const query = (params = {}, assignmentId = 'practice', scope = repo) =>
    queryFollowupCandidates(scope, assignmentId, new URLSearchParams(params));
  return { db, repo, other, call, assessment, assignment, query };
}

test('eligible follow-ups beyond the latest 200 consultations are searchable and keyset paginated', async (t) => {
  const { repo, call, assessment, query } = await setup(t);
  for (let i = 0; i < 207; i++) {
    const id = `followup-${String(i).padStart(3, '0')}`;
    await call(repo, id, {
      title: i === 0 ? 'Earlier imported eligible role-play' : id,
      created_at: i === 0 ? time : later,
    });
    await assessment(repo, `human-${i}`, id);
  }
  const found = await query({ q: 'Earlier imported' });
  assert.equal(found.candidates[0].call_id, 'followup-000');
  assert.equal(found.candidates[0].assessment_id, 'human-0');
  assert.deepEqual(Object.keys(found.candidates[0]).sort(), [
    'assessment_created_at',
    'assessment_id',
    'call_id',
    'coordinator',
    'recorded_at',
    'title',
  ]);
  const ids = [];
  let cursor = null;
  do {
    const page = await query({ limit: '50', ...(cursor ? { cursor } : {}) });
    assert.ok(page.candidates.length <= 50);
    assert.equal(page.has_more, page.next_cursor !== null);
    ids.push(...page.candidates.map((candidate) => candidate.call_id));
    cursor = page.next_cursor;
    assert.doesNotMatch(
      JSON.stringify(page),
      /Private transcript|Private assessment|Private practice/,
    );
  } while (cursor);
  assert.equal(ids.length, 207);
  assert.equal(new Set(ids).size, 207);
  assert.equal(ids.at(-1), 'followup-000');
});

test('eligibility matches completion rules and uses the pinned baseline after later revisions', async (t) => {
  const { repo, other, call, assessment, query } = await setup(t);
  /** @type {[string, Record<string, string>, Record<string, string> | null][]} */
  const cases = [
    ['eligible', {}, {}],
    ['same-timestamp', {}, { created_at: time }],
    ['wrong-coordinator', { coordinator: 'Pat Jones' }, {}],
    ['earlier-roleplay', { recorded_at: '2026-09-21' }, {}],
    ['early-assessment', {}, { created_at: '2026-09-22T09:59:59.999Z' }],
    ['wrong-rubric', {}, { rubric_id: `rubric-${other.workspaceId}` }],
    ['latest-ai', {}, {}],
    ['unreviewed', {}, null],
  ];
  for (const [id, callOptions, assessmentOptions] of cases) {
    await call(repo, id, callOptions);
    if (assessmentOptions)
      await assessment(repo, `human-${id}`, id, assessmentOptions);
  }
  await assessment(repo, 'newer-ai', 'latest-ai', { kind: 'ai' });
  // Same created_at: later insertion wins. Baseline remains the originally pinned rubric.
  await assessment(repo, 'changed-baseline', 'baseline-call', {
    rubric_id: `rubric-${other.workspaceId}`,
  });
  assert.deepEqual(
    (await query()).candidates.map((candidate) => candidate.call_id),
    ['same-timestamp', 'eligible'],
  );
  await assessment(repo, 'human-after-ai', 'latest-ai');
  assert.deepEqual(
    (await query()).candidates.map((candidate) => candidate.assessment_id),
    ['human-same-timestamp', 'human-after-ai', 'human-eligible'],
  );
});

test('foreign and inconsistent workspace joins never expose candidate or baseline content', async (t) => {
  const { repo, other, call, assessment, assignment, query } = await setup(t);
  await call(other, 'private-call', { title: 'Other workspace secret' });
  await assessment(other, 'private-human', 'private-call');
  await assignment(other, 'private-practice', 'private-call', 'private-human');
  await call(repo, 'own-call');
  // Foreign keys exist but their workspaces do not match; read joins must still scope them.
  await assessment(other, 'bad-cross-scope', 'own-call');
  await assignment(repo, 'bad-baseline', 'baseline-call', 'private-human');
  assert.equal((await query()).candidates.length, 0);
  await assert.rejects(
    query({}, 'private-practice'),
    (error) => error.status === 404,
  );
  await assert.rejects(
    query({}, 'bad-baseline'),
    (error) => error.status === 404,
  );
  await assert.rejects(query({}, 'missing'), (error) => error.status === 404);
});

test('literal title search, bounded pages and cursor scope reject ambiguous requests', async (t) => {
  const { repo, other, call, assessment, assignment, query } = await setup(t);
  for (const [id, title] of [
    ['a', '100% complete'],
    ['b', '1000 complete'],
    ['c', 'a_b'],
    ['d', 'aXb'],
    ['e', 'a\\b'],
  ]) {
    await call(repo, id, { title });
    await assessment(repo, `human-${id}`, id);
  }
  assert.deepEqual(
    (await query({ q: '%' })).candidates.map((row) => row.call_id),
    ['a'],
  );
  assert.deepEqual(
    (await query({ q: '_' })).candidates.map((row) => row.call_id),
    ['c'],
  );
  assert.deepEqual(
    (await query({ q: '\\' })).candidates.map((row) => row.call_id),
    ['e'],
  );
  assert.equal((await query({ q: "' OR 1=1 --" })).candidates.length, 0);
  assert.equal((await query()).limit, 25);
  for (const params of [
    { limit: '0' },
    { limit: '51' },
    { limit: '1.5' },
    { limit: '1e1' },
    { q: 'x'.repeat(201) },
    { cursor: '' },
    { cursor: 'invalid' },
  ]) {
    await assert.rejects(query(params), (error) => error.status === 422);
  }
  for (const key of ['q', 'limit', 'cursor']) {
    await assert.rejects(
      queryFollowupCandidates(
        repo,
        'practice',
        new URLSearchParams(`${key}=1&${key}=2`),
      ),
      (error) => error.status === 422,
    );
  }
  const first = await query({ limit: '1' });
  await assignment(repo, 'second-practice');
  await assert.rejects(
    query({ q: 'a', cursor: first.next_cursor }),
    (error) => error.status === 422,
  );
  await assert.rejects(
    query({ cursor: first.next_cursor }, 'second-practice'),
    (error) => error.status === 422,
  );
  await assert.rejects(
    query({ cursor: first.next_cursor }, 'practice', other),
    (error) => error.status === 422,
  );
  const forged = JSON.parse(
    Buffer.from(first.next_cursor, 'base64url').toString(),
  );
  forged.recorded_at = 'not-a-date';
  await assert.rejects(
    query({
      cursor: Buffer.from(JSON.stringify(forged)).toString('base64url'),
    }),
    (error) => error.status === 422,
  );
});

test('revised coaching approval and completed assignments cannot offer new follow-ups', async (t) => {
  const { repo, call, assessment, assignment, query } = await setup(t);
  await repo
    .statement(
      'INSERT INTO coaching_runs (id,workspace_id,call_id,question,answer,citations,model,prompt_version,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      'coaching',
      repo.workspaceId,
      'baseline-call',
      'Fixture',
      'Private coaching',
      '[]',
      'fixture',
      'fixture',
      time,
    )
    .run();
  const decision = async (id, choice, base) =>
    repo
      .statement(
        'INSERT INTO coaching_reviews (id,workspace_id,coaching_id,decision,guidance,notes,base_id,created_at) VALUES (?,?,?,?,?,?,?,?)',
        id,
        repo.workspaceId,
        'coaching',
        choice,
        'Private guidance',
        'Fixture rationale',
        base,
        time,
      )
      .run();
  await decision('approval', 'approved', '');
  await assignment(
    repo,
    'approved-practice',
    'baseline-call',
    'baseline',
    'approval',
  );
  await call(repo, 'followup');
  await assessment(repo, 'followup-human', 'followup');
  assert.equal((await query({}, 'approved-practice')).candidates.length, 1);
  await decision('rejection', 'rejected', 'approval');
  await assert.rejects(
    query({}, 'approved-practice'),
    (error) => error.status === 409 && error.code === 'learning_conflict',
  );
  await decision('new-approval', 'approved', 'rejection');
  await assert.rejects(
    query({}, 'approved-practice'),
    (error) => error.status === 409,
  );
  await new Learning(repo).complete('practice', {
    request_id: crypto.randomUUID(),
    assessment_id: 'followup-human',
    reflection: 'Mechanical fixture',
  });
  await assert.rejects(query(), (error) => error.status === 409);
});

test('completion rejects a once-eligible selection after a newer assessment arrives', async (t) => {
  const { repo, call, assessment, query } = await setup(t);
  await call(repo, 'followup');
  await assessment(repo, 'followup-human', 'followup');
  const selected = (await query()).candidates[0];
  await assessment(repo, 'followup-newer-ai', 'followup', { kind: 'ai' });
  await assert.rejects(
    new Learning(repo).complete('practice', {
      request_id: crypto.randomUUID(),
      assessment_id: selected.assessment_id,
      reflection: 'Retained reviewer draft',
    }),
    (error) => error.status === 409,
  );
  assert.equal((await query()).candidates.length, 0);
  await assessment(repo, 'followup-newest-human', 'followup');
  const current = (await query()).candidates[0];
  await new Learning(repo).complete('practice', {
    request_id: crypto.randomUUID(),
    assessment_id: current.assessment_id,
    reflection: 'Retained reviewer draft',
  });
  const saved = await repo
    .statement(
      'SELECT assessment_id FROM practice_completions WHERE workspace_id=? AND assignment_id=?',
      repo.workspaceId,
      'practice',
    )
    .first();
  assert.equal(saved.assessment_id, 'followup-newest-human');
});
