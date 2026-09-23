import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash } from 'node:crypto';
import { migrate } from '../scripts/migrate-local.mjs';
import { backupWorkspace, restoreWorkspace } from '../scripts/lib/backup.mjs';
import { verifyHosted } from '../scripts/verify-hosted.mjs';

async function db(t) {
  const client = createClient({ url: ':memory:' });
  t.after(() => client.close());
  await migrate(client);
  return client;
}
async function seed(client, id) {
  await client.execute({
    sql: 'INSERT INTO workspaces VALUES (?,?,?,?)',
    args: [id, `user_${id}`, 'Synthetic', '2026-01-01'],
  });
  await client.execute({
    sql: 'INSERT INTO consultations (id,workspace_id,title,coordinator,source,outcome,turns,recorded_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    args: [
      `call_${id}`,
      id,
      'Synthetic',
      'Trainer',
      'roleplay',
      'unknown',
      '[]',
      '2026-01-01',
      '2026-01-01',
    ],
  });
}
function resign(backup) {
  backup.checksum = createHash('sha256')
    .update(JSON.stringify(backup.payload))
    .digest('hex');
}

test('workspace backup excludes other tenants and roundtrips exact scoped records', async (t) => {
  const source = await db(t),
    target = await db(t);
  await seed(source, 'one');
  await seed(source, 'two');
  const backup = await backupWorkspace(source, 'one');
  assert.equal(backup.payload.tables.workspaces.length, 1);
  assert.equal(backup.payload.tables.consultations.length, 1);
  await restoreWorkspace(target, backup);
  assert.deepEqual(
    (await backupWorkspace(target, 'one')).payload.tables,
    backup.payload.tables,
  );
  await assert.rejects(restoreWorkspace(target, backup), /empty/);
  assert.equal(
    (await target.execute('SELECT count(*) AS n FROM consultations')).rows[0].n,
    1,
  );
});

test('restore rejects corruption and cross-workspace injection before writes', async (t) => {
  const source = await db(t),
    target = await db(t);
  await seed(source, 'one');
  const backup = await backupWorkspace(source, 'one');
  backup.payload.tables.consultations[0].title = 'Modified';
  await assert.rejects(restoreWorkspace(target, backup), /checksum/);
  backup.payload.tables.consultations[0].workspace_id = 'two';
  resign(backup);
  await assert.rejects(restoreWorkspace(target, backup), /boundary/);
  assert.equal(
    (await target.execute('SELECT count(*) AS n FROM workspaces')).rows[0].n,
    0,
  );
});

test('restore rolls back invalid foreign references and refuses mismatched schema', async (t) => {
  const source = await db(t),
    target = await db(t);
  await seed(source, 'one');
  const backup = await backupWorkspace(source, 'one');
  backup.payload.tables.knowledge_chunks.push({
    id: 'chunk',
    workspace_id: 'one',
    document_id: 'missing',
    position: 0,
    body: 'Synthetic',
  });
  resign(backup);
  await assert.rejects(
    restoreWorkspace(target, backup),
    /references|FOREIGN KEY/,
  );
  assert.equal(
    (await target.execute('SELECT count(*) AS n FROM workspaces')).rows[0].n,
    0,
  );
  await target.execute('ALTER TABLE consultations ADD COLUMN extra TEXT');
  await assert.rejects(restoreWorkspace(target, backup), /schema/);
});

test('backup refuses a missing workspace and pending analysis', async (t) => {
  const source = await db(t);
  await seed(source, 'one');
  await assert.rejects(backupWorkspace(source, 'missing'), /one workspace/);
  await source.execute(
    "INSERT INTO analysis_jobs(id,workspace_id,call_id,kind,status,created_at) VALUES ('job','one','call_one','assessment','running','2026-01-01')",
  );
  await assert.rejects(backupWorkspace(source, 'one'), /Quiesce/);
});

test('hosted verification distinguishes missing real session and never follows redirects', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return new Response('', {
      status:
        url.pathname === '/' ? 200 : options.headers.Authorization ? 200 : 401,
      headers: {
        'content-type': url.pathname === '/' ? 'text/html' : 'application/json',
      },
    });
  };
  const result = await verifyHosted(
    { HOSTED_BASE_URL: 'https://example.com' },
    fetcher,
  );
  assert.equal(result.ok, false);
  assert.equal(result.checks.at(-1).status, 'not-verified');
  assert.equal(
    (
      await verifyHosted(
        {
          HOSTED_BASE_URL: 'https://example.com',
          HOSTED_SESSION_TOKEN: 'secret',
        },
        fetcher,
      )
    ).ok,
    true,
  );
  assert.ok(calls.every(({ options }) => options.redirect === 'manual'));
  const failed = await verifyHosted(
    { HOSTED_BASE_URL: 'https://example.com', HOSTED_SESSION_TOKEN: 'secret' },
    async () => new Response('', { status: 302 }),
  );
  assert.equal(failed.ok, false);
  assert.equal(JSON.stringify(failed).includes('secret'), false);
  await assert.rejects(
    verifyHosted({ HOSTED_BASE_URL: 'http://example.com' }, fetcher),
    /HTTPS/,
  );
});

test('backup excludes invitation credentials while preserving scoped memberships', async (t) => {
  const source = await db(t),
    target = await db(t);
  await seed(source, 'one');
  await source.execute(
    "INSERT INTO workspace_members VALUES ('member','one','user_reviewer','reviewer','2026-01-01')",
  );
  await source.execute(
    "INSERT INTO workspace_invitations VALUES ('invite','one','user_invited','viewer','sensitive_hash','2026-01-02','2026-01-01')",
  );
  const backup = await backupWorkspace(source, 'one');
  assert.equal(backup.payload.tables.workspace_invitations.length, 0);
  assert.equal(JSON.stringify(backup).includes('sensitive_hash'), false);
  await restoreWorkspace(target, backup);
  assert.equal(
    (await target.execute('SELECT count(*) AS n FROM workspace_members'))
      .rows[0].n,
    1,
  );
  backup.payload.tables.workspace_invitations.push({ token_hash: 'injected' });
  resign(backup);
  await assert.rejects(
    restoreWorkspace(target, backup),
    /Invitation credentials/,
  );
});

test('backup refuses unscoped schema additions until operator policy is defined', async (t) => {
  const source = await db(t);
  await seed(source, 'one');
  await source.execute('CREATE TABLE unexpected_global (id TEXT)');
  await assert.rejects(backupWorkspace(source, 'one'), /Unscoped table/);
});
