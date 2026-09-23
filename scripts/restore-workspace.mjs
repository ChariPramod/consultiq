import { readFile, stat } from 'node:fs/promises';
import { createClient } from '@libsql/client';
import { databaseConfig } from '../server/database.ts';
import { restoreWorkspace } from './lib/backup.mjs';
let client;
try {
  const [filename, confirmation] = process.argv.slice(2);
  if (
    !filename ||
    confirmation !== '--empty-staging-only' ||
    !process.env.RESTORE_DATABASE_URL ||
    process.env.RESTORE_DATABASE_URL === process.env.DATABASE_URL
  )
    throw new Error('Separate staging destination required.');
  if ((await stat(filename)).size > 100 * 1024 * 1024)
    throw new Error('Backup exceeds pilot bound.');
  const backup = JSON.parse(await readFile(filename, 'utf8'));
  client = createClient(
    databaseConfig({
      DATABASE_URL: process.env.RESTORE_DATABASE_URL,
      DATABASE_AUTH_TOKEN: process.env.RESTORE_DATABASE_AUTH_TOKEN,
    }),
  );
  const result = await restoreWorkspace(client, backup);
  console.log(
    `Staging restore committed: ${result.rows} rows across ${result.tables} tables. No production cutover performed.`,
  );
} catch {
  console.error(
    'Restore refused or failed. Use a distinct, empty, migrated staging database, matching checkout and valid backup, with --empty-staging-only. No partial restore was committed.',
  );
  process.exitCode = 1;
} finally {
  client?.close();
}
