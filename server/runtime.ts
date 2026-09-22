import { handleApi, type Runtime } from './handler.ts';
import type { Database } from './repository.ts';
export type SessionAccess =
  | { status: 'authorized'; userId: string }
  | { status: 'anonymous' | 'forbidden' | 'unconfigured'; userId: null };
type Dependencies = {
  session: () => Promise<SessionAccess>;
  database: () => Promise<Database & { close(): void }>;
  config: Omit<Runtime, 'DB'>;
};
function failure(status: number, code: string, message: string) {
  return Response.json(
    { error: code, message, request_id: crypto.randomUUID() },
    {
      status,
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}
/** Verified identity stays outside caller-controlled headers. Never retry writes here. */
export async function serveApi(request: Request, dependencies: Dependencies) {
  try {
    const access = await dependencies.session();
    if (access.status === 'unconfigured')
      return failure(
        503,
        'authentication_unavailable',
        'Authentication is not configured.',
      );
    if (access.status === 'anonymous')
      return failure(
        401,
        'sign_in_required',
        'Sign in to access your workspace.',
      );
    if (access.status !== 'authorized')
      return failure(
        403,
        'access_denied',
        'This account does not have workspace access.',
      );
    const db = await dependencies.database();
    try {
      return await handleApi(
        request,
        { ...dependencies.config, DB: db },
        undefined,
        access.userId,
      );
    } finally {
      // A cleanup failure must not turn a committed mutation into an apparent failed save.
      try {
        db.close();
      } catch {
        /* No provider errors or connection details in logs. */
      }
    }
  } catch {
    return failure(
      503,
      'service_unavailable',
      'The workspace is temporarily unavailable. Please try again.',
    );
  }
}
