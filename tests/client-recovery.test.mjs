import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../lib/api.ts';
import { cancellationResult, recoveryMessage } from '../lib/activity.ts';
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
test('failed analysis recovery explains checking saved results without promising retries', () => {
  assert.match(recoveryMessage('interrupted'), /check saved results/);
  assert.match(recoveryMessage('review_conflict'), /newer review/i);
  assert.match(
    recoveryMessage('unsupported_coaching'),
    /could not be validated/,
  );
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

test('queue CSV neutralizes formulas hidden behind whitespace or BOM', async () => {
  const { csv } = await import('../lib/product.ts');
  for (const title of ['  =1+1', '\uFEFF@SUM(1)', '\n=1', '\ttext', '-1+2']) {
    const result = csv([
      {
        title,
        coordinator: 'Trainer',
        source: 'synthetic',
        recorded_at: '2026-10-02',
        outcome: 'unknown',
        latest: null,
      },
    ]);
    assert.ok(result.split('\r\n')[1].startsWith('"\''), title);
  }
});

test('cancellation feedback reports terminal races and deleted jobs without claiming cancellation', () => {
  const cancelled = cancellationResult(
    { job: { id: 'run', status: 'cancelled' } },
    'run',
  );
  assert.equal(cancelled.uncertain, false);
  assert.match(cancelled.message, /Cancellation saved/);
  for (const status of ['completed', 'failed']) {
    const outcome = cancellationResult({ job: { id: 'run', status } }, 'run');
    assert.equal(outcome.uncertain, false);
    assert.match(outcome.message, new RegExp(`already ${status}`));
    assert.doesNotMatch(outcome.message, /Cancellation saved|Run cancelled/);
  }
  const removed = cancellationResult({ job: null }, 'run');
  assert.equal(removed.uncertain, false);
  assert.match(removed.message, /no longer available/);
  assert.doesNotMatch(removed.message, /Cancellation saved/);
});

test('unverifiable cancellation bodies pause repeat actions and never expose raw response content', () => {
  for (const response of [
    null,
    {},
    { cancelled: true },
    { job: [] },
    { job: { id: 'other-run', status: 'cancelled' } },
    { job: { id: 'run', status: 'queued' } },
    { job: { id: 'run', status: 'running' } },
    { job: { id: 'run', status: 'PRIVATE_PROVIDER_MESSAGE' } },
  ]) {
    const outcome = cancellationResult(response, 'run');
    assert.equal(outcome.uncertain, true);
    assert.match(outcome.message, /could not be confirmed/);
    assert.match(outcome.message, /Refresh activity/);
    assert.doesNotMatch(
      outcome.message,
      /PRIVATE_PROVIDER_MESSAGE|other-run|Cancellation saved/,
    );
  }
});
