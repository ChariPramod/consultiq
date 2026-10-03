import type { RunTelemetry } from './product.ts';

/** Legacy/malformed telemetry is unavailable, never trusted as arbitrary JSON. */
export function parseRunTelemetry(raw: string | null): RunTelemetry | null {
  if (!raw || raw.length > 4096) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    const data = value as Record<string, unknown>;
    const duration = (v: unknown): v is number =>
      typeof v === 'number' && Number.isFinite(v) && v >= 0;
    const tokens = (v: unknown): v is number | null =>
      v === null ||
      (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0);
    if (
      data.schema_version !== 1 ||
      !duration(data.total_ms) ||
      !(data.model_ms === null || duration(data.model_ms)) ||
      !(
        data.validation_save_ms === null || duration(data.validation_save_ms)
      ) ||
      !tokens(data.input_tokens) ||
      !tokens(data.output_tokens)
    )
      return null;
    return {
      schema_version: 1,
      total_ms: data.total_ms,
      model_ms: data.model_ms,
      validation_save_ms: data.validation_save_ms,
      input_tokens: data.input_tokens,
      output_tokens: data.output_tokens,
    };
  } catch {
    return null;
  }
}
