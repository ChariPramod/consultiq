import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../lib/api.ts';
import { filterActivity, recoveryMessage } from '../lib/activity.ts';
test('lost writes are not retried and advise checking saved results', async () => {
  let calls = 0;
  await assert.rejects(
    api('consultations/x/score', 'POST', {}, async (_url, options) => {
      calls++;
      assert.ok(options.signal instanceof AbortSignal);
      throw new Error('private transport');
    }),
    (error) =>
      error.code === 'network' && /may have been saved/.test(error.message),
  );
  assert.equal(calls, 1);
});
test('malformed successful response is not presented as a saved result', async () => {
  await assert.rejects(
    api(
      'workspace',
      'GET',
      undefined,
      async () => new Response('<html>error</html>'),
    ),
    { code: 'invalid_response' },
  );
  await assert.rejects(
    api('x', 'POST', {}, async () => Response.json(null)),
    (error) =>
      error.code === 'invalid_response' &&
      /Check saved results/.test(error.message),
  );
});
test('API preserves authentication errors and returns valid data', async () => {
  await assert.rejects(
    api('workspace', 'GET', undefined, async () =>
      Response.json(
        { error: 'unauthorized', message: 'Sign in.' },
        { status: 401 },
      ),
    ),
    { status: 401, code: 'unauthorized' },
  );
  assert.deepEqual(
    await api('workspace', 'GET', undefined, async () =>
      Response.json({ jobs: [] }),
    ),
    { jobs: [] },
  );
});
test('activity filtering searches only supplied loaded workspace records', () => {
  const data = {
    calls: [
      { id: 'c', title: 'Follow-up review', coordinator: 'Coordinator A' },
    ],
    jobs: [
      {
        id: 'r1',
        call_id: 'c',
        kind: 'scoring',
        status: 'failed',
        error_code: 'interrupted',
      },
      {
        id: 'r2',
        call_id: 'missing',
        kind: 'coaching',
        status: 'completed',
        error_code: null,
      },
    ],
  };
  assert.deepEqual(
    filterActivity(data, 'failed', 'FOLLOW-UP').map((x) => x.id),
    ['r1'],
  );
  assert.equal(filterActivity(data, 'completed', 'FOLLOW-UP').length, 0);
  assert.equal(filterActivity(data, 'all', 'interrupted').length, 1);
  assert.equal(filterActivity(data, 'all', 'r2').length, 1);
  assert.equal(filterActivity({ calls: [], jobs: [] }, 'all', '').length, 0);
  assert.match(recoveryMessage('interrupted'), /check saved results/);
  assert.match(recoveryMessage('unknown'), /Manual review/);
});

test('workspace selection scopes requests but not membership discovery or invitation acceptance', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    sessionStorage: { getItem: () => 'workspace-selected' },
  };
  try {
    const seen = [];
    const send = async (url, options) => {
      seen.push({ url, headers: options.headers });
      return Response.json({});
    };
    await api('workspace', 'GET', undefined, send);
    await api('workspaces', 'GET', undefined, send);
    await api('team/accept', 'POST', { token: 'invitation' }, send);
    await api('consultations/c/score', 'POST', {}, send);
    await api('consultations/c/score', 'POST', {}, send);
    assert.equal(seen[0].headers['X-Workspace-Id'], 'workspace-selected');
    assert.equal(seen[1].headers['X-Workspace-Id'], undefined);
    assert.equal(seen[2].headers['X-Workspace-Id'], undefined);
    assert.equal(seen[3].headers['X-Workspace-Id'], 'workspace-selected');
    assert.match(seen[3].headers['Idempotency-Key'], /^[a-f0-9-]{36}$/);
    assert.notEqual(
      seen[3].headers['Idempotency-Key'],
      seen[4].headers['Idempotency-Key'],
    );
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('unavailable browser storage falls back to the server-selected personal workspace', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    sessionStorage: {
      getItem() {
        throw new Error('Storage blocked');
      },
    },
  };
  try {
    await api('workspace', 'GET', undefined, async (_url, options) => {
      assert.equal(options.headers['X-Workspace-Id'], undefined);
      return Response.json({});
    });
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('queued and cancelled analysis runs can be inspected independently', () => {
  const data = {
    calls: [],
    jobs: [
      {
        id: 'q',
        call_id: 'c',
        kind: 'scoring',
        status: 'queued',
        error_code: null,
      },
      {
        id: 'x',
        call_id: 'c',
        kind: 'scoring',
        status: 'cancelled',
        error_code: null,
      },
    ],
  };
  assert.deepEqual(
    filterActivity(data, 'queued', '').map((job) => job.id),
    ['q'],
  );
  assert.deepEqual(
    filterActivity(data, 'cancelled', '').map((job) => job.id),
    ['x'],
  );
});
