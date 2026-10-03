import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase } from '../server/database.ts';
import { migrate } from '../scripts/migrate-local.mjs';
import { Repository } from '../server/repository.ts';
import { queryJobs } from '../server/job-query.ts';

const time = '2026-10-01T10:00:00.000Z';
const validTelemetry = {
  schema_version: 1,
  total_ms: 52.5,
  model_ms: 40,
  validation_save_ms: 10,
  input_tokens: 101,
  output_tokens: 25,
};
async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), 'consultiq-job-query-'));
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
  const call = async (scope, id, title = id) => {
    await scope
      .statement(
        'INSERT INTO consultations (id,workspace_id,title,coordinator,source,outcome,turns,recorded_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        id,
        scope.workspaceId,
        title,
        'Private coordinator',
        'synthetic',
        'unknown',
        '[{"role":"Coordinator","text":"Private transcript body","time":"00:00"}]',
        '2026-10-01',
        time,
      )
      .run();
    return id;
  };
  const job = async (scope, id, callId, options = {}) => {
    await scope
      .statement(
        'INSERT INTO analysis_jobs (id,workspace_id,call_id,kind,status,error_code,telemetry_json,created_at,requested_by,payload_json,request_key) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        id,
        scope.workspaceId,
        callId,
        options.kind ?? 'scoring',
        options.status ?? 'completed',
        options.error_code ?? null,
        options.telemetry === undefined ? null : options.telemetry,
        options.created_at ?? time,
        options.requested_by ?? 'owner',
        '{"question":"Private coaching question","transcript":"Private payload body"}',
        `private-request-${id}`,
      )
      .run();
    return id;
  };
  const query = (params = {}, scope = repo, role = 'owner') =>
    queryJobs(scope, new URLSearchParams(params), role);
  return { db, repo, other, call, job, query };
}

test('all workspace analysis history beyond bootstrap is paginated without duplicate rows or private bodies', async (t) => {
  const { repo, call, job, query } = await setup(t);
  await call(repo, 'consultation', 'Earlier role-play');
  for (let i = 0; i < 211; i++)
    await job(repo, `job-${String(i).padStart(3, '0')}`, 'consultation');
  const seen = [];
  let cursor;
  do {
    const page = await query({ limit: '50', ...(cursor ? { cursor } : {}) });
    assert.ok(page.jobs.length <= 50);
    assert.equal(page.has_more, page.next_cursor !== null);
    seen.push(...page.jobs.map((item) => item.id));
    assert.doesNotMatch(
      JSON.stringify(page),
      /Private transcript|Private coaching|Private payload|Private coordinator|private-request/,
    );
    cursor = page.next_cursor;
  } while (cursor);
  assert.equal(seen.length, 211);
  assert.equal(new Set(seen).size, 211);
  assert.equal(seen[0], 'job-210');
  assert.equal(seen.at(-1), 'job-000');
  const first = await query({ limit: '1' });
  assert.deepEqual(Object.keys(first.jobs[0]).sort(), [
    'call_id',
    'can_cancel',
    'consultation_title',
    'created_at',
    'error_code',
    'id',
    'kind',
    'status',
    'telemetry',
  ]);
  await job(repo, 'newer-job', 'consultation', {
    created_at: '2026-10-02T10:00:00.000Z',
  });
  const second = await query({ limit: '1', cursor: first.next_cursor });
  assert.equal(second.jobs[0].id, 'job-209');
  assert.equal((await query()).jobs[0].id, 'newer-job');
});

test('workspace and consultation joins are scoped and consultation deletion removes history', async (t) => {
  const { repo, other, call, job, query } = await setup(t);
  await call(repo, 'own');
  await call(other, 'foreign', 'Foreign consultation secret');
  await job(repo, 'owned-job', 'own');
  await job(other, 'foreign-job', 'foreign');
  await job(repo, 'cross-scope-reference', 'foreign');
  assert.deepEqual(
    (await query()).jobs.map((item) => item.id),
    ['owned-job'],
  );
  assert.deepEqual(
    (await query({}, other)).jobs.map((item) => item.id),
    ['foreign-job'],
  );
  await repo
    .statement(
      'DELETE FROM consultations WHERE workspace_id=? AND id=?',
      repo.workspaceId,
      'own',
    )
    .run();
  assert.deepEqual((await query()).jobs, []);
});

test('status, kind and literal title filters search all history and bind cursor scope', async (t) => {
  const { repo, other, call, job, query } = await setup(t);
  for (const [id, title] of [
    ['percent', '100% complete'],
    ['plain', '1000 complete'],
    ['underscore', 'a_b'],
    ['wildcard', 'aXb'],
    ['slash', 'a\\b'],
  ]) {
    await call(repo, id, title);
    await job(repo, `job-${id}`, id, {
      status: id === 'percent' ? 'failed' : 'completed',
      kind: id === 'percent' ? 'coaching' : 'scoring',
    });
  }
  assert.deepEqual(
    (await query({ q: ' % ' })).jobs.map((item) => item.id),
    ['job-percent'],
  );
  assert.deepEqual(
    (await query({ q: '_' })).jobs.map((item) => item.id),
    ['job-underscore'],
  );
  assert.deepEqual(
    (await query({ q: '\\' })).jobs.map((item) => item.id),
    ['job-slash'],
  );
  assert.equal((await query({ q: "' OR 1=1 --" })).jobs.length, 0);
  assert.equal(
    (await query({ status: 'failed', kind: 'coaching' })).jobs[0].id,
    'job-percent',
  );
  assert.equal(
    (await query({ status: 'failed', kind: 'scoring' })).jobs.length,
    0,
  );
  const first = await query({ limit: '1' });
  for (const params of [
    { q: 'a' },
    { status: 'failed' },
    { kind: 'coaching' },
  ]) {
    await assert.rejects(
      query({ ...params, cursor: first.next_cursor }),
      (error) => error.status === 422,
    );
  }
  await assert.rejects(
    query({ cursor: first.next_cursor }, other),
    (error) => error.status === 422,
  );
  // Limits may change while retaining the same filter scope.
  assert.equal(
    (await query({ limit: '2', cursor: first.next_cursor })).jobs.length,
    2,
  );
});

