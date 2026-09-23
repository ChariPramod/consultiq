import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyHostedWorkflow } from '../scripts/verify-hosted-workflow.mjs';
const env = {
  HOSTED_BASE_URL: 'https://example.test',
  HOSTED_SESSION_TOKEN: 'owner-secret',
  HOSTED_OTHER_SESSION_TOKEN: 'other-secret',
  HOSTED_WORKSPACE_ID: 'workspace',
};
const json = (value, status = 200) => Response.json(value, { status });
function mock(options = {}) {
  let record;
  const requests = [];
  return {
    requests,
    get record() {
      return record;
    },
    fetcher: async (url, init) => {
      requests.push({ path: url.pathname, ...init });
      const other = init.headers.Authorization === 'Bearer other-secret';
      if (url.pathname === '/api/workspaces')
        return json({
          workspaces: other
            ? []
            : [{ id: 'workspace', role: options.role ?? 'owner' }],
        });
      if (other) return json({}, options.leak ? 200 : 403);
      if (init.method === 'POST') {
        const body = JSON.parse(init.body);
        record = {
          ...body,
          id: '12345678-1234-1234-1234-123456789abc',
          workspace_id: 'workspace',
          outcome: 'unknown',
          turns: body.transcript.split('\n').map((line) => ({
            role: line.split(':')[0],
            text: line.slice(line.indexOf(':') + 2),
            time: '',
          })),
        };
        if (options.createLoss) throw new Error('Secret network details');
        if (options.oversized)
          return new Response('x'.repeat(512001), {
            status: 201,
            headers: { 'content-type': 'application/json' },
          });
        return json(record, 201);
      }
      if (init.method === 'PATCH') {
        record.outcome = 'follow_up';
        return json(record);
      }
      if (init.method === 'DELETE') {
        if (options.deleteLoss) throw new Error('Secret delete details');
        record = null;
        return json({ deleted: true });
      }
      if (!record) return json({}, 404);
      return json({
        call: options.reloadMismatch ? { ...record, title: 'Wrong' } : record,
      });
    },
  };
}

test('workflow verifies writes, reload and admitted unrelated-user isolation then deletes only its created ID', async () => {
  const server = mock();
  const result = await verifyHostedWorkflow(env, {
    write: true,
    fetcher: server.fetcher,
  });
  assert.equal(result.exitCode, 2); // Assessment/provider checks remain explicitly unverified.
  assert.equal(result.cleanup, 'confirmed');
  assert.equal(
    result.checks.find((check) => check.name === 'unrelated-user-isolation')
      .status,
    'pass',
  );
  assert.equal(
    result.checks.filter((check) => check.status === 'fail').length,
    0,
  );
  assert.equal(server.record, null);
  assert.equal(
    server.requests.filter((request) => request.method === 'DELETE').length,
    1,
  );
  assert.ok(server.requests.every((request) => request.redirect === 'manual'));
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('workflow requires explicit write opt-in and owner authority before creating anything', async () => {
  const server = mock({ role: 'reviewer' });
  assert.equal(
    (await verifyHostedWorkflow(env, { fetcher: server.fetcher })).exitCode,
    2,
  );
  assert.equal(server.requests.length, 0);
  const denied = await verifyHostedWorkflow(env, {
    write: true,
    fetcher: server.fetcher,
  });
  assert.equal(denied.exitCode, 1);
  assert.equal(
    server.requests.filter((request) => request.method !== 'GET').length,
    0,
  );
});

test('failed readback or isolation still cleans up captured synthetic record', async () => {
  for (const options of [{ reloadMismatch: true }, { leak: true }]) {
    const server = mock(options);
    const result = await verifyHostedWorkflow(env, {
      write: true,
      fetcher: server.fetcher,
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.cleanup, 'confirmed');
    assert.equal(server.record, null);
  }
});

test('response-loss and oversized creation never guess identifiers or delete existing records', async () => {
  for (const options of [{ createLoss: true }, { oversized: true }]) {
    const server = mock(options);
    const result = await verifyHostedWorkflow(env, {
      write: true,
      fetcher: server.fetcher,
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.cleanup, 'uncertain');
    assert.equal(
      server.requests.filter((request) => request.method === 'DELETE').length,
      0,
    );
    assert.equal(JSON.stringify(result).includes('Secret'), false);
  }
});

test('cleanup response-loss is reported as failure without retrying deletion', async () => {
  const server = mock({ deleteLoss: true });
  const result = await verifyHostedWorkflow(env, {
    write: true,
    fetcher: server.fetcher,
  });
  assert.equal(result.exitCode, 1);
  assert.equal(result.cleanup, 'uncertain');
  assert.equal(
    server.requests.filter((request) => request.method === 'DELETE').length,
    1,
  );
});

test('missing second token remains unverified and unsafe origins never receive requests', async () => {
  const server = mock();
  const result = await verifyHostedWorkflow(
    { ...env, HOSTED_OTHER_SESSION_TOKEN: '' },
    { write: true, fetcher: server.fetcher },
  );
  assert.equal(
    result.checks.find((check) => check.name === 'unrelated-user-isolation')
      .status,
    'not-verified',
  );
  for (const url of [
    'http://example.test',
    'https://example.test/path',
    'https://user:password@example.test',
  ]) {
    await assert.rejects(
      verifyHostedWorkflow(
        { ...env, HOSTED_BASE_URL: url },
        { write: true, fetcher: server.fetcher },
      ),
      /HTTPS/,
    );
  }
});

test('globally rejected second identity is not counted as workspace isolation evidence', async () => {
  const server = mock();
  const result = await verifyHostedWorkflow(env, {
    write: true,
    fetcher: async (url, init) =>
      init.headers.Authorization === 'Bearer other-secret'
        ? json({}, 403)
        : server.fetcher(url, init),
  });
  assert.equal(result.exitCode, 1);
  assert.equal(
    result.checks.find((check) => check.name === 'unrelated-user-isolation')
      .status,
    'fail',
  );
  assert.equal(result.cleanup, 'confirmed');
});
