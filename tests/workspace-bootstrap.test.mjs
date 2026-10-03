import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase } from '../server/database.ts';
import { migrate } from '../scripts/migrate-local.mjs';
import { Repository } from '../server/repository.ts';
import { handleApi } from '../server/handler.ts';

const when = '2026-10-03T10:00:00.000Z';
async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), 'consultiq-bootstrap-'));
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
  const api = (user, path, workspace = repo.workspaceId) =>
    handleApi(
      new Request(`https://app.test/api/${path}`, {
        headers: { 'X-Workspace-Id': workspace },
      }),
      { DB: db },
      undefined,
      user,
    );
  return { db, repo, other, api };
}

test('malformed run measurements cannot break workspace bootstrap or expose extra telemetry fields', async (t) => {
  const { repo, api } = await setup(t);
  const call = await repo.createCall({
    title: 'Synthetic measurement recovery',
    coordinator: 'Fixture',
    source: 'synthetic',
    recorded_at: '2026-10-02',
    transcript: 'Coordinator: Would Thursday work?\nPatient: Thursday is fine.',
  });
  const valid = {
    schema_version: 1,
    total_ms: 20,
    model_ms: 15,
    validation_save_ms: 4,
    input_tokens: 10,
    output_tokens: null,
  };
  const fixtures = [
    ['bad-json', '{truncated'],
    ['wrong-schema', '{"schema_version":8}'],
    ['invalid-number', JSON.stringify({ ...valid, total_ms: -1 })],
    [
      'allowlisted',
      JSON.stringify({
        ...valid,
        private_prompt: 'PRIVATE_TELEMETRY_SENTINEL',
      }),
    ],
  ];
  for (const [id, raw] of fixtures) {
    await repo
      .statement(
        'INSERT INTO analysis_jobs(id,workspace_id,call_id,kind,status,created_at,telemetry_json) VALUES(?,?,?,?,?,?,?)',
        id,
        repo.workspaceId,
        call.id,
        'scoring',
        'completed',
        when,
        raw,
      )
      .run();
  }
  const response = await api('user_owner', 'workspace');
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.jobs.length, 4);
  for (const job of data.jobs) {
    assert.deepEqual(job.telemetry, job.id === 'allowlisted' ? valid : null);
  }
  assert.doesNotMatch(
    JSON.stringify(data),
    /PRIVATE_TELEMETRY_SENTINEL|private_prompt/,
  );
});

test('bootstrap is bounded metadata beyond 200 calls with stable ID ordering and latest review identities', async (t) => {
  const { db, repo } = await setup(t);
  await repo
    .statement(
      'INSERT INTO rubrics (id,workspace_id,title,definitions,created_at) VALUES (?,?,?,?,?)',
      'rubric',
      repo.workspaceId,
      'Mechanical test fixture',
      '[]',
      when,
    )
    .run();
  const transcript = JSON.stringify([
    {
      role: 'Coordinator',
      text: 'PRIVATE_TRANSCRIPT_SENTINEL ' + 'x'.repeat(8000),
      time: '',
    },
  ]);
  const assessmentContent = JSON.stringify({
    dimensions: [
      {
        dimension: 0,
        score: null,
        rationale: 'PRIVATE_ASSESSMENT_SENTINEL ' + 'y'.repeat(8000),
        evidence: [],
        unsupported: true,
      },
    ],
    supported_count: 0,
    average: null,
  });
  for (let offset = 0; offset < 237; offset += 50) {
    const statements = [];
    for (let i = offset; i < Math.min(offset + 50, 237); i++) {
      statements.push(
        repo.statement(
          'INSERT INTO consultations (id,workspace_id,title,coordinator,source,outcome,turns,recorded_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
          `call-${i}`,
          repo.workspaceId,
          `Role-play ${i}`,
          'Fixture coordinator',
          'synthetic',
          'unknown',
          transcript,
          '2026-10-03',
          when,
        ),
      );
      statements.push(
        repo.statement(
          'INSERT INTO assessments (id,workspace_id,call_id,rubric_id,kind,content,prompt_version,model,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
          `assessment-${i}`,
          repo.workspaceId,
          `call-${i}`,
          'rubric',
          'ai',
          assessmentContent,
          'test',
          'test',
          when,
        ),
      );
    }
    await db.batch(statements);
  }
  await repo
    .statement(
      'INSERT INTO assessments (id,workspace_id,call_id,rubric_id,kind,content,prompt_version,model,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      'human-latest',
      repo.workspaceId,
      'call-236',
      'rubric',
      'human',
      assessmentContent,
      'test',
      'test',
      when,
    )
    .run();
  const statements = [];
  const original = repo.statement.bind(repo);
  repo.statement = (sql, ...values) => {
    statements.push(sql);
    return original(sql, ...values);
  };
  const overview = await repo.overview();
  assert.equal(overview.total, 237);
  assert.equal(overview.calls.length, 200);
  assert.deepEqual(
    overview.calls.map((call) => call.id),
    Array.from({ length: 237 }, (_, i) => `call-${i}`)
      .sort()
      .reverse()
      .slice(0, 200),
  );
  assert.deepEqual(
    overview.calls.find((call) => call.id === 'call-236').latest,
    {
      id: 'human-latest',
      kind: 'human',
      rubric_id: 'rubric',
      created_at: when,
    },
  );
  assert.equal(overview.calls[0].coordinator, 'Fixture coordinator');
  assert.equal(overview.calls[0].recorded_at, '2026-10-03');
  for (const call of overview.calls) {
    assert.equal('turns' in call, false);
    assert.equal('content' in call.latest, false);
  }
  const serialized = JSON.stringify(overview);
  assert.doesNotMatch(
    serialized,
    /PRIVATE_TRANSCRIPT_SENTINEL|PRIVATE_ASSESSMENT_SENTINEL/,
  );
  assert.ok(
    Buffer.byteLength(serialized) < 150000,
    'Bootstrap must not transfer full transcript/assessment payloads',
  );
  assert.equal(
    statements.filter((sql) => /\bFROM assessments\b/.test(sql)).length,
    1,
    'Only the bounded call query may read assessment identity',
  );
  assert.doesNotMatch(statements.join('\n'), /\ba\.\*|\ba\.content|\bturns\b/);
});

