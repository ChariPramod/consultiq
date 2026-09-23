import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createClient } from '@libsql/client';
import { databaseConfig } from '../server/database.ts';
import { backupWorkspace } from './lib/backup.mjs';
let client;
try {
  const [workspaceId, filename] = process.argv.slice(2);
  if (!workspaceId || !filename) throw new Error('Arguments required');
  const output = resolve(filename);
  if (!output.startsWith(resolve('.local-data') + '/'))
    throw new Error('Backup destination must be inside ignored .local-data');
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  client = createClient(databaseConfig(process.env));
  const backup = await backupWorkspace(client, workspaceId);
  await writeFile(output, JSON.stringify(backup), { flag: 'wx', mode: 0o600 });
  console.log(
    'Workspace snapshot saved. Contains sensitive data; transfer only to approved encrypted storage.',
  );
} catch {
  console.error(
    'Backup failed. Supply workspace ID and a new .local-data file path; check connectivity, migrations, and quiesced analysis. No existing file was overwritten.',
  );
  process.exitCode = 1;
} finally {
  client?.close();
}
