import type { RunTelemetry } from './product.ts';

export const JOB_STATUSES = [
  'all',
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const;
export const JOB_KINDS = ['all', 'scoring', 'coaching'] as const;
export type JobStatusFilter = (typeof JOB_STATUSES)[number];
export type JobKindFilter = (typeof JOB_KINDS)[number];

/** Bounded run metadata. Transcript, provider inputs and generated text stay off this endpoint. */
export type AnalysisJobSummary = {
  id: string;
  call_id: string;
  consultation_title: string;
  status: Exclude<JobStatusFilter, 'all'>;
  kind: Exclude<JobKindFilter, 'all'>;
  error_code: string | null;
  can_cancel: boolean;
  telemetry: RunTelemetry | null;
  created_at: string;
};
export type AnalysisJobPage = {
  jobs: AnalysisJobSummary[];
  limit: number;
  has_more: boolean;
  next_cursor: string | null;
};
