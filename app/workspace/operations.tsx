'use client';
import { useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

type OperationsSnapshot = {
  queued: number;
  running: number;
  expired_leases: number;
  failed_last_day: number;
  oldest_queued_at: string | null;
  last_started_at: string | null;
};
function timestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'None recorded';
}
export function Operations() {
  const [snapshot, setSnapshot] = useState<OperationsSnapshot | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <section
      className="product-panel settings-section"
      aria-labelledby="operations-heading"
    >
      <div className="product-panel-heading">
        <div>
          <h2 id="operations-heading">Operations</h2>
          <p>
            Queue totals across this workspace, including runs outside the
            activity list.
          </p>
        </div>
        <Activity size={20} />
      </div>
      <Button
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            const result = await api<OperationsSnapshot>('operations');
            setSnapshot(result);
            setLoadedAt(new Date().toLocaleString());
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : 'Could not load operations. Refresh to try again.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <RefreshCw size={16} /> {busy ? 'Refreshing…' : 'Refresh operations'}
      </Button>
      {error && (
        <p role="alert" className="mt-4 text-sm text-amber-800">
          {error}
          {snapshot ? ' Showing the last loaded snapshot.' : ''}
        </p>
      )}
      {snapshot ? (
        <div className="mt-5 space-y-4">
          <dl className="grid grid-cols-2 gap-3">
            {[
              ['Queued', snapshot.queued],
              ['Running', snapshot.running],
              ['Expired processing leases', snapshot.expired_leases],
              ['Failed in last 24 hours', snapshot.failed_last_day],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-slate-50 p-4">
                <dt className="text-sm text-slate-600">{label}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="font-medium">Oldest queued run</dt>
              <dd className="text-slate-600">
                {timestamp(snapshot.oldest_queued_at)}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Last run started</dt>
              <dd className="text-slate-600">
                {timestamp(snapshot.last_started_at)}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-slate-500">
            Snapshot loaded {loadedAt}. Refresh manually to check for changes.
          </p>
          {(snapshot.queued > 0 || snapshot.expired_leases > 0) && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
              An old queue or expired processing leases can indicate an absent
              or interrupted worker. Check the worker configuration and logs
              before submitting another analysis request.
            </p>
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">
          Refresh to load operational counts. No records have been checked yet.
        </p>
      )}
      <p className="mt-4 text-sm text-slate-500">
        Last run started is historical activity, not a worker heartbeat. These
        counts do not verify that a worker is currently available.
      </p>
    </section>
  );
}
