import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase } from '../server/database.ts';
import { Repository } from '../server/repository.ts';
import { queryJobs } from '../server/job-query.ts';
import { readMigrations } from '../scripts/migrate-local.mjs';

const stamp = '2026-10-01T10:00:00.000Z';
const pad = (n) => String(n).padStart(4, '0');
async function setup(t, before = false) {
  const directory = await mkdtemp(
    join(tmpdir(), 'consultiq-query-optimization-'),
  );
  const db = await createDatabase({
    DATABASE_URL: pathToFileURL(join(directory, 'test.db')).href,
  });
  t.after(async () => {
    db.close();
    await rm(directory, { recursive: true, force: true });
  });
  const migrations = await readMigrations();
  const boundary = migrations.findIndex(
    (m) => m.name === '0007_sharp_menace.sql',
  );
  assert.ok(boundary > 0);
  for (const migration of before ? migrations.slice(0, boundary) : migrations)
    for (const sql of migration.statements) await db.client.execute(sql);
  const repos = await Promise.all(
    ['owner', 'other'].map((owner) => Repository.forUser(db, owner)),
  );
  for (const repo of repos)
    await repo
      .statement(
        'INSERT INTO consultations(id,workspace_id,title,coordinator,source,outcome,turns,recorded_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        `${repo.workspaceId}-call`,
        repo.workspaceId,
        'Synthetic query fixture',
        'Fixture',
        'synthetic',
        'unknown',
        '[]',
        '2026-10-01',
        stamp,
      )
      .run();
  const job = (repo, id, status, created = stamp) =>
    repo.statement(
      'INSERT INTO analysis_jobs(id,workspace_id,call_id,kind,status,created_at,payload_json,requested_by,request_key) VALUES (?,?,?,?,?,?,?,?,?)',
      id,
      repo.workspaceId,
      `${repo.workspaceId}-call`,
      'scoring',
      status,
      created,
      '{"question":"PRIVATE_PAYLOAD_SENTINEL"}',
      'PRIVATE_ACTOR_SENTINEL',
      `PRIVATE_REQUEST_SENTINEL-${id}`,
    );
  return {
    db,
    repo: repos[0],
    other: repos[1],
    job,
    migration: migrations[boundary],
  };
}

test('index-only upgrade preserves full run and audit records while replacing redundant chronology indexes', async (t) => {
  const { db, repo, other, job, migration } = await setup(t, true);
  await db.batch([
    job(repo, 'queued', 'queued'),
    job(repo, 'running', 'running'),
    job(repo, 'completed', 'completed'),
    job(other, 'foreign', 'failed'),
    repo.event('assessment_saved', 'synthetic-preserved-entity'),
    other.event('knowledge_approved', 'synthetic-other-entity'),
  ]);
  const snapshot = async () => ({
    jobs: (await db.prepare('SELECT * FROM analysis_jobs ORDER BY id').all())
      .results,
    audit: (await db.prepare('SELECT * FROM audit_events ORDER BY id').all())
      .results,
  });
  const before = await snapshot();
  await db.client.batch(migration.statements, 'write');
  assert.deepEqual(await snapshot(), before);
  const indexes = (
    await db
      .prepare(
        "SELECT name,sql FROM sqlite_master WHERE type='index' AND (name LIKE 'jobs_%' OR name LIKE 'audit_%')",
      )
      .all()
  ).results;
  assert.ok(
    !indexes.some((r) =>
      ['jobs_workspace_created', 'audit_workspace_created'].includes(r.name),
    ),
  );
  for (const name of [
    'jobs_workspace_created_id',
    'jobs_workspace_active_created_id',
    'audit_workspace_created_id',
  ])
    assert.ok(
      indexes.some((r) => r.name === name),
      name,
    );
  assert.match(
    indexes.find((r) => r.name === 'jobs_workspace_active_created_id').sql,
    /WHERE .*status.*IN \('queued','running'\)/,
  );
  for (const [table, index] of [
    ['analysis_jobs', 'jobs_workspace_created_id'],
    ['audit_events', 'audit_workspace_created_id'],
  ]) {
    const plan = (
      await repo
        .statement(
          `EXPLAIN QUERY PLAN SELECT id,created_at FROM ${table} WHERE workspace_id=? AND (created_at,id)<(?,?) ORDER BY created_at DESC,id DESC LIMIT 25`,
          repo.workspaceId,
          stamp,
          'zzzz',
        )
        .all()
    ).results
      .map((r) => (typeof r.detail === 'string' ? r.detail : ''))
      .join('\n');
    assert.match(plan, new RegExp(index));
    assert.match(plan, /\(created_at,id\)<\(\?,\?\)/);
    assert.doesNotMatch(plan, /TEMP B-TREE/);
  }
});

