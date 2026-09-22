import { serveApi } from '@/server/runtime';
import { sessionAccess } from '@/server/session';
import { createDatabase } from '@/server/database';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;
const handle = (request: Request) =>
  serveApi(request, {
    session: sessionAccess,
    database: () => createDatabase(process.env),
    config: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      AI_MODEL: process.env.AI_MODEL,
      LANGSMITH_API_KEY: process.env.LANGSMITH_API_KEY,
      LANGSMITH_PROJECT: process.env.LANGSMITH_PROJECT,
      LANGSMITH_ENDPOINT: process.env.LANGSMITH_ENDPOINT,
      LANGSMITH_TRACING: process.env.LANGSMITH_TRACING,
      MAX_AI_RUNS_PER_DAY: process.env.MAX_AI_RUNS_PER_DAY,
    },
  });
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
