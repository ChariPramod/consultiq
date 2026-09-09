import {
  AppError,
  Repository,
  requiredText,
  type Database,
} from './repository.ts';
import { configuration, type RuntimeConfig } from './config.ts';
import { runCoaching, runScoring, type ModelCall } from './ai.ts';
export type Runtime = RuntimeConfig & { DB: Database };
function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
async function body(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new AppError(415, 'unsupported_media', 'Send JSON content.');
  if (Number(request.headers.get('content-length') || 0) > 500000)
    throw new AppError(413, 'body_too_large', 'The request is too large.');
  const reader = request.body?.getReader();
  if (!reader)
    throw new AppError(400, 'invalid_json', 'Request body is missing.');
  let size = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 500000) {
      await reader.cancel();
      throw new AppError(413, 'body_too_large', 'The request is too large.');
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new AppError(400, 'invalid_json', 'Request body must be valid JSON.');
  }
}
export async function handleApi(
  request: Request,
  env: Runtime,
  invoke?: ModelCall,
) {
  const requestId = crypto.randomUUID();
  try {
    const user = request.headers.get('oai-authenticated-user-id');
    if (!user)
      throw new AppError(
        401,
        'sign_in_required',
        'Sign in to access your workspace.',
      );
    const url = new URL(request.url);
    if (!['GET', 'HEAD'].includes(request.method)) {
      const origin = request.headers.get('origin');
      if (
        (origin && origin !== url.origin) ||
        request.headers.get('sec-fetch-site') === 'cross-site'
      )
        throw new AppError(
          403,
          'origin_rejected',
          'This request must come from the workspace.',
        );
    }
    if (!env.DB)
      throw new AppError(
        503,
        'storage_unavailable',
        'Workspace storage is not available.',
      );
    const repo = await Repository.forUser(env.DB, user);
    const path = url.pathname.replace(/\/$/, '');
    const method = request.method;
    if (path === '/api/workspace' && method === 'GET')
      return json({
        ...(await repo.overview()),
        configuration: configuration(env),
      });
    if (path === '/api/workspace' && method === 'PATCH') {
      const data = (await body(request)) as { name?: unknown };
      return json(await repo.renameWorkspace(data?.name));
    }
    if (path === '/api/consultations' && method === 'POST')
      return json(await repo.createCall(await body(request)), 201);
    if (path === '/api/rubrics' && method === 'POST')
      return json(await repo.publishRubric(await body(request)), 201);
    if (path === '/api/library' && method === 'POST')
      return json(await repo.addDocument(await body(request)), 201);
    if (path === '/api/library/search' && method === 'GET')
      return json({
        sources: await repo.retrieve(
          requiredText(url.searchParams.get('q'), 'search query', 500),
        ),
      });
    const doc = path.match(/^\/api\/library\/([^/]+)$/);
    if (doc && method === 'DELETE')
      return json(await repo.deleteDocument(doc[1]));
    const call = path.match(
      /^\/api\/consultations\/([^/]+)(?:\/(reviews|score|coaching))?$/,
    );
    if (call) {
      const [, callId, action] = call;
      if (!action && method === 'GET') return json(await repo.detail(callId));
      if (!action && method === 'DELETE')
        return json(await repo.deleteCall(callId));
      if (!action && method === 'PATCH')
        return json(await repo.setOutcome(callId, await body(request)));
      if (action === 'reviews' && method === 'POST')
        return json(
          await repo.saveAssessment(callId, await body(request)),
          201,
        );
      if (action === 'score' && method === 'POST')
        return json(await runScoring(repo, callId, env, invoke), 201);
      if (action === 'coaching' && method === 'POST') {
        const data = (await body(request)) as { question?: unknown };
        return json(
          await runCoaching(repo, callId, data?.question, env, invoke),
          201,
        );
      }
    }
    return json(
      { error: 'not_found', message: 'The requested resource was not found.' },
      404,
    );
  } catch (error) {
    if (error instanceof AppError)
      return json(
        { error: error.code, message: error.message, request_id: requestId },
        error.status,
      );
    console.error(
      JSON.stringify({ event: 'request_failed', request_id: requestId }),
    );
    return json(
      {
        error: 'internal_error',
        message: 'This request could not be completed. Please retry.',
        request_id: requestId,
      },
      500,
    );
  }
}
