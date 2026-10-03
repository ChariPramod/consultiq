import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase } from '../server/database.ts';
import { migrate } from '../scripts/migrate-local.mjs';
import { Repository } from '../server/repository.ts';
import { queryConsultations } from '../server/consultation-query.ts';

async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), 'consultiq-query-'));
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
  async function insert(
    scope,
    id,
    title = id,
    coordinator = 'Pat',
    outcome = 'unknown',
    time = '2026-09-22T10:00:00.000Z',
  ) {
    await scope
      .statement(
        `INSERT INTO consultations (id,workspace_id,title,coordinator,source,outcome,turns,recorded_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        id,
        scope.workspaceId,
        title,
        coordinator,
        'synthetic',
        outcome,
        JSON.stringify([
          { id: 1, speaker: 'Coordinator', text: 'Test fixture' },
        ]),
        '2026-09-22',
        time,
      )
      .run();
  }
  const query = (params = {}) =>
    queryConsultations(repo, new URLSearchParams(params));
  return { repo, other, insert, query };
}

test('pagination isolates workspaces and orders tied creation times without duplicates or skips', async (t) => {
  const { repo, other, insert, query } = await setup(t);
  for (const id of ['a', 'b', 'c', 'd', 'e']) await insert(repo, id);
  await insert(other, 'z', 'Secret');
  const first = await query({ limit: '2' });
  assert.equal(first.total, 5);
  assert.deepEqual(
    first.calls.map((c) => c.id),
    ['e', 'd'],
  );
  assert.equal(first.has_more, true);
  assert.equal(first.calls[0].latest, null);
  assert.equal(first.calls[0].turn_count, 1);
  assert.equal('turns' in first.calls[0], false);
  assert.doesNotMatch(JSON.stringify(first), /Test fixture/);
  await insert(
    repo,
    'new',
    'New',
    'Pat',
    'unknown',
    '2026-09-23T10:00:00.000Z',
  );
  const second = await query({ limit: '2', cursor: first.next_cursor });
  assert.equal(second.total, 6);
  assert.deepEqual(
    second.calls.map((c) => c.id),
    ['c', 'b'],
  );
  const last = await query({ limit: '2', cursor: second.next_cursor });
  assert.deepEqual(
    last.calls.map((c) => c.id),
    ['a'],
  );
  assert.equal(last.next_cursor, null);
  assert.equal(last.has_more, false);
  await assert.rejects(
    queryConsultations(
      other,
      new URLSearchParams({ cursor: first.next_cursor }),
    ),
    (e) => e.status === 422,
  );
});

test('search treats wildcards literally and combines exact coordinator and outcome filters', async (t) => {
  const { repo, insert, query } = await setup(t);
  await insert(repo, 'a', '100% complete', 'Pat', 'accepted');
  await insert(repo, 'b', '1000 complete', 'Pat Jones', 'follow_up');
  await insert(repo, 'c', 'a_b', 'Pat', 'follow_up');
  await insert(repo, 'd', 'aXb', 'Other', 'unknown');
  assert.deepEqual(
    (await query({ q: '%' })).calls.map((c) => c.id),
    ['a'],
  );
  assert.deepEqual(
    (await query({ q: '_' })).calls.map((c) => c.id),
    ['c'],
  );
  assert.deepEqual(
    (
      await query({ q: 'PAT', outcome: 'follow_up', coordinator: 'Pat' })
    ).calls.map((c) => c.id),
    ['c'],
  );
  assert.equal((await query({ q: "' OR 1=1 --" })).total, 0);
});

test('review filter uses latest revision including equal-timestamp insertion order', async (t) => {
  const { repo, other, insert, query } = await setup(t);
  await insert(repo, 'a');
  await insert(repo, 'b');
  await insert(repo, 'c');
  await insert(other, 'private');
  await repo
    .statement(
      'INSERT INTO rubrics (id,workspace_id,title,definitions,created_at) VALUES (?,?,?,?,?)',
      'rubric',
      repo.workspaceId,
      'Mechanical test',
      '[]',
      '2026-09-22T10:00:00.000Z',
    )
    .run();
  const add = async (id, call, kind) =>
    repo
      .statement(
        `INSERT INTO assessments (id,workspace_id,call_id,rubric_id,kind,content,prompt_version,model,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        id,
        repo.workspaceId,
        call,
        'rubric',
        kind,
        '{"dimensions":[{"rationale":"Private rationale","evidence":[{"span":"Private evidence"}]}],"average":3,"supported_count":8}',
        'test',
        'test',
        '2026-09-22T10:00:00.000Z',
      )
      .run();
  await add('old-human', 'a', 'human');
  await add('new-ai', 'a', 'ai');
  await add('human', 'b', 'human');
  assert.deepEqual(
    (await query({ review: 'ai' })).calls.map((c) => [c.id, c.latest.id]),
    [['a', 'new-ai']],
  );
  assert.deepEqual(
    (await query({ review: 'human' })).calls.map((c) => c.id),
    ['b'],
  );
  assert.deepEqual(
    (await query({ review: 'unreviewed' })).calls.map((c) => c.id),
    ['c'],
  );
  const page = await query({ review: 'ai' });
  assert.equal(page.total, 1);
  assert.deepEqual(page.calls[0].latest.content, {
    average: 3,
    supported_count: 8,
  });
  assert.doesNotMatch(
    JSON.stringify(page),
    /Private rationale|Private evidence|dimensions|turns/,
  );
});

test('invalid limits, filters, repeated parameters and incompatible cursors fail without widening results', async (t) => {
  const { repo, insert, query } = await setup(t);
  await insert(repo, 'a');
  await insert(repo, 'b');
  for (const params of [
    { limit: '0' },
    { limit: '51' },
    { limit: '1.5' },
    { limit: '-1' },
    { limit: '1e1' },
    { outcome: 'x' },
    { review: 'x' },
    { q: 'a'.repeat(201) },
    { coordinator: 'x'.repeat(201) },
    { cursor: '' },
    { cursor: 'garbage' },
  ]) {
    await assert.rejects(query(params), (e) => e.status === 422);
  }
  await assert.rejects(
    queryConsultations(repo, new URLSearchParams('limit=1&limit=2')),
    (e) => e.status === 422,
  );
  const page = await query({ limit: '1' });
  for (const changed of [
    { q: 'a' },
    { review: 'human' },
    { outcome: 'unknown' },
    { coordinator: 'Pat' },
  ]) {
    await assert.rejects(
      query({ ...changed, cursor: page.next_cursor }),
      (e) => e.status === 422,
    );
  }
  assert.equal((await query({ limit: '50' })).calls.length, 2);
});

test('cursor accepts maximum-length multibyte filters generated by the server', async (t) => {
  const { repo, insert, query } = await setup(t);
  const unicode = '語'.repeat(200);
  await insert(repo, 'a', unicode, unicode);
  await insert(repo, 'b', unicode, unicode);
  const first = await query({ q: unicode, coordinator: unicode, limit: '1' });
  const second = await query({
    q: unicode,
    coordinator: unicode,
    limit: '1',
    cursor: first.next_cursor,
  });
  assert.deepEqual(
    second.calls.map((c) => c.id),
    ['a'],
  );
});