test('query rejects invalid filters, duplicate keys and malformed cursors', async (t) => {
  const { repo, call, job, query } = await setup(t);
  assert.equal((await query()).limit, 25);
  for (const params of [
    { limit: '0' },
    { limit: '51' },
    { limit: '01' },
    { limit: '1.5' },
    { limit: '1e1' },
    { status: 'pending' },
    { kind: 'transcription' },
    { q: 'x'.repeat(201) },
    { cursor: '' },
    { cursor: 'invalid' },
    { cursor: 'x'.repeat(8193) },
  ])
    await assert.rejects(
      query(params),
      (error) => error.status === 422 && error.code === 'invalid_query',
    );
  for (const key of ['q', 'status', 'kind', 'limit', 'cursor']) {
    await assert.rejects(
      queryJobs(repo, new URLSearchParams(`${key}=1&${key}=2`), 'owner'),
      (error) => error.status === 422,
    );
  }
  await call(repo, 'call');
  await job(repo, 'a', 'call');
  await job(repo, 'b', 'call');
  const first = await query({ limit: '1' });
  for (const override of [
    { created_at: '2026-10-01' },
    { created_at: 'not-a-date' },
    { id: '' },
    { id: 'x'.repeat(101) },
    { version: 2 },
  ]) {
    const parsed = JSON.parse(
      Buffer.from(first.next_cursor, 'base64url').toString('utf8'),
    );
    await assert.rejects(
      query({
        cursor: Buffer.from(
          JSON.stringify({ ...parsed, ...override }),
        ).toString('base64url'),
      }),
      (error) => error.status === 422,
    );
  }
});

test('telemetry is explicitly projected; malformed and legacy telemetry cannot leak arbitrary JSON', async (t) => {
  const { repo, call, job, query } = await setup(t);
  await call(repo, 'call');
  await job(repo, 'valid', 'call', {
    telemetry: JSON.stringify({
      ...validTelemetry,
      transcript: 'Private injected body',
      provider: { message: 'Private provider body' },
    }),
  });
  const invalid = [
    '{',
    'null',
    '[]',
    JSON.stringify({ total_ms: 5 }),
    JSON.stringify({ ...validTelemetry, schema_version: 2 }),
    JSON.stringify({ ...validTelemetry, total_ms: -1 }),
    JSON.stringify({ ...validTelemetry, model_ms: '20' }),
    JSON.stringify({ ...validTelemetry, input_tokens: 1.5 }),
    JSON.stringify({ ...validTelemetry, output_tokens: -1 }),
    JSON.stringify({
      ...validTelemetry,
      output_tokens: Number.MAX_SAFE_INTEGER + 1,
    }),
    JSON.stringify({ ...validTelemetry, private: 'x'.repeat(4096) }),
  ];
  for (const [index, value] of invalid.entries())
    await job(repo, `invalid-${index}`, 'call', { telemetry: value });
  await job(repo, 'error-raw', 'call', {
    status: 'failed',
    error_code: 'Provider: Private raw error body',
  });
  await job(repo, 'error-code', 'call', {
    status: 'failed',
    error_code: 'provider_unavailable',
  });
  const page = await query();
  assert.deepEqual(
    page.jobs.find((item) => item.id === 'valid').telemetry,
    validTelemetry,
  );
  for (const item of page.jobs.filter((item) => item.id.startsWith('invalid')))
    assert.equal(item.telemetry, null);
  assert.equal(
    page.jobs.find((item) => item.id === 'error-raw').error_code,
    null,
  );
  assert.equal(
    page.jobs.find((item) => item.id === 'error-code').error_code,
    'provider_unavailable',
  );
  assert.doesNotMatch(
    JSON.stringify(page),
    /Private injected|Private provider|Private raw/,
  );
});

test('cancellation affordances follow role, requester and active job state without exposing requester IDs', async (t) => {
  const { db, repo, call, job, query } = await setup(t);
  await call(repo, 'call');
  await job(repo, 'owner-active', 'call', { status: 'queued' });
  await job(repo, 'reviewer-active', 'call', {
    status: 'running',
    requested_by: 'reviewer',
  });
  await job(repo, 'reviewer-complete', 'call', { requested_by: 'reviewer' });
  const reviewer = new Repository(db, repo.workspaceId, 'reviewer');
  for (const role of ['owner', 'reviewer', 'viewer']) {
    const page = await query({}, reviewer, role);
    assert.equal(
      page.jobs.find((item) => item.id === 'owner-active').can_cancel,
      role === 'owner',
    );
    assert.equal(
      page.jobs.find((item) => item.id === 'reviewer-active').can_cancel,
      role !== 'viewer',
    );
    assert.equal(
      page.jobs.find((item) => item.id === 'reviewer-complete').can_cancel,
      false,
    );
    assert.ok(page.jobs.every((item) => !('requested_by' in item)));
  }
});
