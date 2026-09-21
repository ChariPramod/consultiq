import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelClient } from '../server/model.ts';
const config = { ANTHROPIC_API_KEY: 'test-only', AI_MODEL: 'test-model' };
const envelope = (text = '{"dimensions":[]}') => ({
  stop_reason: 'end_turn',
  content: [{ type: 'text', text }],
});

test('provider adapter uses configured endpoint, model and a bounded request', async () => {
  let request;
  const invoke = modelClient(config, async (url, options) => {
    request = { url, ...options };
    return Response.json(envelope());
  });
  assert.deepEqual(
    await invoke('test instruction', { transcript: 'synthetic' }),
    { dimensions: [] },
  );
  assert.equal(request.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(JSON.parse(request.body).model, 'test-model');
  assert.ok(request.signal instanceof AbortSignal);
  assert.equal(request.headers['x-api-key'], 'test-only');
});

test('missing configuration makes no provider request', async () => {
  let invoked = false;
  await assert.rejects(
    modelClient({}, async () => {
      invoked = true;
    })('system', {}),
    { code: 'provider_not_configured' },
  );
  assert.equal(invoked, false);
});

test('network and body-stream failures expose sanitized recoverable errors', async () => {
  for (const fetcher of [
    async () => {
      throw new Error('secret provider transport detail');
    },
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error('private transcript'));
          },
        }),
      ),
  ]) {
    await assert.rejects(
      modelClient(config, fetcher)('system', {}),
      (error) => {
        assert.equal(error.code, 'provider_unavailable');
        assert.equal(error.status, 502);
        assert.doesNotMatch(error.message, /secret|private transcript/);
        return true;
      },
    );
  }
});

test('provider failure bodies are not consumed or exposed', async () => {
  let cancelled = false;
  const invoke = modelClient(
    config,
    async () =>
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
        { status: 429 },
      ),
  );
  await assert.rejects(invoke('system', {}), { code: 'provider_error' });
  assert.equal(cancelled, true);
});

test('oversized streaming response is cancelled before the entire body is buffered', async () => {
  let reads = 0;
  let cancelled = false;
  const invoke = modelClient(
    config,
    async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            reads++;
            controller.enqueue(new Uint8Array(100000));
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
  );
  await assert.rejects(invoke('system', {}), {
    code: 'provider_output_invalid',
  });
  assert.ok(reads <= 3);
  assert.equal(cancelled, true);
});

test('incomplete and malformed provider output never becomes a result', async () => {
  for (const payload of [
    { ...envelope(), stop_reason: 'max_tokens' },
    { ...envelope(), content: null },
    envelope('{broken json'),
    envelope(''),
  ]) {
    await assert.rejects(
      modelClient(config, async () => Response.json(payload))('system', {}),
      { code: 'provider_output_invalid' },
    );
  }
});
