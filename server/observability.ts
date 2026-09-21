import type { Client } from 'langsmith';
import { RunTree } from 'langsmith/run_trees';
import { configuration, type RuntimeConfig } from './config.ts';
import { AppError } from './repository.ts';

type Stage = 'model_response' | 'validation_save';
type Spans = { run<T>(stage: Stage, run: () => Promise<T>): Promise<T> };
type TraceClient = {
  createRun(run: ReturnType<RunTree['toJSON']>): Promise<void>;
};
type ClientFactory = (config: {
  apiKey: string;
  apiUrl: string;
  signal: AbortSignal;
}) => TraceClient;

/** Narrow transport: no retries, redirects, response-body reads or SDK logging. */
export function traceClient(
  config: { apiKey: string; apiUrl: string; signal: AbortSignal },
  fetcher: typeof fetch = fetch,
): TraceClient {
  return {
    async createRun(run) {
      const response = await fetcher(`${config.apiUrl}/runs`, {
        method: 'POST',
        redirect: 'error',
        signal: config.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
        },
        body: JSON.stringify(run),
      });
      await response.body?.cancel();
      if (!response.ok) throw new Error('trace_delivery_failed');
    },
  };
}
const unobserved: Spans = { run: (_stage, run) => run() };
const knownErrors = new Set([
  'provider_error',
  'provider_unavailable',
  'provider_output_invalid',
  'invalid_assessment',
  'invalid_input',
  'unsupported_coaching',
  'coaching_context_changed',
  'review_conflict',
  'rubric_not_found',
  'not_found',
]);
function errorCode(error: unknown): string {
  return error instanceof AppError && knownErrors.has(error.code)
    ? error.code
    : 'analysis_failed';
}

/** Only fixed metadata enters RunTree. Business values and exceptions never do. */
export async function observed<T>(
  env: RuntimeConfig,
  name: 'assess_consultation' | 'grounded_coaching',
  jobId: string,
  run: (spans: Spans) => Promise<T>,
  createClient: ClientFactory = traceClient,
): Promise<T> {
  if (!configuration(env).tracing) return run(unobserved);
  const endpoint = env.LANGSMITH_ENDPOINT || 'https://api.smith.langchain.com';
  if (
    ![
      'https://api.smith.langchain.com',
      'https://eu.api.smith.langchain.com',
    ].includes(endpoint)
  )
    throw new AppError(
      503,
      'tracing_configuration',
      'The configured trace endpoint is not supported.',
    );
  const warn = () =>
    console.warn(
      JSON.stringify({ event: 'tracing_delivery_failed', job_id: jobId }),
    );
  const controller = new AbortController();
  let client: TraceClient;
  let root: RunTree;
  try {
    client = createClient({
      apiKey: env.LANGSMITH_API_KEY!,
      apiUrl: endpoint,
      signal: controller.signal,
    });
    root = new RunTree({
      name,
      run_type: 'chain',
      client: client as Client,
      project_name: env.LANGSMITH_PROJECT || 'consultiq',
      inputs: {},
      metadata: {
        job_id: jobId,
        model: env.AI_MODEL,
        content_capture: 'disabled',
      },
    });
  } catch {
    warn();
    return run(unobserved);
  }
  const finish = async (span: RunTree, error?: string) => {
    try {
      await span.end({}, error);
    } catch {
      warn();
    }
  };
  const spans: Spans = {
    async run(stage, callback) {
      let child: RunTree;
      try {
        child = root.createChild({
          name: stage,
          run_type: stage === 'model_response' ? 'llm' : 'chain',
          inputs: {},
        });
      } catch {
        warn();
        return callback();
      }
      try {
        const result = await callback();
        await finish(child);
        return result;
      } catch (error) {
        await finish(child, errorCode(error));
        throw error;
      }
    },
  };
  try {
    const result = await run(spans);
    await finish(root);
    return result;
  } catch (error) {
    await finish(root, errorCode(error));
    throw error;
  } finally {
    // Send completed metadata-only spans after business timers stop. Direct
    // createRun avoids RunTree.postRun logging raw transport exceptions.
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const delivery = Promise.all(
        [root, ...root.child_runs].map((span) => {
          const serialized = span.toJSON();
          return client.createRun({
            id: span.id,
            name: span.name,
            run_type: span.run_type,
            start_time: serialized.start_time,
            end_time:
              span.end_time === undefined
                ? undefined
                : new Date(span.end_time).toISOString(),
            inputs: {},
            outputs: {},
            error: span.error,
            session_name: root.project_name,
            parent_run_id: serialized.parent_run_id,
            trace_id: span.trace_id,
            dotted_order: span.dotted_order,
            extra: {
              metadata: {
                job_id: jobId,
                model: env.AI_MODEL,
                content_capture: 'disabled',
              },
            },
          });
        }),
      );
      await Promise.race([
        delivery,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error('trace_delivery_timeout')),
            5000,
          );
        }),
      ]);
    } catch {
      warn();
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
}
