import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createDatabase, databaseConfig } from '../server/database.ts';
import { readMigrations } from './migrate-local.mjs';

/** Operator-only diagnostic: no record reads, writes, provider calls or secret output. */
export async function diagnose(
  env,
  { connect = createDatabase, directory = resolve('drizzle') } = {},
) {
  const checks = [];
  const add = (name, status, message) => checks.push({ name, status, message });
  add(
    'authentication',
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
      env.CLERK_SECRET_KEY?.trim()
      ? 'pass'
      : 'fail',
    'Clerk publishable and secret keys must be present. Presence does not verify a live session.',
  );
  const ids =
    env.CONSULTIQ_ALLOWED_USER_IDS?.split(',')
      .map((id) => id.trim())
      .filter(Boolean) ?? [];
  add(
    'access',
    ids.length && ids.every((id) => /^user_[A-Za-z0-9]+$/.test(id))
      ? 'pass'
      : 'fail',
    'Set exact Clerk user IDs in CONSULTIQ_ALLOWED_USER_IDS; email addresses do not grant access.',
  );
  let db;
  try {
    const config = databaseConfig(env);
    // Opening a missing SQLite file would create it: refuse before connecting.
    if (config.url.startsWith('file:')) {
      const filename = config.url.startsWith('file:/')
        ? fileURLToPath(new URL(config.url))
        : resolve(config.url.slice(5));
      const file = await stat(filename);
      if (!file.isFile()) throw new Error('Not a database file');
    }
    db = await connect(env);
    add('database', 'pass', 'Connected with foreign-key enforcement enabled.');
    const expected = await readMigrations(directory);
    const table = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='consultiq_migrations'",
      )
      .first();
    if (!table)
      add(
        'migrations',
        'fail',
        'Migration history is missing. Initialize an empty database with npm run db:migrate; existing imported databases need a reviewed migration plan.',
      );
    else {
      const { results } = await db
        .prepare(
          'SELECT position,name,checksum FROM consultiq_migrations ORDER BY position',
        )
        .all();
      const matches =
        results.length <= expected.length &&
        results.every(
          (row, index) =>
            row.position === index &&
            row.name === expected[index]?.name &&
            row.checksum === expected[index]?.hash,
        );
      add(
        'migrations',
        matches && results.length === expected.length ? 'pass' : 'fail',
        matches
          ? `${results.length} of ${expected.length} migrations applied. Run npm run db:migrate for pending migrations.`
          : 'Migration history differs from this checkout. Restore the matching migration files; do not overwrite applied history.',
      );
    }
  } catch {
    add(
      'storage-check',
      'fail',
      'Could not verify storage. Check DATABASE_URL, remote token, connectivity, local file existence and migration files. Connection details are intentionally omitted.',
    );
  } finally {
    try {
      db?.close();
    } catch {
      add('connection-cleanup', 'warn', 'Database connection cleanup failed.');
    }
  }
  const ai = Boolean(env.ANTHROPIC_API_KEY?.trim() && env.AI_MODEL?.trim());
  add(
    'optional-ai',
    ai ? 'pass' : 'warn',
    ai
      ? 'Provider configuration present; model access and output quality have not been verified.'
      : 'AI is unavailable or incomplete. Manual reviews and library search do not require AI.',
  );
  add(
    'live-verification',
    'warn',
    'Still verify hosted sign-in, cross-user isolation, save/reload, backup/restore and optional model/tracing calls with approved synthetic input.',
  );
  return { ok: !checks.some((check) => check.status === 'fail'), checks };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  // Hard bound even if the remote driver cannot cancel a stalled connection.
  const deadline = setTimeout(() => {
    console.error(
      'Setup diagnostic timed out after 20 seconds. No migrations or record writes were requested.',
    );
    process.exit(1);
  }, 20000);
  try {
    const result = await diagnose(process.env);
    for (const check of result.checks)
      console.log(
        `${check.status.toUpperCase()} ${check.name}: ${check.message}`,
      );
    process.exitCode = result.ok ? 0 : 1;
  } catch {
    console.error(
      'Setup diagnostic failed. No secret values are included in this report.',
    );
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
  }
}
