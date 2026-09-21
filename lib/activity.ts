import type { WorkspaceData } from './product.ts';
export type ActivityFilter = 'all' | 'running' | 'completed' | 'failed';
export function filterActivity(
  data: Pick<WorkspaceData, 'jobs' | 'calls'>,
  filter: ActivityFilter,
  query: string,
) {
  const term = query.trim().toLowerCase();
  const calls = new Map(data.calls.map((call) => [call.id, call]));
  return data.jobs.filter(
    (job) =>
      (filter === 'all' || job.status === filter) &&
      [
        job.id,
        job.kind,
        job.error_code ?? '',
        calls.get(job.call_id)?.title ?? '',
        calls.get(job.call_id)?.coordinator ?? '',
      ].some((value) => value.toLowerCase().includes(term)),
  );
}
export function recoveryMessage(code: string | null) {
  if (code === 'interrupted')
    return 'This request was interrupted. Open the consultation to check saved results before starting another run.';
  if (code === 'review_conflict')
    return 'A newer review or job state prevented this save. Open the latest review before making changes.';
  if (code === 'coaching_context_changed')
    return 'The consultation, approved sources or job state changed. Check the current material before requesting coaching again.';
  if (code === 'unsupported_coaching' || code === 'provider_output_invalid')
    return 'The answer could not be validated. Review the transcript manually or consult approved library material.';
  return 'Open the consultation and check saved results. Manual review remains available; another AI request may incur usage.';
}