test('bootstrap document previews are bounded while scoped full document reads preserve original content', async (t) => {
  const { repo, other, api } = await setup(t);
  const body = 'Allowed preview '.repeat(20) + 'PRIVATE_DOCUMENT_TAIL_SENTINEL';
  const doc = await repo.addDocument({
    title: 'Scoped guidance',
    body,
    approved: true,
  });
  const privateDoc = await other.addDocument({
    title: 'OTHER_WORKSPACE_TITLE',
    approved: true,
    body: 'OTHER_WORKSPACE_BODY',
  });
  const overview = await repo.overview();
  assert.equal(overview.documents.length, 1);
  const summary = overview.documents[0];
  assert.deepEqual(Object.keys(summary).sort(), [
    'characters',
    'created_at',
    'id',
    'preview',
    'title',
  ]);
  assert.equal(summary.preview, body.slice(0, 170));
  assert.equal(summary.characters, body.length);
  assert.equal('body' in summary, false);
  assert.doesNotMatch(
    JSON.stringify(overview),
    /PRIVATE_DOCUMENT_TAIL_SENTINEL|OTHER_WORKSPACE/,
  );
  assert.equal((await repo.document(doc.id)).body, body);
  await assert.rejects(repo.document(privateDoc.id), {
    status: 404,
    code: 'not_found',
  });
  await assert.rejects(other.document(doc.id), {
    status: 404,
    code: 'not_found',
  });
  let response = await api('user_owner', `library/${doc.id}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal((await response.json()).body, body);
  response = await api('user_owner', `library/${privateDoc.id}`);
  assert.equal(response.status, 404);
  assert.doesNotMatch(await response.text(), /OTHER_WORKSPACE/);
  assert.equal((await api(null, `library/${doc.id}`)).status, 401);
  assert.equal((await api('user_other', `library/${doc.id}`)).status, 403);
  await repo.deleteDocument(doc.id);
  assert.equal((await api('user_owner', `library/${doc.id}`)).status, 404);
});

test('empty and unreviewed metadata stay distinct and foreign records are absent from bootstrap', async (t) => {
  const { repo, other } = await setup(t);
  const payload = {
    title: 'Role-play',
    coordinator: 'Fixture',
    source: 'synthetic',
    recorded_at: '2026-10-03',
    transcript: 'Coordinator: PRIVATE_SOURCE_TEXT\nPatient: Understood.',
  };
  const ours = await repo.createCall(payload);
  await other.createCall({ ...payload, title: 'OTHER_WORKSPACE_CALL' });
  const overview = await repo.overview();
  assert.equal(overview.calls.length, 1);
  assert.equal(overview.calls[0].id, ours.id);
  assert.equal(overview.calls[0].latest, null);
  assert.equal(overview.total, 1);
  assert.doesNotMatch(
    JSON.stringify(overview),
    /PRIVATE_SOURCE_TEXT|OTHER_WORKSPACE_CALL/,
  );
  const detail = await repo.detail(ours.id);
  assert.equal(
    detail.call.turns[0].text,
    'PRIVATE_SOURCE_TEXT',
    'Full consultation content stays available through the scoped detail workflow',
  );
});
