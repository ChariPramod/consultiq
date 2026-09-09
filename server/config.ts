export type RuntimeConfig = {
  ANTHROPIC_API_KEY?: string;
  AI_MODEL?: string;
  LANGSMITH_API_KEY?: string;
  LANGSMITH_PROJECT?: string;
  LANGSMITH_ENDPOINT?: string;
  LANGSMITH_TRACING?: string;
  MAX_AI_RUNS_PER_DAY?: string;
};
export function configuration(env: RuntimeConfig) {
  return {
    scoring: !!env.ANTHROPIC_API_KEY && !!env.AI_MODEL,
    tracing: env.LANGSMITH_TRACING === 'true' && !!env.LANGSMITH_API_KEY,
    model: env.AI_MODEL || null,
  };
}
export function dailyLimit(env: RuntimeConfig) {
  const value = Number(env.MAX_AI_RUNS_PER_DAY ?? 30);
  return Number.isInteger(value) && value >= 1 && value <= 1000 ? value : 30;
}
