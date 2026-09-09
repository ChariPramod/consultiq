import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory = mkdtempSync(join(tmpdir(), 'consultiq-migrations-'));
const databaseId = '00000000-0000-4000-8000-000000000000';
const config = join(directory, 'wrangler.json');
writeFileSync(
  config,
  JSON.stringify({
    name: 'consultiq-local',
    compatibility_date: '2026-05-15',
    d1_databases: [
      {
        binding: 'DB',
        database_name: 'consultiq-local',
        database_id: databaseId,
        migrations_dir: join(process.cwd(), 'drizzle'),
      },
    ],
  }),
);
try {
  const result = spawnSync(
    join(process.cwd(), 'node_modules/.bin/wrangler'),
    [
      'd1',
      'migrations',
      'apply',
      'DB',
      '--local',
      '--persist-to',
      join(process.cwd(), '.wrangler/state'),
      '--config',
      config,
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
    },
  );
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
