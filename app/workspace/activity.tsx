'use client';
import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Activity,
  ArrowUpRight,
  CheckCheck,
  Clock3,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShineBorder } from '@/components/magicui/shine-border';
import {
  filterActivity,
  recoveryMessage,
  type ActivityFilter,
} from '@/lib/activity';
import { api } from '@/lib/api';
import type { WorkspaceData } from '@/lib/product';
export function AnalysisActivity({
  data,
  reload,
  openCall,
  openLibrary,
}: {
  data: WorkspaceData;
  reload: () => Promise<void>;
  openCall: (id: string) => void;
  openLibrary: () => void;
}) {
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const reduced = useReducedMotion();
  const jobs = filterActivity(data, filter, query);
  const count = (status: string) =>
    data.jobs.filter((job) => job.status === status).length;
  return (
    <motion.section
      initial={false}
      animate={{ opacity: 1 }}
      className="space-y-6"
      aria-label="Analysis activity"
    >
      <div className="relative overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 p-6 text-white sm:p-8">
        <ShineBorder aria-hidden="true" shineColor={['#38bdf8', '#818cf8']} />
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-xl">
            <div className="mb-4 flex items-center gap-2 text-sm font-medium text-sky-300">
              <Activity size={18} /> ANALYSIS ACTIVITY
            </div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Every run, a clear next step.
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-300">
              Inspect processing, review saved results and recover from
              failures. Run history is scoped to your private workspace.
            </p>
          </div>
          <Button
            variant="secondary"
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              setError('');
              try {
                await reload();
              } catch {
                setError(
                  'Could not refresh activity. Showing the last loaded runs. Check your connection and try again.',
                );
              } finally {
                setRefreshing(false);
              }
            }}
          >
            <RefreshCw
              size={16}
              className={refreshing && !reduced ? 'animate-spin' : ''}
            />
            {refreshing ? 'Refreshing…' : 'Refresh activity'}
          </Button>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            {
              label: 'In progress',
              value: count('running') + count('queued'),
              icon: Clock3,
            },
            { label: 'Completed', value: count('completed'), icon: CheckCheck },
            {
              label: 'Needs attention',
              value: count('failed'),
              icon: TriangleAlert,
            },
          ].map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="rounded-xl border border-white/15 bg-white/5 p-4"
            >
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Icon size={16} />
                {label}
              </div>
              <div className="mt-2 text-3xl font-semibold tabular-nums">
                {value}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-slate-400">
          Counts cover the latest {data.jobs.length} loaded runs, up to 20.
          Refresh to check for changes. Queued runs require a configured
          background worker; closing this page does not cancel them.
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <fieldset
          aria-label="Filter analysis status"
          className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1"
        >
          {(
            [
              'all',
              'queued',
              'running',
              'completed',
              'failed',
              'cancelled',
            ] as const
          ).map((value) => (
            <Button
              key={value}
              variant={filter === value ? 'default' : 'ghost'}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value === 'all'
                ? 'All runs'
                : value === 'running'
                  ? 'In progress'
                  : value === 'failed'
                    ? 'Failed'
                    : value === 'queued'
                      ? 'Queued'
                      : value === 'cancelled'
                        ? 'Cancelled'
                        : 'Completed'}
            </Button>
          ))}
        </fieldset>
        <div className="relative w-full sm:w-72">
          <Search
            aria-hidden="true"
            size={16}
            className="absolute left-3 top-3 text-slate-500"
          />
          <Input
            className="pl-9"
            aria-label="Search analysis runs"
            placeholder="Search consultation, run or error…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      <div className="space-y-3" aria-live="polite">
        {jobs.map((job) => {
          const call = data.calls.find((call) => call.id === job.call_id);
          return (
            <motion.article
              key={job.id}
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-500">
                    {job.kind === 'scoring'
                      ? 'Assessment'
                      : 'Grounded coaching'}{' '}
                    · {new Date(job.created_at).toLocaleString()}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-950">
                    {call?.title ?? 'Consultation outside loaded list'}
                  </h3>
                  <p className="mt-2 break-all font-mono text-xs text-slate-500">
                    {job.id}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-medium ${job.status === 'completed' ? 'bg-emerald-50 text-emerald-800' : job.status === 'failed' ? 'bg-amber-50 text-amber-900' : 'bg-sky-50 text-sky-800'}`}
                >
                  {job.status === 'running'
                    ? 'In progress'
                    : job.status === 'completed'
                      ? 'Completed'
                      : job.status === 'failed'
                        ? 'Failed'
                        : job.status}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
                <span>
                  Analysis:{' '}
                  {job.telemetry
                    ? `${(job.telemetry.total_ms / 1000).toFixed(2)}s`
                    : 'Not recorded'}
                </span>
                <span>
                  Model:{' '}
                  {job.telemetry?.model_ms == null
                    ? 'Not recorded'
                    : `${(job.telemetry.model_ms / 1000).toFixed(2)}s`}
                </span>
                <span>
                  Output tokens:{' '}
                  {job.telemetry?.output_tokens?.toLocaleString() ??
                    'Not reported'}
                </span>
              </div>
              {job.status === 'cancelled' && (
                <p className="mt-3 text-sm text-slate-600">
                  Cancelled. An already dispatched provider request may still
                  incur usage.
                </p>
              )}
              {job.status === 'failed' && (
                <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm leading-relaxed text-amber-950">
                  <strong className="block">
                    {job.error_code ?? 'Analysis failed'}
                  </strong>
                  {recoveryMessage(job.error_code)}
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => openCall(job.call_id)}>
                  Open consultation <ArrowUpRight size={15} />
                </Button>
                {(job.status === 'queued' || job.status === 'running') &&
                  data.access.role !== 'viewer' && (
                    <Button
                      variant="outline"
                      disabled={refreshing}
                      onClick={async () => {
                        setRefreshing(true);
                        setError('');
                        try {
                          await api(`jobs/${job.id}/cancel`, 'POST', {});
                          await reload();
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : 'Could not cancel the run.',
                          );
                        } finally {
                          setRefreshing(false);
                        }
                      }}
                    >
                      Cancel run
                    </Button>
                  )}
                {job.status === 'failed' && (
                  <Button variant="ghost" onClick={openLibrary}>
                    Browse approved guidance
                  </Button>
                )}
              </div>
            </motion.article>
          );
        })}
        {!jobs.length && (
          <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center">
            <ShieldCheck className="mx-auto mb-3 text-slate-400" />
            <h3 className="font-semibold">
              {data.jobs.length ? 'No matching runs' : 'No analysis runs yet'}
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              {data.jobs.length
                ? 'Try another search or status filter.'
                : 'Run an assessment or coaching request from a consultation. Manual review is available without a model account.'}
            </p>
          </div>
        )}
      </div>
    </motion.section>
  );
}
