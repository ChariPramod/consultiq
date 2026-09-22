import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, cp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase, databaseConfig } from '../server/database.ts';
import { migrate } from '../scripts/migrate-local.mjs';

async function database(t) {
  const directory = await mkdtemp(join(tmpdir(), 'consultiq-libsql-'));
  const env = { DATABASE_URL: pathToFileURL(join(directory, 'test.db')).href };
  const db = await createDatabase(env);
  t.after(async () => {
    db.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { db, directory, env };
}

test('database configuration fails closed without durable authenticated storage', () => {
  assert.throws(() => databaseConfig({}), /DATABASE_URL/);
  assert.throws(
    () => databaseConfig({ DATABASE_URL: 'file:/tmp/test.db', VERCEL: '1' }),
    /Vercel/,
  );
  assert.throws(
    () => databaseConfig({ DATABASE_URL: 'file::memory:' }),
    /persistent/,
  );
  assert.throws(
    () => databaseConfig({ DATABASE_URL: 'libsql://example.turso.io' }),
    /AUTH_TOKEN/,
  );
  assert.throws(
    () =>
      databaseConfig({
        DATABASE_URL: 'http://example.test',
        DATABASE_AUTH_TOKEN: 'test',
      }),
    /HTTPS/,
  );
  assert.throws(
    () =>
      databaseConfig({
        DATABASE_URL: 'https://example.test?authToken=secret',
        DATABASE_AUTH_TOKEN: 'test',
      }),
    /embedded/,
  );
  assert.equal(
    databaseConfig({
      DATABASE_URL: 'libsql://example.turso.io',
      DATABASE_AUTH_TOKEN: 'test',
      VERCEL: '1',
    }).url,
    'libsql://example.turso.io',
  );
});

test('adapter batches rollback on a later failure and preserve changes-gated audits', async (t) => {
  const { db } = await database(t);
  await db.prepare('CREATE TABLE items (id TEXT PRIMARY KEY)').run();
  await db.prepare('CREATE TABLE audit (id TEXT PRIMARY KEY)').run();
  await assert.rejects(
    db.batch([
      db.prepare('INSERT INTO items VALUES (?)').bind('rollback'),
      db.prepare('INSERT INTO missing_table VALUES (?)').bind('failure'),
    ]),
  );
  assert.equal(await db.prepare('SELECT * FROM items').first(), null);
  const success = await db.batch([
    db.prepare('INSERT INTO items VALUES (?)').bind('saved'),
    db.prepare('INSERT INTO audit SELECT ? WHERE changes()=1').bind('saved'),
  ]);
  assert.deepEqual(
    success.map((result) => result.meta.changes),
    [1, 1],
  );
  const replay = await db.batch([
    db.prepare('INSERT OR IGNORE INTO items VALUES (?)').bind('saved'),
    db
      .prepare('INSERT INTO audit SELECT ? WHERE changes()=1')
      .bind('should-not-exist'),
  ]);
  assert.deepEqual(
    replay.map((result) => result.meta.changes),
    [0, 0],
  );
  assert.deepEqual((await db.prepare('SELECT id FROM audit').all()).results, [
    { id: 'saved' },
  ]);
});

test('real migration schema enforces foreign keys and cascades across persistent reopen', async (t) => {
  const { db, env } = await database(t);
  assert.deepEqual(await migrate(db.client), { applied: 3, total: 3 });
  assert.deepEqual(await migrate(db.client), { applied: 0, total: 3 });
  await db
    .prepare('INSERT INTO workspaces VALUES (?,?,?,?)')
    .bind('workspace', 'owner', 'Private', '2026-09-22')
    .run();
  const insert = db.prepare(
    'INSERT INTO consultations (id,workspace_id,title,coordinator,source,outcome,turns,recorded_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
  );
  await assert.rejects(
    insert
      .bind(
        'orphan',
        'missing',
        'Call',
        'Owner',
        'synthetic',
        'unknown',
        '[]',
        '2026-09-22',
        '2026-09-22',
      )
      .run(),
  );
  await insert
    .bind(
      'call',
      'workspace',
      'Call',
      'Owner',
      'synthetic',
      'unknown',
      '[]',
      '2026-09-22',
      '2026-09-22',
    )
    .run();
  const reopened = await createDatabase(env);
  try {
    assert.equal(
      (await reopened.prepare('SELECT id FROM consultations').first()).id,
      'call',
    );
    await reopened
      .prepare('DELETE FROM workspaces WHERE id=?')
      .bind('workspace')
      .run();
    assert.equal(
      await reopened.prepare('SELECT id FROM consultations').first(),
      null,
    );
  } finally {
    reopened.close();
  }
});

test('migration drift and a failing new migration leave schema and ledger intact', async (t) => {
  const { db, directory } = await database(t);
  const migrations = join(directory, 'migrations');
  await cp(resolve('drizzle'), migrations, { recursive: true });
  await migrate(db.client, migrations);
  const journalPath = join(migrations, 'meta/_journal.json');
  const journal = JSON.parse(await readFile(journalPath, 'utf8'));
  const originalPath = join(migrations, `${journal.entries[0].tag}.sql`);
  const original = await readFile(originalPath, 'utf8');
  await writeFile(originalPath, `${original}\n-- changed history`);
  await assert.rejects(migrate(db.client, migrations), /history differs/);
  await writeFile(originalPath, original);
  journal.entries.push({ idx: 3, tag: '0003_test_failure' });
  await writeFile(journalPath, JSON.stringify(journal));
  await writeFile(
    join(migrations, '0003_test_failure.sql'),
    'CREATE TABLE rollback_test(id TEXT);\n--> statement-breakpoint\nINSERT INTO absent_table VALUES (1);',
  );
  await assert.rejects(migrate(db.client, migrations));
  assert.equal(
    await db
      .prepare("SELECT name FROM sqlite_master WHERE name='rollback_test'")
      .first(),
    null,
  );
  assert.equal(
    (
      await db
        .prepare('SELECT COUNT(*) AS count FROM consultiq_migrations')
        .first()
    ).count,
    3,
  );
});
