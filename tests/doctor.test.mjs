import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { diagnose } from '../scripts/doctor.mjs';
import { createDatabase } from '../server/database.ts';
import { migrate } from '../scripts/migrate-local.mjs';
const auth = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'test-placeholder',
  CLERK_SECRET_KEY: 'secret-placeholder',
  CONSULTIQ_ALLOWED_USER_IDS: 'user_test',
};
test('diagnostic fails closed for missing setup and never prints credentials or driver errors', async () => {
  const missing = await diagnose({});
  assert.equal(missing.ok, false);
  const result = await diagnose(
    {
      ...auth,
      DATABASE_URL: 'libsql://private.turso.io',
      DATABASE_AUTH_TOKEN: 'secret-db',
    },
    {
      connect: async () => {
        throw new Error('secret-db private.turso.io');
      },
    },
  );
  assert.equal(result.ok, false);
  assert.doesNotMatch(
    JSON.stringify(result),
    /secret-placeholder|secret-db|private.turso.io/,
  );
});
test('diagnostic does not create a missing local database', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'consultiq-doctor-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'missing.db');
  const result = await diagnose({
    ...auth,
    DATABASE_URL: pathToFileURL(file).href,
  });
  assert.equal(result.ok, false);
  await assert.rejects(readFile(file), { code: 'ENOENT' });
});
test('diagnostic detects missing and changed migration history without modifying records', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'consultiq-doctor-'));
  const env = {
    ...auth,
    DATABASE_URL: pathToFileURL(join(directory, 'test.db')).href,
  };
  const db = await createDatabase(env);
  t.after(async () => {
    db.close();
    await rm(directory, { recursive: true, force: true });
  });
  let report = await diagnose(env);
  assert.equal(report.ok, false);
  assert.match(
    report.checks.find((x) => x.name === 'migrations').message,
    /missing/,
  );
  await migrate(db.client);
  report = await diagnose(env);
  assert.equal(report.ok, true);
  assert.equal(
    report.checks.find((x) => x.name === 'optional-ai').status,
    'warn',
  );
  assert.equal(
    (await db.prepare('SELECT COUNT(*) AS count FROM workspaces').first())
      .count,
    0,
  );
  await db
    .prepare(
      "UPDATE consultiq_migrations SET checksum='changed' WHERE position=0",
    )
    .run();
  report = await diagnose(env);
  assert.equal(report.ok, false);
  assert.equal(
    (
      await db
        .prepare('SELECT checksum FROM consultiq_migrations WHERE position=0')
        .first()
    ).checksum,
    'changed',
  );
});
