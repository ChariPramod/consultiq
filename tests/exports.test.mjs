import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase } from '../server/database.ts';
import { migrate } from '../scripts/migrate-local.mjs';
import { Repository } from '../server/repository.ts';
import { exportCell, exportConsultation } from '../server/exports.ts';

async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), 'consultiq-export-'));
  const db = await createDatabase({
    DATABASE_URL: pathToFileURL(join(dir, 'app.db')).href,
  });
  t.after(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });
  await migrate(db.client);
  const repo = await Repository.forUser(db, 'owner');
  const call = await repo.createCall({
    title: '=HYPERLINK("invalid")',
    coordinator: 'Fixture',
    source: 'synthetic',
    recorded_at: '2026-10-02',
    transcript:
      'Coordinator: A fixture with "quotes", here.\nPatient: Agreed for this fixture.',
  });
  // Mechanical fixtures; these are not owner rubric anchors or quality benchmarks.
  const rubric = await repo.publishRubric({
    title: 'Mechanical fixture',
    approved: true,
    definitions: Array.from({ length: 8 }, (_, dimension) => ({
      dimension,
      one: 'Mechanical anchor one',
      three: 'Mechanical anchor three',
      five: 'Mechanical anchor five',
    })),
  });
  const first = await repo.saveAssessment(call.id, {
    rubric_id: rubric.id,
    dimensions: Array.from({ length: 8 }, (_, dimension) => ({
      dimension,
      score: dimension === 0 ? 3 : null,
      rationale: 'Mechanical rationale',
      coaching_note: 'Fixture only',
      evidence:
        dimension === 0
          ? [{ turn_index: 0, span: 'A fixture with "quotes", here.' }]
          : [],
    })),
  });
  return { db, repo, call, rubric, first };
}

test('CSV neutralizes formulas after whitespace and retains quoted multiline fields', () => {
  for (const value of [
    '=SUM(1,2)',
    '  =SUM(1,2)',
    '\uFEFF+2',
    '\n\t@thing',
    '-2',
    '\tplain',
  ])
    assert.equal(exportCell(value).startsWith('"\''), true, value);
  assert.equal(exportCell('hello,"world"\nnext'), '"hello,""world""\nnext"');
  assert.equal(exportCell(null), '""');
  assert.equal(exportCell(3), '"3"');
});

test('portable JSON includes saved evidence and historical rubric provenance without internal records', async (t) => {
  const { repo, call, rubric } = await setup(t);
  await repo.publishRubric({
    title: 'Newer mechanical fixture',
    approved: true,
    definitions: rubric.definitions,
  });
  const file = await exportConsultation(repo, call.id, 'json');
  const data = JSON.parse(file.content);
  assert.equal(data.schema_version, 1);
  assert.equal(data.consultation.turns.length, 2);
  assert.equal(data.assessment_revisions[0].rubric.id, rubric.id);
  assert.equal(
    data.assessment_revisions[0].content.dimensions[0].evidence[0].span,
    'A fixture with "quotes", here.',
  );
  assert.equal(data.assessment_revisions[0].content.dimensions[1].score, null);
  assert.equal(data.assessment_revisions[0].kind, 'human');
  assert.deepEqual(Object.keys(data).sort(), [
    'assessment_revisions',
    'consultation',
    'exported_at',
    'notes',
    'schema',
    'schema_version',
    'workspace_id',
  ]);
  assert.equal(file.filename, 'consultiq-consultation.json');
  const csv = await exportConsultation(repo, call.id, 'csv');
  assert.match(csv.content, /"transcript"/);
  assert.match(csv.content, /"evidence"/);
  assert.match(csv.content, /"rubric"/);
  assert.match(csv.content, /"'=HYPERLINK/);
});

test('exports reject cross-workspace IDs and unsupported formats', async (t) => {
  const { db, repo, call } = await setup(t);
  const other = await Repository.forUser(db, 'other');
  await assert.rejects(exportConsultation(other, call.id, 'json'), {
    status: 404,
  });
  await assert.rejects(exportConsultation(repo, call.id, 'xml'), {
    status: 422,
  });
});

test('exports fail rather than silently truncating revision history', async (t) => {
  const { db, repo, call, rubric } = await setup(t);
  const content = JSON.stringify({ dimensions: [] });
  for (let i = 0; i < 100; i++)
    await db
      .prepare(
        'INSERT INTO assessments (id,workspace_id,call_id,rubric_id,kind,content,prompt_version,model,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        `revision-${i}`,
        repo.workspaceId,
        call.id,
        rubric.id,
        'human',
        content,
        'fixture',
        'fixture',
        new Date().toISOString(),
      )
      .run();
  await assert.rejects(exportConsultation(repo, call.id, 'json'), {
    status: 413,
    code: 'export_too_large',
  });
});

test('oversized saved content is refused instead of exported incompletely', async (t) => {
  const { db, repo, call } = await setup(t);
  await db
    .prepare(
      'UPDATE assessments SET content=? WHERE workspace_id=? AND call_id=?',
    )
    .bind('x'.repeat(524289), repo.workspaceId, call.id)
    .run();
  await assert.rejects(exportConsultation(repo, call.id, 'json'), {
    status: 413,
  });
});

test('JSON transport envelope cannot exceed 3 MiB even when escaped download content fits', async (t) => {
  const { db, repo, call, rubric } = await setup(t);
  // Storage-boundary fixture deliberately uses repeated quote characters to
  // exercise transport escaping; it is not an assessment quality fixture.
  const content = JSON.stringify({
    dimensions: [
      {
        dimension: 0,
        score: null,
        rationale: '"'.repeat(140000),
        coaching_note: '',
        evidence: [],
      },
    ],
  });
  assert.ok(Buffer.byteLength(content) < 524288);
  const insert = async (i) =>
    db
      .prepare(
        'INSERT INTO assessments (id,workspace_id,call_id,rubric_id,kind,content,prompt_version,model,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        `escaped-${i}`,
        repo.workspaceId,
        call.id,
        rubric.id,
        'human',
        content,
        'fixture',
        'fixture',
        '2026-10-02T00:00:00.000Z',
      )
      .run();
  for (let i = 0; i < 4; i++) await insert(i);
  const small = await exportConsultation(repo, call.id, 'json');
  const bundle = JSON.parse(small.content);
  const fixture = bundle.assessment_revisions.find(
    (revision) => revision.id === 'escaped-0',
  );
  for (let i = 4; i < 9; i++) {
    await insert(i);
    bundle.assessment_revisions.push({ ...fixture, id: `escaped-${i}` });
  }
  const projectedContent = JSON.stringify(bundle, null, 2);
  assert.ok(
    Buffer.byteLength(projectedContent) < 3 * 1024 * 1024,
    'download itself fits',
  );
  assert.ok(
    Buffer.byteLength(JSON.stringify({ ...small, content: projectedContent })) >
      3 * 1024 * 1024,
    'escaped transport envelope does not fit',
  );
  for (const format of ['json', 'csv'])
    await assert.rejects(exportConsultation(repo, call.id, format), {
      status: 413,
      code: 'export_too_large',
    });
});
