import { createDatabase } from '@/server/database';
import { processNextJob } from '@/server/queue';
import { workerAuthorized } from '@/server/worker-auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;
async function run(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (
    !workerAuthorized(
      request.headers.get('authorization'),
      process.env.CRON_SECRET,
    )
  )
    return Response.json({ error: 'unauthorized' }, { status: 401, headers });
  try {
    const db = await createDatabase(process.env);
    try {
      return Response.json(
        await processNextJob(db, {
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
          AI_MODEL: process.env.AI_MODEL,
          LANGSMITH_API_KEY: process.env.LANGSMITH_API_KEY,
          LANGSMITH_PROJECT: process.env.LANGSMITH_PROJECT,
          LANGSMITH_ENDPOINT: process.env.LANGSMITH_ENDPOINT,
          LANGSMITH_TRACING: process.env.LANGSMITH_TRACING,
          CONSULTIQ_ALLOWED_USER_IDS: process.env.CONSULTIQ_ALLOWED_USER_IDS,
        }),
        { headers },
      );
    } finally {
      try {
        db.close();
      } catch {
        /* Preserve completed result. */
      }
    }
  } catch {
    return Response.json(
      { error: 'worker_unavailable' },
      { status: 503, headers },
    );
  }
}
export { run as POST, run as GET };
