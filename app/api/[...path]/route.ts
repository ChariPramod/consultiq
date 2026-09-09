import { env } from 'cloudflare:workers';
import { handleApi, type Runtime } from '@/server/handler';
export const dynamic = 'force-dynamic';
const handle = (request: Request) =>
  handleApi(request, env as unknown as Runtime);
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
