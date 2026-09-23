const WORKSPACE_KEY = 'consultiq.workspace';
export function selectedWorkspace(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(WORKSPACE_KEY);
  } catch {
    return null;
  }
}
export function selectWorkspace(id: string) {
  // A complete navigation clears every consultation draft and pending view.
  window.sessionStorage.setItem(WORKSPACE_KEY, id);
  window.location.assign('/workspace');
}
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export async function api<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown,
  send: typeof fetch = fetch,
): Promise<T> {
  let response: Response;
  try {
    const options: RequestInit = {
      method,
      credentials: 'same-origin',
      signal: AbortSignal.timeout(70000),
    };
    const headers: Record<string, string> = {};
    const workspace = selectedWorkspace();
    if (workspace && path !== 'workspaces' && path !== 'team/accept')
      headers['X-Workspace-Id'] = workspace;
    if (
      method === 'POST' &&
      /^consultations\/[^/]+\/(score|coaching)$/.test(path)
    )
      headers['Idempotency-Key'] = crypto.randomUUID();
    options.headers = headers;
    if (method !== 'GET' && body !== undefined) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    response = await send(`/api/${path}`, options);
  } catch {
    throw new ApiError(
      method === 'GET'
        ? 'Could not reach your workspace. Check your connection and refresh.'
        : 'The response was lost or timed out. The change may have been saved. Refresh and check before submitting again.',
      0,
      'network',
    );
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error =
      data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    throw new ApiError(
      typeof error.message === 'string'
        ? error.message
        : 'The request could not be completed.',
      response.status,
      typeof error.error === 'string' ? error.error : 'request_failed',
    );
  }
  if (data === null)
    throw new ApiError(
      method === 'GET'
        ? 'The workspace returned an unreadable response. Refresh to try again.'
        : 'The response could not be read. Check saved results before submitting again.',
      response.status,
      'invalid_response',
    );
  return data as T;
}
