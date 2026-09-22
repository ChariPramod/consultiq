import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { serveApi } from '../server/runtime.ts';
import { createDatabase } from '../server/database.ts';
import { migrate } from '../scripts/migrate-local.mjs';
const request = () =>
  new Request('https://app.test/api/workspace', {
    headers: { 'oai-authenticated-user-id': 'spoofed' },
  });
test('runtime rejects every unauthorized state before opening storage', async () => {
  for (const [status, expected] of [
    ['anonymous', 401],
    ['forbidden', 403],
    ['unconfigured', 503],
  ]) {
    let opened = false;
    const response = await serveApi(request(), {
      session: async () => ({ status, userId: null }),
      database: async () => {
        opened = true;
        throw new Error('must not connect');
      },
      config: {},
    });
    assert.equal(response.status, expected);
    assert.equal(opened, false);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
});
test('authentication and database outages remain sanitized and make no automatic retries', async () => {
  for (const stage of ['session', 'database']) {
    let calls = 0;
    const fail = async () => {
      calls++;
      throw new Error('secret-token https://private-db');
    };
    const response = await serveApi(request(), {
      session:
        stage === 'session'
          ? fail
          : async () => ({ status: 'authorized', userId: 'owner-a' }),
      database: fail,
      config: {},
    });
    assert.equal(response.status, 503);
    const value = await response.json();
    assert.equal(value.error, 'service_unavailable');
    assert.ok(value.request_id);
    assert.doesNotMatch(JSON.stringify(value), /secret-token|private-db/);
    assert.equal(calls, 1);
  }
});
test('verified runtime persists isolated workspaces on real libSQL and cleanup cannot mask a saved write', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'consultiq-runtime-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const env = { DATABASE_URL: pathToFileURL(join(directory, 'app.db')).href };
  const initial = await createDatabase(env);
  await migrate(initial.client);
  initial.close();
  let closes = 0;
  const deps = (userId) => ({
    session: async () => ({ status: 'authorized', userId }),
    config: {},
    database: async () => {
      const db = await createDatabase(env);
      const close = db.close.bind(db);
      db.close = () => {
        closes++;
        close();
        throw new Error('cleanup failure');
      };
      return db;
    },
  });
  const before = await (await serveApi(request(), deps('owner-a'))).json();
  const saved = await serveApi(
    new Request('https://app.test/api/workspace', {
      method: 'PATCH',
      headers: {
        Origin: 'https://app.test',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Private A' }),
    }),
    deps('owner-a'),
  );
  assert.equal(saved.status, 200);
  const a = await (await serveApi(request(), deps('owner-a'))).json();
  const b = await (await serveApi(request(), deps('owner-b'))).json();
  assert.equal(a.workspace.name, 'Private A');
  assert.equal(a.workspace.id, before.workspace.id);
  assert.notEqual(a.workspace.id, b.workspace.id);
  assert.notEqual(b.workspace.name, 'Private A');
  assert.equal(closes, 4);
});
