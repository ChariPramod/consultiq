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
): Promise<T> {
  let response: Response;
  try {
    const options: RequestInit = { method, credentials: 'same-origin' };
    if (method !== 'GET' && body !== undefined) {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(body);
    }
    response = await fetch(`/api/${path}`, options);
  } catch {
    throw new ApiError(
      'Could not reach your workspace. Check your connection and retry.',
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
  return data as T;
}
