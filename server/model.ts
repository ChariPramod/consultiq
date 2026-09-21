import { AppError } from './repository.ts';
import { configuration, type RuntimeConfig } from './config.ts';
export type ModelUsage = {
  input_tokens: number | null;
  output_tokens: number | null;
};
export type ModelCall = (
  system: string,
  input: unknown,
  onUsage?: (usage: ModelUsage) => void,
) => Promise<unknown>;
function tokenCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}
export function modelClient(
  env: RuntimeConfig,
  send: typeof fetch = fetch,
): ModelCall {
  return async (system, input, onUsage) => {
    if (!configuration(env).scoring)
      throw new AppError(
        503,
        'provider_not_configured',
        'Automated analysis is not enabled. Configure the model provider first.',
      );
    let response: Response;
    try {
      response = await send('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': env.ANTHROPIC_API_KEY!,
        },
        body: JSON.stringify({
          model: env.AI_MODEL,
          max_tokens: 6000,
          system,
          messages: [{ role: 'user', content: JSON.stringify(input) }],
        }),
        signal: AbortSignal.timeout(45000),
      });
    } catch {
      throw new AppError(
        502,
        'provider_unavailable',
        'The analysis provider did not respond. Please retry.',
      );
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new AppError(
        502,
        'provider_error',
        'The analysis provider could not complete this request. Check the provider configuration and usage limits.',
      );
    }
    const raw = await readResponse(response);
    try {
      const body = JSON.parse(raw) as {
        stop_reason: string;
        usage?: { input_tokens?: unknown; output_tokens?: unknown };
        content: { type: string; text?: string }[];
      };
      onUsage?.({
        input_tokens: tokenCount(body?.usage?.input_tokens),
        output_tokens: tokenCount(body?.usage?.output_tokens),
      });
      if (body.stop_reason !== 'end_turn')
        throw new Error('Incomplete response');
      const text = body.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join('')
        .replace(/^```(?:json)?\s*/, '')
        .replace(/\s*```$/, '')
        .trim();
      return JSON.parse(text);
    } catch {
      throw new AppError(
        502,
        'provider_output_invalid',
        'The provider returned an incomplete or invalid assessment. No result was saved.',
      );
    }
  };
}

// Read incrementally: checking response.text().length only limits data after allocation.
async function readResponse(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader)
    throw new AppError(
      502,
      'provider_output_invalid',
      'The provider returned an empty response.',
    );
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 150000) {
        await reader.cancel().catch(() => {});
        throw new AppError(
          502,
          'provider_output_invalid',
          'The analysis response exceeded the allowed size.',
        );
      }
      parts.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    return new TextDecoder().decode(bytes);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      502,
      'provider_unavailable',
      'The analysis provider did not complete its response. Please retry.',
    );
  } finally {
    reader.releaseLock();
  }
}
