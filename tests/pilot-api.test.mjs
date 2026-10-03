import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase } from '../server/database.ts';
import { migrate } from '../scripts/migrate-local.mjs';
import { Repository } from '../server/repository.ts';
import { Team, acceptInvitation } from '../server/team.ts';
import { handleApi } from '../server/handler.ts';

async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), 'consultiq-pilot-api-'));
  const db = await createDatabase({
    DATABASE_URL: pathToFileURL(join(dir, 'app.db')).href,
  });
  t.after(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });
  await migrate(db.client);
  const repo = await Repository.forUser(db, 'owner');
  const other = await Repository.forUser(db, 'other');
  const input = {
    title: 'Synthetic consultation',
    coordinator: 'A reviewer',
    source: 'synthetic',
    recorded_at: '2026-09-22',
    transcript: 'Coordinator: Would Thursday work?\nPatient: Yes, Thursday.',
  };
  const call = await repo.createCall(input);
  const privateCall = await other.createCall({
    ...input,
    title: 'Private other workspace',
  });
  const invite = await new Team(repo, 'owner', 'owner').invite({
    invitee_id: 'user_viewer',
    role: 'viewer',
  });
  await acceptInvitation(db, 'user_viewer', { token: invite.token });
  const request = (user, path, workspace = repo.workspaceId, headers = {}) =>
    handleApi(
      new Request('https://app.test/api/' + path, {
        headers: { 'X-Workspace-Id': workspace, ...headers },
      }),
      { DB: db },
      undefined,
      user,
    );
  return { repo, other, call, privateCall, request };
}

test('authenticated owner and shared viewer can query only selected workspace consultations', async (t) => {
  const { call, request } = await setup(t);
  for (const user of ['owner', 'user_viewer']) {
    const response = await request(
      user,
      'consultations?limit=1&review=unreviewed',
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
    const result = await response.json();
    assert.equal(result.total, 1);
    assert.equal(result.calls[0].id, call.id);
    assert.equal(result.next_cursor, null);
    assert.equal(result.calls[0].latest, null);
    assert.equal(result.calls[0].turn_count, 2);
    assert.equal('turns' in result.calls[0], false);
    assert.doesNotMatch(JSON.stringify(result), /Would Thursday work/);
  }
  assert.equal(
    (await request('owner', 'consultations?review=arbitrary')).status,
    422,
  );
});

test('portable JSON and CSV download endpoints preserve workspace authorization and prevent caching', async (t) => {
  const { call, request } = await setup(t);
  for (const user of ['owner', 'user_viewer']) {
    for (const format of ['json', 'csv']) {
      const response = await request(
        user,
        `consultations/${call.id}/export?format=${format}`,
      );
      assert.equal(response.status, 200);
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.match(response.headers.get('content-type'), /application\/json/);
      const { filename, mime, content } = await response.json();
      assert.equal(filename, `consultiq-consultation.${format}`);
      assert.match(mime, format === 'json' ? /application\/json/ : /text\/csv/);
      assert.match(content, /Would Thursday work/);
      assert.doesNotMatch(content, /Private other workspace/);
      if (format === 'json') {
        const bundle = JSON.parse(content);
        assert.equal(bundle.schema, 'consultiq.consultation-export');
        assert.equal(bundle.consultation.id, call.id);
      }
    }
  }
});

test('query and downloads reject unauthenticated, spoofed and unauthorized workspace access', async (t) => {
  const { call, privateCall, other, request } = await setup(t);
  for (const path of [
    'consultations',
    `consultations/${call.id}/export?format=json`,
  ]) {
    assert.equal((await request(null, path)).status, 401);
    assert.equal(
      (
        await request(null, path, undefined, {
          'X-User-Id': 'owner',
          'X-Sites-User-Id': 'owner',
        })
      ).status,
      401,
    );
    assert.equal((await request('other', path)).status, 403);
    assert.equal(
      (await request('user_viewer', path, other.workspaceId)).status,
      403,
    );
  }
  for (const format of ['json', 'csv']) {
    const response = await request(
      'owner',
      `consultations/${privateCall.id}/export?format=${format}`,
    );
    assert.equal(response.status, 404);
    assert.doesNotMatch(await response.text(), /Private other workspace/);
  }
});

test('unsupported export formats fail explicitly and never fall back to another representation', async (t) => {
  const { call, request } = await setup(t);
  for (const suffix of ['?format=pdf', '?format=', '?format=JSON', '']) {
    const response = await request(
      'owner',
      `consultations/${call.id}/export${suffix}`,
    );
    assert.equal(response.status, 422);
    assert.match(await response.text(), /invalid_export_format/);
  }
});
