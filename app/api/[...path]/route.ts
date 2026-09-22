import { handleApi } from '@/server/handler';
import { sessionAccess } from '@/server/session';
import { createDatabase } from '@/server/database';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;
const failure = (status: number, code: string, message: string) =>
  Response.json(
    { error: code, message, request_id: crypto.randomUUID() },
    {
      status,
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
async function handle(request: Request) {
  try {
    const access = await sessionAccess();
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
    const db = await createDatabase({
      DATABASE_URL: process.env.DATABASE_URL,
      DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN,
      VERCEL: process.env.VERCEL,
    });
    try {
      return await handleApi(
        request,
        { ...process.env, DB: db },
        undefined,
        access.userId,
      );
    } finally {
      db.close();
    }
  } catch {
    return failure(
      503,
      'service_unavailable',
      'The workspace is temporarily unavailable. Please try again.',
    );
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
