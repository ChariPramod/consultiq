import { auth } from '@clerk/nextjs/server';
import { allowedUser, authConfigured } from './access';
export async function sessionAccess() {
  if (!authConfigured(process.env))
    return { status: 'unconfigured' as const, userId: null };
  const { userId } = await auth();
  if (!userId) return { status: 'anonymous' as const, userId: null };
  if (!allowedUser(userId, process.env.CONSULTIQ_ALLOWED_USER_IDS))
    return { status: 'forbidden' as const, userId: null };
  return { status: 'authorized' as const, userId };
}
