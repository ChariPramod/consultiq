import type { ModelUsage } from './model.ts';
export type { RunTelemetry as AnalysisTelemetry } from '../lib/product.ts';
import type { RunTelemetry as AnalysisTelemetry } from '../lib/product.ts';
// Measures admitted work only. Trace delivery and final job persistence are excluded.
export class RunTelemetry {
  private readonly started = performance.now();
  private stopped: number | null = null;
  private readonly data: AnalysisTelemetry = {
    schema_version: 1,
    total_ms: 0,
    model_ms: null,
    validation_save_ms: null,
    input_tokens: null,
    output_tokens: null,
  };
  readonly recordUsage = (usage: ModelUsage) => {
    for (const field of ['input_tokens', 'output_tokens'] as const) {
      const value = usage[field];
      this.data[field] =
        typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
          ? value
          : null;
    }
  };
  async measure<T>(
    stage: 'model_ms' | 'validation_save_ms',
    run: () => Promise<T>,
  ): Promise<T> {
    const start = performance.now();
    try {
      return await run();
    } finally {
      this.data[stage] = Math.max(0, performance.now() - start);
    }
  }
  async run<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } finally {
      this.stopped = performance.now();
    }
  }
  snapshot(): AnalysisTelemetry {
    return {
      ...this.data,
      total_ms: Math.max(0, (this.stopped ?? performance.now()) - this.started),
    };
  }
}
