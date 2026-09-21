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
