import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RunTree } from 'langsmith/run_trees';
import { observed, traceClient } from '../server/observability.ts';
import { AppError } from '../server/repository.ts';
const env = {
  LANGSMITH_TRACING: 'true',
  LANGSMITH_API_KEY: 'test-only-key',
  AI_MODEL: 'test-model',
  LANGSMITH_PROJECT: 'test-project',
};
function recording() {
  const records = [];
  return {
    records,
    factory: () => ({
      createRun: async (run) => {
        records.push(structuredClone(run));
      },
    }),
  };
}

test('completed root and nested stages contain metadata only, with hierarchy and timing', async () => {
  const { records, factory } = recording();
  let callbacks = 0;
  const result = await observed(
    env,
    'assess_consultation',
    'job-1',
    async (spans) => {
      const output = await spans.run('model_response', async () => {
        callbacks++;
        return { secret: 'private transcript' };
      });
      return spans.run('validation_save', async () => {
        callbacks++;
        return output;
      });
    },
    factory,
  );
  assert.equal(result.secret, 'private transcript');
  assert.equal(callbacks, 2);
  assert.deepEqual(
    records.map((r) => r.name),
    ['assess_consultation', 'model_response', 'validation_save'],
  );
  const [root, ...children] = records;
  for (const child of children) {
    assert.equal(child.parent_run_id, root.id);
    assert.equal(child.trace_id, root.trace_id);
    assert.ok(child.dotted_order.startsWith(root.dotted_order + '.'));
  }
  for (const record of records) {
    assert.deepEqual(record.inputs, {});
    assert.deepEqual(record.outputs, {});
    assert.equal(record.session_name, 'test-project');
    assert.ok(Date.parse(record.end_time) >= Date.parse(record.start_time));
    assert.deepEqual(record.extra.metadata, {
      job_id: 'job-1',
      model: 'test-model',
      content_capture: 'disabled',
    });
  }
  assert.ok(!JSON.stringify(records).includes('private transcript'));
  assert.ok(!JSON.stringify(records).includes('test-only-key'));
});

test('failed stage and parent use only fixed codes and preserve original exception', async () => {
  for (const error of [
    new Error('private transcript'),
    new AppError(422, 'unsupported_coaching', 'secret quote'),
    new AppError(500, 'secret-custom-code', 'secret'),
  ]) {
    const { records, factory } = recording();
    await assert.rejects(
      observed(
        env,
        'grounded_coaching',
        'job-2',
        (spans) =>
          spans.run('model_response', async () => {
            throw error;
          }),
        factory,
      ),
      (value) => value === error,
    );
    assert.equal(records.length, 2);
    for (const record of records)
      assert.equal(
        record.error,
        error.code === 'unsupported_coaching' ? error.code : 'analysis_failed',
      );
    assert.doesNotMatch(
      JSON.stringify(records),
      /private transcript|secret|stack/,
    );
  }
});

test('tracing disabled or key missing creates no client; invalid endpoint fails before business call', async () => {
  for (const config of [
    {},
    { ...env, LANGSMITH_TRACING: 'false' },
    { ...env, LANGSMITH_API_KEY: '' },
  ]) {
    let calls = 0;
    assert.equal(
      await observed(
        config,
        'grounded_coaching',
        'job-3',
        (spans) =>
          spans.run('validation_save', async () => {
            calls++;
            return 7;
          }),
        () => {
          throw new Error('must not initialize');
        },
      ),
      7,
    );
    assert.equal(calls, 1);
  }
  let ran = false;
  await assert.rejects(
    observed(
      { ...env, LANGSMITH_ENDPOINT: 'https://untrusted.example' },
      'grounded_coaching',
      'job-3',
      async () => {
        ran = true;
      },
    ),
    { code: 'tracing_configuration' },
  );
  assert.equal(ran, false);
});

