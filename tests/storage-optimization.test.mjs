import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createDatabase } from '../server/database.ts';
import { migrate } from '../scripts/migrate-local.mjs';
import { Repository } from '../server/repository.ts';
import { storageUsage } from '../server/storage.ts';

async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), 'consultiq-storage-'));
  const db = await createDatabase({
    DATABASE_URL: pathToFileURL(join(dir, 'test.db')).href,
  });
  t.after(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });
  await migrate(db.client);
  const repo = await Repository.forUser(db, 'owner');
  const other = await Repository.forUser(db, 'other');
  const add = (body, title = 'Approved synthetic source', scope = repo) =>
    scope.addDocument({ title, body, approved: true });
  const count = async (table) =>
    Number(
      (
        await repo
          .statement(
            `SELECT COUNT(*) AS n FROM ${table} WHERE workspace_id=?`,
            repo.workspaceId,
          )
          .first()
      ).n,
    );
  return { db, repo, other, add, count };
}

test('library prevents simultaneous duplicate content, trims before hashing and scopes uniqueness', async (t) => {
  const { repo, other, add, count } = await setup(t);
  const body = 'A synthetic approved library passage. café 🙂';
  const results = await Promise.allSettled([
    add(`  ${body}\n`, 'First title'),
    add(body, 'Second title'),
  ]);
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
  const rejected = results.find((x) => x.status === 'rejected').reason;
  assert.equal(rejected.status, 409);
  assert.equal(rejected.code, 'duplicate_document');
  assert.equal(await count('knowledge_documents'), 1);
  assert.equal(await count('knowledge_chunks'), 1);
  assert.equal(await count('audit_events'), 1);
  const original = await repo
    .statement(
      'SELECT id,title,body_sha256 FROM knowledge_documents WHERE workspace_id=?',
      repo.workspaceId,
    )
    .first();
  assert.equal(
    original.body_sha256,
    createHash('sha256').update(body).digest('hex'),
  );
  await add(body, 'Other workspace', other);
  await assert.rejects(add(body, 'Renamed'), { code: 'duplicate_document' });
  assert.deepEqual(
    await repo
      .statement(
        'SELECT id,title,body_sha256 FROM knowledge_documents WHERE workspace_id=?',
        repo.workspaceId,
      )
      .first(),
    original,
  );
});

test('legacy documents with null hashes block exact duplicates without rewriting old sources', async (t) => {
  const { repo, add, count } = await setup(t);
  await repo
    .statement(
      'INSERT INTO knowledge_documents(id,workspace_id,title,body,created_at) VALUES (?,?,?,?,?)',
      'legacy-a',
      repo.workspaceId,
      'First legacy title',
      'Legacy source',
      '2026-09-22',
    )
    .run();
  await repo
    .statement(
      'INSERT INTO knowledge_documents(id,workspace_id,title,body,created_at) VALUES (?,?,?,?,?)',
      'legacy-b',
      repo.workspaceId,
      'Second legacy title',
      'Legacy source',
      '2026-09-22',
    )
    .run();
  await assert.rejects(add('  Legacy source\n'), {
    code: 'duplicate_document',
    status: 409,
  });
  assert.equal(await count('knowledge_documents'), 2);
  assert.equal(await count('knowledge_chunks'), 0);
  assert.equal(await count('audit_events'), 0);
  const rows = (
    await repo
      .statement(
        'SELECT id,body_sha256 FROM knowledge_documents WHERE workspace_id=? ORDER BY id',
        repo.workspaceId,
      )
      .all()
  ).results;
  assert.deepEqual(rows, [
    { id: 'legacy-a', body_sha256: null },
    { id: 'legacy-b', body_sha256: null },
  ]);
});

test('atomic library admission preserves the fifty-document limit under concurrent requests', async (t) => {
  const { repo, add, count } = await setup(t);
  await repo.db.batch(
    Array.from({ length: 49 }, (_, i) =>
      repo.statement(
        'INSERT INTO knowledge_documents(id,workspace_id,title,body,created_at) VALUES (?,?,?,?,?)',
        `legacy-${i}`,
        repo.workspaceId,
        'Synthetic fixture',
        `Unique ${i}`,
        '2026-09-22',
      ),
    ),
  );
  const results = await Promise.allSettled([
    add('New unique source A'),
    add('New unique source B'),
  ]);
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(
    results.find((x) => x.status === 'rejected').reason.code,
    'library_limit',
  );
  assert.equal(await count('knowledge_documents'), 50);
  assert.equal(await count('knowledge_chunks'), 1);
  assert.equal(await count('audit_events'), 1);
});

test('a failing chunk write rolls back document, fingerprint and audit together', async (t) => {
  const { db, add, count } = await setup(t);
  await db
    .prepare(
      "CREATE TRIGGER fail_chunk BEFORE INSERT ON knowledge_chunks BEGIN SELECT RAISE(ABORT,'synthetic failure'); END",
    )
    .run();
  await assert.rejects(add('Synthetic content requiring a chunk'));
  assert.equal(await count('knowledge_documents'), 0);
  assert.equal(await count('knowledge_chunks'), 0);
  assert.equal(await count('audit_events'), 0);
  await db.prepare('DROP TRIGGER fail_chunk').run();
  await add('Synthetic content requiring a chunk');
  assert.equal(await count('knowledge_documents'), 1);
});

