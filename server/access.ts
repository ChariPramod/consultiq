/** Only verified authentication-provider IDs may be passed to this boundary. */
export function authConfigured(env: Record<string, string | undefined>) {
  return Boolean(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && env.CLERK_SECRET_KEY);
}
export function allowedUser(
  userId: string | null,
  allowlist: string | undefined,
) {
  return Boolean(
    userId &&
    allowlist
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .includes(userId),
  );
}
