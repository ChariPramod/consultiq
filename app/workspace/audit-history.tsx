'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, History, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { api, ApiError } from '@/lib/api';
import {
  AUDIT_ACTIONS,
  auditActionLabel,
  type AuditActionFilter,
  type AuditEventPage,
} from '@/lib/audit-query';

export function AuditHistory({ workspaceId }: { workspaceId: string }) {
  const [action, setAction] = useState<AuditActionFilter>('all');
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    request: string;
    page: AuditEventPage | null;
    error: string;
  } | null>(null);
  const cursor = cursors.at(-1) ?? null;
  const key = JSON.stringify([workspaceId, action, cursor]);
  const request = JSON.stringify([key, refresh]);
  const current = result?.key === key ? result : null;
  const page = current?.page;
  const loading = current?.request !== request;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const params = new URLSearchParams({ action, limit: '25' });
    if (cursor) params.set('cursor', cursor);
    const send: typeof fetch = (input, init) =>
      fetch(input, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([controller.signal, init.signal])
          : controller.signal,
      });
    void api<AuditEventPage>(
      `audit-events?${params}`,
      'GET',
      undefined,
      send,
    ).then(
      (nextPage) => {
        if (active) setResult({ key, request, page: nextPage, error: '' });
      },
      (error: unknown) => {
        if (active)
          setResult((previous) => ({
            key,
            request,
            page:
              error instanceof ApiError && [401, 403].includes(error.status)
                ? null
                : previous?.key === key
                  ? previous.page
                  : null,
            error:
              error instanceof ApiError
                ? error.message
                : 'Could not load audit history. Refresh to try again.',
          }));
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [action, cursor, key, request]);

  function newest() {
    setCursors([null]);
    setRefresh((value) => value + 1);
  }

  return (
    <section
      className="product-panel settings-section"
      aria-labelledby="audit-history-heading"
    >
      <div className="product-panel-heading">
        <div>
          <h2 id="audit-history-heading">Workspace audit history</h2>
          <p>Recorded changes and the acting member. Owner access only.</p>
        </div>
        <History size={20} />
      </div>
      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="w-full min-w-0 space-y-2 sm:max-w-sm sm:flex-1">
            <Label htmlFor="audit-action">Recorded action</Label>
            <NativeSelect
              id="audit-action"
              className="w-full"
              value={action}
              onChange={(event) => {
                setAction(event.target.value as AuditActionFilter);
                setCursors([null]);
              }}
            >
              <NativeSelectOption value="all">
                All recorded actions
              </NativeSelectOption>
              {AUDIT_ACTIONS.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {auditActionLabel(value)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <Button
            variant="outline"
            className="self-start sm:self-auto"
            disabled={loading}
            onClick={() => setRefresh((value) => value + 1)}
          >
            <RefreshCw size={16} />
            Refresh audit history
          </Button>
        </div>
        {current?.error && (
          <div
            role="alert"
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
          >
            <p>
              {current.error}
              {page
                ? ' The last loaded page remains below; newer events may be missing.'
                : ''}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={loading}
                onClick={() => setRefresh((value) => value + 1)}
              >
                Retry audit page
              </Button>
              {cursor && (
                <Button variant="ghost" disabled={loading} onClick={newest}>
                  Return to newest events
                </Button>
              )}
            </div>
          </div>
        )}
        {loading && (
          <output className="block text-sm text-slate-500">
            {page ? 'Refreshing this audit page…' : 'Loading audit history…'}
          </output>
        )}
        <div aria-busy={loading}>
          {page?.events.length ? (
            <ol className="divide-y divide-slate-200">
              {page.events.map((event) => (
                <li key={event.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-950">
                      {auditActionLabel(event.action)}
                    </h3>
                    <time
                      className="text-xs text-slate-500"
                      dateTime={event.created_at}
                    >
                      {new Date(event.created_at).toLocaleString()}
                    </time>
                  </div>
                  <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                    <div className="min-w-0">
                      <dt className="text-slate-500">Acting member ID</dt>
                      <dd
                        className={`mt-1 break-all ${event.actor_id ? 'font-mono text-slate-700' : 'text-slate-500'}`}
                      >
                        {event.actor_id || 'Not recorded'}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-slate-500">Recorded entity ID</dt>
                      <dd className="mt-1 break-all font-mono text-slate-700">
                        {event.entity_id}
                      </dd>
                    </div>
                  </dl>
                  <details className="mt-3 text-xs text-slate-500">
                    <summary className="cursor-pointer">
                      Inspect event metadata
                    </summary>
                    <dl className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3">
                      <div>
                        <dt>Event ID</dt>
                        <dd className="mt-1 break-all font-mono">{event.id}</dd>
                      </div>
                      <div>
                        <dt>Action code</dt>
                        <dd className="mt-1 break-all font-mono">
                          {event.action}
                        </dd>
                      </div>
                      <div>
                        <dt>Recorded at (UTC)</dt>
                        <dd className="mt-1 break-all font-mono">
                          {event.created_at}
                        </dd>
                      </div>
                    </dl>
                  </details>
                </li>
              ))}
            </ol>
          ) : page ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-5 py-8 text-center">
              <History className="mx-auto mb-3 text-slate-400" size={22} />
              <h3 className="text-sm font-semibold">
                {action === 'all' && !cursor
                  ? 'No audit events yet'
                  : 'No matching events on this page'}
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                {action === 'all' && !cursor
                  ? 'Recorded workspace changes will appear here.'
                  : 'Choose another action or return to the newest events.'}
              </p>
            </div>
          ) : null}
        </div>
        {page && (
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <p aria-live="polite" className="text-sm text-slate-600">
              Page {cursors.length} · {page.events.length}{' '}
              {page.events.length === 1 ? 'event' : 'events'} shown
              {page.has_more ? ' · More available' : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" disabled={loading} onClick={newest}>
                Newest events
              </Button>
              <Button
                variant="outline"
                disabled={loading || cursors.length === 1}
                onClick={() => setCursors((values) => values.slice(0, -1))}
              >
                <ArrowLeft size={16} /> Previous
              </Button>
              <Button
                variant="outline"
                disabled={loading || !page.has_more || !page.next_cursor}
                onClick={() => {
                  if (page.next_cursor)
                    setCursors((values) =>
                      values.at(-1) === cursor
                        ? [...values, page.next_cursor]
                        : values,
                    );
                }}
              >
                Next <ArrowRight size={16} />
              </Button>
            </div>
          </footer>
        )}
        <p className="text-xs leading-relaxed text-slate-500">
          Events contain metadata only and may reference records that have since
          been deleted. Missing actor IDs on older records are shown as not
          recorded. This history does not record every read, sign-in or failure.
          Refresh the newest page to see new events.
        </p>
      </div>
    </section>
  );
}