test('storage inventory covers all schema text fields, counts UTF-8 and returns only scoped aggregates', async (t) => {
  const { db, repo, other, add } = await setup(t);
  await add('Synthetic approved source: café, 漢字 and 🙂', 'Unicode fixture');
  await add('Other workspace secret '.repeat(100), 'Private title', other);
  await repo.renameWorkspace('Équipe 🙂');
  let inventoryQuery;
  const statement = repo.statement.bind(repo);
  repo.statement = (sql, ...args) => {
    inventoryQuery = sql;
    return statement(sql, ...args);
  };
  const usage = await storageUsage(repo);
  repo.statement = statement;
  const tables = (
    await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='consultiq_migrations'",
      )
      .all()
  ).results
    .map((r) => String(r.name))
    .sort((a, b) => a.localeCompare(b));
  assert.deepEqual(
    usage.tables.map((r) => r.table).sort((a, b) => a.localeCompare(b)),
    tables,
  );
  let expectedRecords = 0,
    expectedBytes = 0;
  for (const table of tables) {
    const columns = (
      await db.prepare(`PRAGMA table_info(${table})`).all()
    ).results
      .filter((r) => String(r.type).toLowerCase() === 'text')
      .map((r) => String(r.name));
    const branch = inventoryQuery
      .split(' UNION ALL ')
      .find((sql) => sql.includes(`FROM ${table} WHERE`));
    for (const column of columns)
      assert.ok(
        branch.includes(`length(CAST(${column} AS BLOB))`),
        `${table}.${column} must be inventoried`,
      );
    const rows = (
      await repo
        .statement(
          `SELECT * FROM ${table} WHERE ${table === 'workspaces' ? 'id' : 'workspace_id'}=?`,
          repo.workspaceId,
        )
        .all()
    ).results;
    const bytes = rows.reduce(
      (sum, row) =>
        sum +
        columns.reduce(
          (n, column) =>
            n +
            (row[column] === null ? 0 : Buffer.byteLength(row[column], 'utf8')),
          0,
        ),
      0,
    );
    const reported = usage.tables.find((r) => r.table === table);
    assert.equal(reported.records, rows.length, table);
    assert.equal(reported.logical_text_bytes, bytes, table);
    assert.deepEqual(
      Object.keys(reported).sort((a, b) => a.localeCompare(b)),
      ['domain', 'logical_text_bytes', 'records', 'table'],
    );
    expectedRecords += rows.length;
    expectedBytes += bytes;
  }
  assert.equal(usage.total_records, expectedRecords);
  assert.equal(usage.logical_text_bytes, expectedBytes);
  assert.doesNotMatch(
    JSON.stringify(usage),
    /Other workspace secret|Private title|Synthetic approved|body_sha256|token_hash/,
  );
});

test('getCall reads only the latest revision and detail reads history once with the same tie-break', async (t) => {
  const { repo } = await setup(t);
  const call = await repo.createCall({
    title: 'Synthetic',
    coordinator: 'Fixture',
    source: 'synthetic',
    recorded_at: '2026-09-22',
    transcript: 'Coordinator: Hello.\nPatient: Hello.',
  });
  await repo
    .statement(
      'INSERT INTO rubrics(id,workspace_id,title,definitions,created_at) VALUES (?,?,?,?,?)',
      'rubric',
      repo.workspaceId,
      'Mechanical fixture',
      '[]',
      '2026-09-22',
    )
    .run();
  await repo.db.batch(
    Array.from({ length: 30 }, (_, i) =>
      repo.statement(
        'INSERT INTO assessments(id,workspace_id,call_id,rubric_id,kind,content,prompt_version,model,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        `assessment-${i}`,
        repo.workspaceId,
        call.id,
        'rubric',
        'human',
        JSON.stringify({ fixture: i }),
        'fixture',
        'human',
        '2026-09-22',
      ),
    ),
  );
  const queries = [];
  const original = repo.statement.bind(repo);
  repo.statement = (sql, ...args) => {
    queries.push(sql);
    return original(sql, ...args);
  };
  assert.equal((await repo.getCall(call.id)).latest.id, 'assessment-29');
  const latestQueries = queries.filter((sql) =>
    sql.includes('FROM assessments'),
  );
  assert.equal(latestQueries.length, 1);
  assert.match(latestQueries[0], /LIMIT 1$/);
  queries.length = 0;
  const detail = await repo.detail(call.id);
  assert.equal(detail.assessments.length, 30);
  assert.equal(detail.call.latest.id, detail.assessments[0].id);
  assert.equal(
    queries.filter((sql) => sql.includes('FROM assessments')).length,
    1,
  );
});
