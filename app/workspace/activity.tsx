'use client';
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
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
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { ShineBorder } from '@/components/magicui/shine-border';
import { cancellationResult, recoveryMessage } from '@/lib/activity';
import { api, ApiError } from '@/lib/api';
import {
  JOB_STATUSES,
  type AnalysisJobPage,
  type JobStatusFilter,
  type JobKindFilter,
} from '@/lib/job-query';
import type { WorkspaceData } from '@/lib/product';

const statusLabel = {
  all: 'All statuses',
  queued: 'Queued',
  running: 'In progress',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

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
  const [status, setStatus] = useState<JobStatusFilter>('all');
  const [kind, setKind] = useState<JobKindFilter>('all');
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    request: string;
    page: AnalysisJobPage | null;
    error: string;
  } | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [mutationMessage, setMutationMessage] = useState('');
  const [uncertainRuns, setUncertainRuns] = useState<string[]>([]);
  const alive = useRef(true);
  const mutationLock = useRef(false);
  const reduced = useReducedMotion();
  const cursor = cursors.at(-1) ?? null;
  const key = JSON.stringify([data.workspace.id, status, kind, q, cursor]);
  // Existing workspace polling also updates this history when current jobs change.
  const jobVersion = JSON.stringify(
    data.jobs.map((job) => [job.id, job.status, job.error_code, job.telemetry]),
  );
  const request = JSON.stringify([key, refresh, jobVersion]);
  const current = result?.key === key ? result : null;
  const page = current?.page;
  const loading = current?.request !== request;
  const jobs = page?.jobs ?? [];
  const count = (value: string) =>
    jobs.filter((job) => job.status === value).length;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const params = new URLSearchParams({ status, kind, q, limit: '25' });
    if (cursor) params.set('cursor', cursor);
    const send: typeof fetch = (input, init) =>
      fetch(input, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([controller.signal, init.signal])
          : controller.signal,
      });
    void api<AnalysisJobPage>(`jobs?${params}`, 'GET', undefined, send).then(
      (nextPage) => {
        if (active) {
          setResult({ key, request, page: nextPage, error: '' });
          setUncertainRuns((ids) =>
            ids.filter((id) => {
              const job = nextPage.jobs.find((item) => item.id === id);
              return !job;
            }),
          );
        }
      },
      (error: unknown) => {
        if (active)
          setResult((previous) => ({
            key,
            request,
            page: previous?.key === key ? previous.page : null,
            error:
              error instanceof ApiError
                ? error.message
                : 'Could not load analysis history. Refresh to try again.',
          }));
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [status, kind, q, cursor, key, request]);

  const refreshPage = () => {
    setRefresh((value) => value + 1);
    setMutationMessage('');
  };
  const cancel = async (id: string) => {
    if (mutationLock.current) return;
    mutationLock.current = true;
    setCancelling(id);
    setMutationMessage('');
    try {
      const response = await api(`jobs/${id}/cancel`, 'POST', {});
      if (!alive.current) return;
      const outcome = cancellationResult(response, id);
      if (outcome.uncertain)
        setUncertainRuns((ids) => [...new Set([...ids, id])]);
      setRefresh((value) => value + 1);
      setMutationMessage(outcome.message);
      try {
        await reload();
      } catch {
        if (alive.current)
          setMutationMessage(
            `${outcome.message} The workspace summary could not refresh; refresh activity to check current status.`,
          );
      }
    } catch (error) {
      if (!alive.current) return;
      if (
        error instanceof ApiError &&
        (error.code === 'network' || error.code === 'invalid_response')
      ) {
        setUncertainRuns((ids) => [...new Set([...ids, id])]);
      }
      setMutationMessage(
        error instanceof Error
          ? error.message
          : 'Could not cancel the run. Refresh to check its status.',
      );
    } finally {
      mutationLock.current = false;
      if (alive.current) setCancelling(null);
    }
  };

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
              Analysis history, with clear next steps.
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-300">
              Search analysis history across your workspace, inspect saved
              measurements and recover from failures.
            </p>
          </div>
          <Button variant="secondary" disabled={loading} onClick={refreshPage}>
            <RefreshCw
              size={16}
              className={loading && !reduced ? 'animate-spin' : ''}
            />
            {loading ? 'Refreshing…' : 'Refresh activity'}
          </Button>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            {
              label: 'In progress on this page',
              value: count('running') + count('queued'),
              icon: Clock3,
            },
            {
              label: 'Completed on this page',
              value: count('completed'),
              icon: CheckCheck,
            },
            {
              label: 'Failed on this page',
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
                {page ? value : '—'}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm leading-relaxed text-slate-400">
          Newest runs first, up to 25 per page. Queued runs require a configured
          background worker; closing this page does not cancel them.
        </p>
      </div>

      <section
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"
        aria-label="Analysis history filters"
      >
        <fieldset
          aria-label="Filter analysis status"
          className="flex flex-wrap gap-2"
        >
          {JOB_STATUSES.map((value) => (
            <Button
              key={value}
              variant={status === value ? 'default' : 'outline'}
              aria-pressed={status === value}
              onClick={() => {
                setStatus(value);
                setCursors([null]);
              }}
            >
              {statusLabel[value]}
            </Button>
          ))}
        </fieldset>
        <form
          className="grid items-end gap-3 sm:grid-cols-[1fr_12rem_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            setQ(draft.trim());
            setCursors([null]);
            setRefresh((value) => value + 1);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="activity-search">Consultation title</Label>
            <Input
              id="activity-search"
              placeholder="Search all consultation titles…"
              value={draft}
              maxLength={200}
              onChange={(event) => setDraft(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="activity-kind">Analysis type</Label>
            <NativeSelect
              id="activity-kind"
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as JobKindFilter);
                setCursors([null]);
              }}
            >
              <NativeSelectOption value="all">
                All analysis types
              </NativeSelectOption>
              <NativeSelectOption value="scoring">
                Assessment
              </NativeSelectOption>
              <NativeSelectOption value="coaching">
                Grounded coaching
              </NativeSelectOption>
            </NativeSelect>
          </div>
          <Button type="submit">
            <Search /> Search
          </Button>
        </form>
        {(q || status !== 'all' || kind !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft('');
              setQ('');
              setStatus('all');
              setKind('all');
              setCursors([null]);
            }}
          >
            Reset filters
          </Button>
        )}
      </section>

      {current?.error && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          <p>
            {current.error}{' '}
            {page &&
              'The last loaded page is still shown; statuses may have changed.'}
          </p>
          <Button
            variant="outline"
            className="mt-3"
            onClick={refreshPage}
            disabled={loading}
          >
            Retry this page
          </Button>
          {cursor && (
            <Button
              variant="ghost"
              className="mt-3 ml-2"
              disabled={loading}
              onClick={() => {
                setCursors([null]);
                setRefresh((value) => value + 1);
              }}
            >
              Return to newest runs
            </Button>
          )}
        </div>
      )}
      {mutationMessage && (
        <output className="block rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
          {mutationMessage}
        </output>
      )}
      {loading && (
        <output className="block text-sm text-slate-500">
          {page ? 'Refreshing this page…' : 'Loading analysis history…'}
        </output>
      )}

      <div className="space-y-3" aria-busy={loading}>
        {jobs.map((job) => (
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
                  {job.kind === 'scoring' ? 'Assessment' : 'Grounded coaching'}{' '}
                  · {new Date(job.created_at).toLocaleString()}
                </p>
                <h3 className="mt-1 break-words text-lg font-semibold text-slate-950">
                  {job.consultation_title}
                </h3>
                <p className="mt-2 break-all font-mono text-xs text-slate-500">
                  {job.id}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium ${job.status === 'completed' ? 'bg-emerald-50 text-emerald-800' : job.status === 'failed' ? 'bg-amber-50 text-amber-900' : job.status === 'cancelled' ? 'bg-slate-100 text-slate-700' : 'bg-sky-50 text-sky-800'}`}
              >
                {statusLabel[job.status]}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600 sm:grid-cols-3 lg:grid-cols-5">
              {[
                [
                  'Analysis',
                  job.telemetry
                    ? `${(job.telemetry.total_ms / 1000).toFixed(2)}s`
                    : 'Not recorded',
                ],
                [
                  'Model',
                  job.telemetry?.model_ms == null
                    ? 'Not recorded'
                    : `${(job.telemetry.model_ms / 1000).toFixed(2)}s`,
                ],
                [
                  'Validate and save',
                  job.telemetry?.validation_save_ms == null
                    ? 'Not recorded'
                    : `${(job.telemetry.validation_save_ms / 1000).toFixed(2)}s`,
                ],
                [
                  'Input tokens',
                  job.telemetry?.input_tokens?.toLocaleString() ??
                    'Not reported',
                ],
                [
                  'Output tokens',
                  job.telemetry?.output_tokens?.toLocaleString() ??
                    'Not reported',
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="mt-1 font-medium tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
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
            {uncertainRuns.includes(job.id) && (
              <p className="mt-3 text-sm text-amber-900">
                Cancellation could not be confirmed. Refresh and inspect this
                run before taking another action.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => openCall(job.call_id)}>
                Open consultation <ArrowUpRight size={15} />
              </Button>
              {job.can_cancel && (
                <Button
                  variant="outline"
                  disabled={
                    !!cancelling ||
                    loading ||
                    !!current?.error ||
                    uncertainRuns.includes(job.id)
                  }
                  onClick={() => void cancel(job.id)}
                >
                  {cancelling === job.id ? 'Cancelling…' : 'Cancel run'}
                </Button>
              )}
              {job.status === 'failed' && (
                <Button variant="ghost" onClick={openLibrary}>
                  Browse approved guidance
                </Button>
              )}
            </div>
          </motion.article>
        ))}
        {page && !jobs.length && (
          <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center">
            <ShieldCheck className="mx-auto mb-3 text-slate-400" />
            <h3 className="font-semibold">
              {q || status !== 'all' || kind !== 'all' || cursor
                ? 'No matching runs on this page'
                : 'No analysis runs yet'}
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              {q || status !== 'all' || kind !== 'all' || cursor
                ? 'Try another filter or return to the first page. Team changes can move runs out of these results.'
                : 'Run an assessment or coaching request from a consultation. Manual review is available without a model account.'}
            </p>
          </div>
        )}
      </div>
      {page && (
        <footer className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-4">
          <div className="text-sm text-slate-600">
            <p aria-live="polite" className="font-medium">
              Page {cursors.length} · {jobs.length} runs shown
              {page.has_more ? ' · More available' : ''}
            </p>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500">
              Filters search all workspace history. Statuses may change between
              pages. Return to the newest page to reconcile new runs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {cursors.length > 1 && (
              <Button
                variant="ghost"
                disabled={loading}
                onClick={() => {
                  setCursors([null]);
                  setRefresh((value) => value + 1);
                }}
              >
                Newest
              </Button>
            )}
            <Button
              variant="outline"
              disabled={loading || cursors.length === 1}
              onClick={() => setCursors((values) => values.slice(0, -1))}
            >
              <ArrowLeft />
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={loading || !page.has_more || !page.next_cursor}
              onClick={() => {
                if (page.next_cursor)
                  setCursors((values) => [...values, page.next_cursor]);
              }}
            >
              Next
              <ArrowRight />
            </Button>
          </div>
        </footer>
      )}
    </motion.section>
  );
}