test('client setup, delivery and span finalization failures never replace business result/error', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (value) => warnings.push(value));
  const original = new Error('private business failure');
  for (const factory of [
    () => {
      throw new Error('secret setup');
    },
    () => ({
      createRun: async () => {
        throw new Error('secret transport');
      },
    }),
  ]) {
    let calls = 0;
    assert.equal(
      await observed(
        env,
        'grounded_coaching',
        'job-4',
        async () => {
          calls++;
          return 'saved';
        },
        factory,
      ),
      'saved',
    );
    await assert.rejects(
      observed(
        env,
        'grounded_coaching',
        'job-4',
        async () => {
          calls++;
          throw original;
        },
        factory,
      ),
      (e) => e === original,
    );
    assert.equal(calls, 2);
  }
  t.mock.method(RunTree.prototype, 'end', async () => {
    throw new Error('secret span failure');
  });
  const { factory } = recording();
  assert.equal(
    await observed(
      env,
      'grounded_coaching',
      'job-4',
      (spans) => spans.run('model_response', async () => 'saved'),
      factory,
    ),
    'saved',
  );
  await assert.rejects(
    observed(
      env,
      'grounded_coaching',
      'job-4',
      (spans) =>
        spans.run('model_response', async () => {
          throw original;
        }),
      factory,
    ),
    (e) => e === original,
  );
  assert.ok(warnings.length);
  assert.ok(
    warnings.every(
      (w) => w === '{"event":"tracing_delivery_failed","job_id":"job-4"}',
    ),
  );
});

test('trace HTTP writer makes one bounded request and cancels response without reading content', async () => {
  const controller = new AbortController();
  for (const status of [202, 503]) {
    let calls = 0;
    let cancelled = false;
    const client = traceClient(
      {
        apiKey: 'test-key',
        apiUrl: 'https://eu.api.smith.langchain.com',
        signal: controller.signal,
      },
      async (url, options) => {
        calls++;
        assert.equal(url, 'https://eu.api.smith.langchain.com/runs');
        assert.equal(options.redirect, 'error');
        assert.equal(options.signal, controller.signal);
        assert.equal(options.headers['x-api-key'], 'test-key');
        return new Response(
          new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }),
          { status },
        );
      },
    );
    if (status === 202) await client.createRun({ name: 'test', inputs: {} });
    else
      await assert.rejects(client.createRun({ name: 'test', inputs: {} }), {
        message: 'trace_delivery_failed',
      });
    assert.equal(calls, 1);
    assert.equal(cancelled, true);
  }
});

test('hung delivery returns after five-second budget and aborts all writer requests', async (t) => {
  t.mock.method(console, 'warn', () => {});
  let signal;
  let calls = 0;
  const before = performance.now();
  const result = await observed(
    env,
    'grounded_coaching',
    'job-5',
    async () => {
      calls++;
      return 'saved';
    },
    (config) => {
      signal = config.signal;
      return { createRun: () => new Promise(() => {}) };
    },
  );
  assert.equal(result, 'saved');
  assert.equal(calls, 1);
  assert.equal(signal.aborted, true);
  assert.ok(performance.now() - before < 6500);
});

test('validation failure keeps successful model span and marks only validation and root failed', async () => {
  const { records, factory } = recording();
  const error = new AppError(422, 'unsupported_coaching', 'private citation');
  await assert.rejects(
    observed(
      env,
      'grounded_coaching',
      'job-validation',
      async (spans) => {
        await spans.run('model_response', async () => ({
          answer: 'private answer',
        }));
        return spans.run('validation_save', async () => {
          throw error;
        });
      },
      factory,
    ),
    (value) => value === error,
  );
  assert.equal(records.length, 3);
  assert.equal(records[0].error, 'unsupported_coaching');
  assert.equal(records[1].name, 'model_response');
  assert.equal(records[1].error, undefined);
  assert.equal(records[2].name, 'validation_save');
  assert.equal(records[2].error, 'unsupported_coaching');
  assert.doesNotMatch(JSON.stringify(records), /private/);
});
