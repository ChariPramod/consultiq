import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';
import { databaseConfig } from '../server/database.ts';

/** A write transaction serializes concurrent deploys and commits schema + ledger together. */
export async function migrate(client, directory = resolve('drizzle')) {
  const journal = JSON.parse(
    await readFile(resolve(directory, 'meta/_journal.json'), 'utf8'),
  );
  const entries = journal.entries;
  if (
    journal.dialect !== 'sqlite' ||
    !Array.isArray(entries) ||
    entries.some(
      (entry, index) =>
        entry.idx !== index || !/^\d{4}_[a-z0-9_]+$/.test(entry.tag),
    )
  ) {
    throw new Error('Invalid migration journal.');
  }
  const expected = entries.map((entry) => `${entry.tag}.sql`);
  const actual = (await readdir(directory)).filter((file) =>
    file.endsWith('.sql'),
  );
  if (
    actual.length !== expected.length ||
    actual.some((file) => !expected.includes(file))
  ) {
    throw new Error('Migration files do not match the journal.');
  }
  const migrations = await Promise.all(
    expected.map(async (name, position) => {
      const source = await readFile(resolve(directory, name), 'utf8');
      return {
        name,
        position,
        hash: createHash('sha256').update(source).digest('hex'),
        statements: source
          .split('--> statement-breakpoint')
          .map((sql) => sql.trim())
          .filter(Boolean),
      };
    }),
  );
  const tx = await client.transaction('write');
  try {
    const foreignKeys = await tx.execute('PRAGMA foreign_keys');
    if (Number(foreignKeys.rows[0]?.foreign_keys) !== 1)
      throw new Error('Database foreign-key enforcement is required.');
    await tx.execute(
      'CREATE TABLE IF NOT EXISTS consultiq_migrations (position INTEGER PRIMARY KEY NOT NULL, name TEXT UNIQUE NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)',
    );
    const applied = (
      await tx.execute(
        'SELECT position,name,checksum FROM consultiq_migrations ORDER BY position',
      )
    ).rows;
    if (
      applied.length > migrations.length ||
      applied.some(
        (row, index) =>
          row.position !== index ||
          row.name !== migrations[index]?.name ||
          row.checksum !== migrations[index]?.hash,
      )
    ) {
      throw new Error(
        'Applied migration history differs from this checkout. Restore the original migrations before continuing.',
      );
    }
    for (const migration of migrations.slice(applied.length)) {
      for (const sql of migration.statements) await tx.execute(sql);
      await tx.execute({
        sql: 'INSERT INTO consultiq_migrations(position,name,checksum,applied_at) VALUES (?,?,?,?)',
        args: [
          migration.position,
          migration.name,
          migration.hash,
          new Date().toISOString(),
        ],
      });
    }
    await tx.commit();
    return {
      applied: migrations.length - applied.length,
      total: migrations.length,
    };
  } catch (error) {
    if (!tx.closed) await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  let client;
  try {
    // Node does not load .env.local automatically. The package command loads it explicitly.
    client = createClient(databaseConfig(process.env));
    const result = await migrate(client);
    console.log(
      `Applied ${result.applied} migration(s); ${result.total} verified.`,
    );
  } catch {
    // Provider errors may contain connection details; do not print them to deployment logs.
    console.error(
      'Database migration failed. Verify database configuration, connectivity, and unchanged migration history. No pending migration transaction was committed.',
    );
    process.exitCode = 1;
  } finally {
    client?.close();
  }
}
