import { clerkMiddleware } from '@clerk/nextjs/server';
import {
  NextResponse,
  type NextRequest,
  type NextFetchEvent,
} from 'next/server';
import { authConfigured } from './server/access';
const clerk = clerkMiddleware();
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  // Dispatcher has its own exact server-secret boundary; it is not a Clerk session.
  if (request.nextUrl.pathname === '/api/internal/worker')
    return NextResponse.next();
  if (!authConfigured(process.env)) return NextResponse.next();
  return clerk(request, event);
}
export const config = { matcher: ['/((?!_next|.*\\..*).*)', '/api/(.*)'] };
