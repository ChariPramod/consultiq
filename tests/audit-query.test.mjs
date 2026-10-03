import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase } from '../server/database.ts';
import { migrate } from '../scripts/migrate-local.mjs';
import { Repository } from '../server/repository.ts';
import { queryAuditEvents } from '../server/audit-query.ts';
import { AUDIT_ACTIONS, auditActionLabel } from '../lib/audit-query.ts';

const time = '2026-10-02T10:00:00.000Z';
async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), 'consultiq-audit-query-'));
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
  const event = async (id, options = {}, scope = repo) => {
    await scope
      .statement(
        'INSERT INTO audit_events(id,workspace_id,action,entity_id,actor_id,created_at) VALUES(?,?,?,?,?,?)',
        id,
        scope.workspaceId,
        options.action ?? 'assessment_saved',
        options.entity_id ?? `entity-${id}`,
        options.actor_id === undefined ? 'recorded-reviewer' : options.actor_id,
        options.created_at ?? time,
      )
      .run();
  };
  const query = (params = {}, scope = repo) =>
    queryAuditEvents(scope, new URLSearchParams(params));
  return { repo, other, event, query };
}

test('audit history pages through tied timestamps without duplicates, skips newer insertions until refresh, and exposes metadata only', async (t) => {
  const { event, query } = await setup(t);
  for (let i = 0; i < 123; i++)
    await event(`event-${String(i).padStart(3, '0')}`, {
      created_at: i < 60 ? '2026-10-01T10:00:00.000Z' : time,
    });
  const first = await query({ limit: '25' });
  assert.equal(first.limit, 25);
  assert.equal(first.events.length, 25);
  assert.equal(first.events[0].id, 'event-122');
  assert.deepEqual(Object.keys(first.events[0]).sort(), [
    'action',
    'actor_id',
    'created_at',
    'entity_id',
    'id',
  ]);
  await event('new-event', { created_at: '2026-10-03T10:00:00.000Z' });
  const seen = first.events.map((row) => row.id);
  let cursor = first.next_cursor;
  while (cursor) {
    const page = await query({ limit: '50', cursor });
    assert.equal(page.limit, 50);
    assert.ok(page.events.length <= 50);
    assert.equal(page.has_more, page.next_cursor !== null);
    seen.push(...page.events.map((row) => row.id));
    cursor = page.next_cursor;
  }
  assert.equal(seen.length, 123);
  assert.equal(new Set(seen).size, 123);
  assert.equal(seen.at(-1), 'event-000');
  assert.equal((await query()).events[0].id, 'new-event');
});

test('audit filters match exact known actions, include legacy unknown actions only in all history, and do not infer missing actors', async (t) => {
  const { event, query } = await setup(t);
  for (const action of AUDIT_ACTIONS)
    await event(`event-${action}`, { action });
  await event('legacy', { action: 'legacy_event', actor_id: null });
  for (const action of AUDIT_ACTIONS) {
    const result = await query({ action });
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].action, action);
    assert.equal(result.has_more, false);
    assert.equal(result.next_cursor, null);
  }
  const all = await query({ limit: '50' });
  assert.equal(all.events.length, AUDIT_ACTIONS.length + 1);
  assert.equal(all.events.find((row) => row.id === 'legacy').actor_id, null);
  assert.equal(auditActionLabel('legacy_event'), 'Unrecognized event');
  assert.equal(auditActionLabel('toString'), 'Unrecognized event');
  assert.equal(auditActionLabel('assessment_saved'), 'Assessment saved');
});

test('audit reads remain workspace scoped and cursors cannot be reused across workspaces or action filters', async (t) => {
  const { repo, other, event, query } = await setup(t);
  await event('a');
  await event('b');
  await event(
    'foreign-event',
    { entity_id: 'foreign-secret', actor_id: 'foreign-actor' },
    other,
  );
  const own = await query();
  assert.deepEqual(
    own.events.map((row) => row.id),
    ['b', 'a'],
  );
  assert.doesNotMatch(JSON.stringify(own), /foreign-secret|foreign-actor/);
  assert.deepEqual(
    (await query({}, other)).events.map((row) => row.id),
    ['foreign-event'],
  );
  const first = await query({ limit: '1' });
  await assert.rejects(
    query({ cursor: first.next_cursor }, other),
    (error) => error.status === 422,
  );
  await assert.rejects(
    query({ action: 'assessment_saved', cursor: first.next_cursor }, repo),
    (error) => error.status === 422,
  );
  const filtered = await query({ action: 'assessment_saved', limit: '1' });
  assert.equal(
    (await query({ action: 'assessment_saved', cursor: filtered.next_cursor }))
      .events[0].id,
    'a',
  );
  // Caller-supplied workspace parameters cannot alter the repository's authenticated scope.
  assert.deepEqual(
    (await query({ workspace_id: other.workspaceId })).events.map(
      (row) => row.id,
    ),
    ['b', 'a'],
  );
});

test('deleted consultation events remain inspectable without reading deleted transcript or current names', async (t) => {
  const { repo, query } = await setup(t);
  const call = await repo.createCall({
    title: 'Private consultation title',
    coordinator: 'Private coordinator',
    source: 'synthetic',
    recorded_at: '2026-10-02',
    transcript:
      'Coordinator: Private transcript content.\nPatient: Private patient response.',
  });
  await repo.deleteCall(call.id);
  const page = await query();
  assert.equal(page.events.length, 2);
  assert.deepEqual(page.events.map((row) => row.action).sort(), [
    'consultation_created',
    'consultation_deleted',
  ]);
  assert.ok(
    page.events.every(
      (row) => row.entity_id === call.id && row.actor_id === 'owner',
    ),
  );
  assert.doesNotMatch(
    JSON.stringify(page),
    /Private consultation|Private coordinator|Private transcript|Private patient/,
  );
});

test('audit query rejects invalid limits, duplicate filters and malformed or incompatible cursors', async (t) => {
  const { repo, event, query } = await setup(t);
  assert.deepEqual(await query(), {
    events: [],
    limit: 25,
    has_more: false,
    next_cursor: null,
  });
  for (const params of [
    { limit: '0' },
    { limit: '51' },
    { limit: '01' },
    { limit: '1.5' },
    { limit: '1e1' },
    { action: '' },
    { action: 'ASSESSMENT_SAVED' },
    { action: "' OR 1=1 --" },
    { action: 'toString' },
    { cursor: '' },
    { cursor: 'invalid' },
    { cursor: 'x'.repeat(8193) },
  ])
    await assert.rejects(
      query(params),
      (error) => error.status === 422 && error.code === 'invalid_query',
    );
  for (const key of ['action', 'limit', 'cursor']) {
    await assert.rejects(
      queryAuditEvents(repo, new URLSearchParams(`${key}=1&${key}=2`)),
      (error) => error.status === 422,
    );
  }
  await event('a');
  await event('b');
  const first = await query({ limit: '1' });
  const valid = JSON.parse(
    Buffer.from(first.next_cursor, 'base64url').toString('utf8'),
  );
  for (const override of [
    { created_at: '2026-10-02' },
    { created_at: 'not-a-date' },
    { created_at: '2026-02-30T10:00:00.000Z' },
    { id: '' },
    { id: 'x'.repeat(101) },
    { version: 2 },
    { scope: 'wrong' },
  ])
    await assert.rejects(
      query({
        cursor: Buffer.from(JSON.stringify({ ...valid, ...override })).toString(
          'base64url',
        ),
      }),
      (error) => error.status === 422,
    );
});