test('bootstrap returns a bounded active-first summary with deterministic ties and no private run fields', async (t) => {
  const { db, repo, other, job } = await setup(t);
  await db.batch(
    Array.from({ length: 230 }, (_, i) =>
      job(other, `foreign-${pad(i)}`, 'queued'),
    ),
  );
  for (const activeCount of [0, 2, 200, 230]) {
    await repo
      .statement(
        'DELETE FROM analysis_jobs WHERE workspace_id=?',
        repo.workspaceId,
      )
      .run();
    const fixtures = [];
    // Reverse insertion deliberately makes rowid tie order differ from IDs.
    for (let i = 229; i >= 0; i--)
      fixtures.push({
        id: `terminal-${pad(i)}`,
        status: ['completed', 'failed', 'cancelled'][i % 3],
        created_at: stamp,
      });
    for (let i = activeCount - 1; i >= 0; i--)
      fixtures.push({
        id: `active-${pad(i)}`,
        status: i % 2 ? 'running' : 'queued',
        created_at: '2026-09-01T00:00:00.000Z',
      });
    await db.batch(
      fixtures.map((item) => job(repo, item.id, item.status, item.created_at)),
    );
    const overview = await repo.overview();
    const priority = (item) =>
      ['running', 'queued'].includes(item.status) ? 0 : 1;
    const expected = fixtures
      .toSorted(
        (a, b) =>
          priority(a) - priority(b) ||
          b.created_at.localeCompare(a.created_at) ||
          b.id.localeCompare(a.id),
      )
      .slice(0, 200);
    assert.deepEqual(
      overview.jobs.map((item) => item.id),
      expected.map((item) => item.id),
      `active count ${activeCount}`,
    );
    assert.equal(overview.jobs.length, 200);
    assert.doesNotMatch(
      JSON.stringify(overview),
      /foreign-|PRIVATE_PAYLOAD_SENTINEL|PRIVATE_ACTOR_SENTINEL|PRIVATE_REQUEST_SENTINEL/,
    );
    assert.deepEqual(Object.keys(overview.jobs[0]).sort(), [
      'call_id',
      'created_at',
      'error_code',
      'id',
      'kind',
      'status',
      'telemetry',
    ]);
  }
});

test('production history query seeks by cursor without a temporary sort and bootstrap uses the sparse active index', async (t) => {
  const { db, repo, job } = await setup(t);
  await db.batch(
    Array.from({ length: 80 }, (_, i) =>
      job(repo, `job-${pad(i)}`, i % 2 ? 'completed' : 'running'),
    ),
  );
  const queries = [];
  const original = repo.statement.bind(repo);
  repo.statement = (sql, ...args) => {
    queries.push({ sql, args });
    return original(sql, ...args);
  };
  const first = await queryJobs(
    repo,
    new URLSearchParams({ limit: '25' }),
    'owner',
  );
  queries.length = 0;
  const second = await queryJobs(
    repo,
    new URLSearchParams({ limit: '25', cursor: first.next_cursor }),
    'owner',
  );
  assert.equal(second.jobs[0].id, 'job-0054');
  const historyQuery = queries.find(({ sql }) =>
    sql.includes('FROM analysis_jobs j'),
  );
  const plan = (
    await db.client.execute({
      ...historyQuery,
      sql: 'EXPLAIN QUERY PLAN ' + historyQuery.sql,
    })
  ).rows
    .map((r) => (typeof r.detail === 'string' ? r.detail : ''))
    .join('\n');
  assert.match(plan, /jobs_workspace_created_id.*\(created_at,id\)<\(\?,\?\)/);
  assert.doesNotMatch(plan, /TEMP B-TREE/);
  queries.length = 0;
  await repo.overview();
  const bootstrap = queries.find(({ sql }) => sql.includes('WITH active AS'));
  const bootstrapPlan = (
    await db.client.execute({
      ...bootstrap,
      sql: 'EXPLAIN QUERY PLAN ' + bootstrap.sql,
    })
  ).rows
    .map((r) => (typeof r.detail === 'string' ? r.detail : ''))
    .join('\n');
  assert.match(bootstrapPlan, /jobs_workspace_active_created_id/);
  assert.match(bootstrapPlan, /jobs_workspace_created_id/);
  assert.match(
    bootstrapPlan,
    /SEARCH j USING INDEX sqlite_autoindex_analysis_jobs_1 \(id=\?\)/,
  );
  assert.doesNotMatch(bootstrapPlan, /SEARCH j USING INDEX jobs_workspace/);
  assert.doesNotMatch(bootstrap.sql, /payload_json|requested_by|request_key/);
});
