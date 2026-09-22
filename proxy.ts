import { clerkMiddleware } from '@clerk/nextjs/server';
import {
  NextResponse,
  type NextRequest,
  type NextFetchEvent,
} from 'next/server';
import { authConfigured } from './server/access';
const clerk = clerkMiddleware();
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!authConfigured(process.env)) return NextResponse.next();
  return clerk(request, event);
}
export const config = { matcher: ['/((?!_next|.*\\..*).*)', '/api/(.*)'] };
