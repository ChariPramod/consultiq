import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

/** Never follows redirects with credentials or emits response bodies/session tokens. */
export async function verifyHosted(env, fetcher = fetch) {
  const base = new URL(
    env.HOSTED_BASE_URL ?? 'https://consultiq-ecru.vercel.app',
  );
  if (
    base.protocol !== 'https:' ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== '/'
  )
    throw new Error('Expected an HTTPS origin.');
  const checks = [];
  const request = async (path, headers = {}) => {
    try {
      return await fetcher(new URL(path, base), {
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
        cache: 'no-store',
      });
    } catch {
      return null;
    }
  };
  const landing = await request('/');
  checks.push({
    name: 'public-page',
    status:
      landing?.status === 200 &&
      landing.headers.get('content-type')?.includes('text/html')
        ? 'pass'
        : 'fail',
  });
  await landing?.body?.cancel();
  const unauth = await request('/api/workspace');
  checks.push({
    name: 'unauthenticated-denied',
    status: unauth?.status === 401 ? 'pass' : 'fail',
  });
  await unauth?.body?.cancel();
  const spoof = await request('/api/workspace', {
    'oai-authenticated-user-id': 'user_spoofed',
  });
  checks.push({
    name: 'spoofed-identity-denied',
    status: spoof?.status === 401 ? 'pass' : 'fail',
  });
  await spoof?.body?.cancel();
  if (env.HOSTED_SESSION_TOKEN?.trim()) {
    const authenticated = await request('/api/workspace', {
      Authorization: `Bearer ${env.HOSTED_SESSION_TOKEN.trim()}`,
    });
    checks.push({
      name: 'authenticated-workspace',
      status:
        authenticated?.status === 200 &&
        authenticated.headers.get('content-type')?.includes('application/json')
          ? 'pass'
          : 'fail',
    });
    await authenticated?.body?.cancel();
  } else
    checks.push({ name: 'authenticated-workspace', status: 'not-verified' });
  return { ok: checks.every((check) => check.status === 'pass'), checks };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const result = await verifyHosted(process.env);
    for (const check of result.checks)
      console.log(`${check.status.toUpperCase()} ${check.name}`);
    console.log(
      'This smoke check does not certify save/reload, cross-user isolation, provider quality, or backup recovery.',
    );
    process.exitCode = result.ok ? 0 : 1;
  } catch {
    console.error(
      'Hosted verification failed; use an HTTPS origin. No response bodies or credentials are logged.',
    );
    process.exitCode = 1;
  }
}
