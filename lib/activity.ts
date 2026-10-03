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

/** A successful HTTP response can describe a no-op when the worker finished first. */
export function cancellationResult(response: unknown, expectedJobId: string) {
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    const job = (response as Record<string, unknown>).job;
    if (job === null)
      return {
        uncertain: false,
        message:
          'This run is no longer available. Refresh activity to reconcile removed records.',
      };
    if (job && typeof job === 'object' && !Array.isArray(job)) {
      const row = job as Record<string, unknown>;
      if (row.id === expectedJobId) {
        if (row.status === 'cancelled')
          return {
            uncertain: false,
            message: 'Cancellation saved. Refreshing the run status.',
          };
        if (row.status === 'completed')
          return {
            uncertain: false,
            message:
              'The run had already completed. Open the consultation to inspect its saved result.',
          };
        if (row.status === 'failed')
          return {
            uncertain: false,
            message:
              'The run had already failed. Refresh activity to inspect the failure.',
          };
      }
    }
  }
  return {
    uncertain: true,
    message:
      'Cancellation could not be confirmed from the response. Refresh activity to check the current status before trying again.',
  };
}
