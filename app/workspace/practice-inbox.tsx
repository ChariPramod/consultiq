'use client';

import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  RefreshCw,
  Search,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, api } from '@/lib/api';
import { DIMENSIONS } from '@/lib/product';
import {
  practiceScoreChange,
  type PracticeInboxItem,
  type PracticeInboxPage,
  type PracticeStatus,
} from '@/lib/practice-inbox';
import { PracticeCalendar } from './practice-calendar';
import { Empty } from './components';

const statuses: { value: PracticeStatus; label: string }[] = [
  { value: 'open', label: 'Needs follow-up' },
  { value: 'completed', label: 'Completed' },
  { value: 'all', label: 'All practice' },
];
const date = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

export function PracticeInbox({
  onOpen,
}: {
  onOpen: (callId: string) => void;
}) {
  const [status, setStatus] = useState<PracticeStatus>('open');
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [coordinatorDraft, setCoordinatorDraft] = useState('');
  const [coordinator, setCoordinator] = useState('');
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    page: PracticeInboxPage | null;
    error: string;
  } | null>(null);
  const cursor = cursors.at(-1) ?? null;
  const requestKey = JSON.stringify([status, q, coordinator, cursor, refresh]);
  const current = result?.key === requestKey ? result : null;
  const page = current?.page;
  const loading = !current;

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ status, q, limit: '25' });
    if (coordinator) params.set('coordinator', coordinator);
    if (cursor) params.set('cursor', cursor);
    void api<PracticeInboxPage>(`practice?${params}`).then(
      (page) => {
        if (active) setResult({ key: requestKey, page, error: '' });
      },
      (error) => {
        if (active)
          setResult({
            key: requestKey,
            page: null,
            error:
              error instanceof ApiError
                ? error.message
                : 'Could not load practice assignments. Please refresh to try again.',
          });
      },
    );
    return () => {
      active = false;
    };
  }, [status, q, coordinator, cursor, requestKey]);

  const reload = () => {
    setCursors([null]);
    setRefresh((value) => value + 1);
  };
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-teal-50 p-3 text-teal-700">
              <Target size={22} />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Turn feedback into follow-through
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">
                Every assignment has a human-reviewed baseline. Find the next
                practice focus, then return to the consultation to record a
                reviewed follow-up.
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={reload} disabled={loading}>
            <RefreshCw />
            Refresh
          </Button>
        </div>
        <fieldset className="mt-6 flex flex-wrap gap-2">
          <legend className="sr-only">Practice status</legend>
          {statuses.map((item) => (
            <Button
              key={item.value}
              variant={status === item.value ? 'default' : 'outline'}
              aria-pressed={status === item.value}
              onClick={() => {
                setStatus(item.value);
                setCursors([null]);
              }}
            >
              {item.value === 'completed' ? (
                <CheckCircle2 />
              ) : (
                <ClipboardList />
              )}
              {item.label}
            </Button>
          ))}
        </fieldset>
        <form
          className="mt-5 grid items-end gap-3 md:grid-cols-[1fr_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            setQ(draft.trim());
            setCoordinator(coordinatorDraft);
            setCursors([null]);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="practice-search">
              Search consultations or coordinators
            </Label>
            <Input
              id="practice-search"
              placeholder="Find a practice focus…"
              value={draft}
              maxLength={200}
              onChange={(event) => setDraft(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="practice-coordinator">
              Coordinator, exact name
            </Label>
            <Input
              id="practice-coordinator"
              placeholder="Any coordinator"
              value={coordinatorDraft}
              maxLength={200}
              onChange={(event) => setCoordinatorDraft(event.target.value)}
            />
          </div>
          <Button type="submit">
            <Search />
            Search
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            Oldest assignments first. Reminder dates stay in your calendar; they
            are not assignment deadlines.
          </p>
          {(q || coordinator || status !== 'open') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft('');
                setQ('');
                setCoordinatorDraft('');
                setCoordinator('');
                setStatus('open');
                setCursors([null]);
              }}
            >
              Reset filters
            </Button>
          )}
        </div>
      </section>

      {current?.error && (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-5"
        >
          <p className="font-medium">Practice could not be loaded</p>
          <p className="mt-1 text-sm">{current.error}</p>
          <Button variant="outline" className="mt-3" onClick={reload}>
            Reload first page
          </Button>
        </div>
      )}
      {loading && (
        <output className="block rounded-2xl border bg-white p-10 text-center text-sm text-slate-500">
          Loading practice assignments…
        </output>
      )}
      {page && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm">
            <p aria-live="polite" className="font-medium text-slate-700">
              {page.total} {page.total === 1 ? 'assignment' : 'assignments'}{' '}
              match your filters
            </p>
            <span className="text-xs text-slate-500">
              Page {cursors.length} · {page.assignments.length} shown
            </span>
          </div>
          {page.assignments.length ? (
            <div className="grid items-start gap-4 xl:grid-cols-2">
              {page.assignments.map((item) => (
                <PracticeCard key={item.id} item={item} onOpen={onOpen} />
              ))}
            </div>
          ) : (
            <section className="rounded-2xl border bg-white">
              <Empty
                title={
                  status === 'open'
                    ? 'No open practice matches'
                    : 'No practice assignments match'
                }
                description={
                  q || coordinator
                    ? 'Try another consultation or coordinator, or reset your filters.'
                    : status === 'completed'
                      ? 'Completed practice appears here after a reviewer links an eligible follow-up assessment.'
                      : 'Open a consultation with a human assessment, then use Review & practice to assign a focused next step.'
                }
              />
            </section>
          )}
          <footer className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-4">
            <p className="max-w-xl text-xs leading-relaxed text-slate-500">
              Counts cover all matching assignments. Pages update as work is
              completed or removed; refresh to reconcile changes made by your
              team.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={cursors.length === 1}
                onClick={() => setCursors((values) => values.slice(0, -1))}
              >
                <ArrowLeft />
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={!page.has_more || !page.next_cursor}
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
        </>
      )}
    </div>
  );
}

function PracticeCard({
  item,
  onOpen,
}: {
  item: PracticeInboxItem;
  onOpen: (callId: string) => void;
}) {
  const change = practiceScoreChange(item);
  const completed = item.status === 'completed';
  const differentRubrics =
    item.followup_rubric_id &&
    item.followup_rubric_id !== item.baseline_rubric_id;
  return (
    <article className="min-w-0 rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge
          variant="outline"
          className={
            completed
              ? 'border-teal-200 bg-teal-50 text-teal-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }
        >
          {completed ? <CheckCircle2 /> : <Target />}
          {completed ? 'Completed' : 'Needs follow-up'}
        </Badge>
        <span className="text-xs text-slate-500">
          Assigned {date(item.created_at)}
        </span>
      </div>
      <h3 className="mt-4 text-base font-semibold tracking-tight">
        {DIMENSIONS[item.dimension] ?? 'Practice focus'}
      </h3>
      <p className="mt-1 break-words text-sm text-slate-500">
        {item.coordinator} <span aria-hidden="true">·</span> {item.call_title}
      </p>
      <p className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
        {item.instruction_preview}
        {item.instruction_truncated && '…'}
      </p>
      {item.instruction_truncated && (
        <p className="mt-2 text-xs text-slate-500">
          Preview shortened. Open the consultation for the full instructions.
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border p-4">
        <div>
          <p className="text-xs text-slate-500">Pinned baseline</p>
          <p className="mt-1 font-semibold">
            {item.baseline_score === null
              ? 'Unscored'
              : `${item.baseline_score} / 5`}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Reviewed follow-up</p>
          <p className="mt-1 font-semibold">
            {completed
              ? item.followup_score === null
                ? 'Unscored'
                : `${item.followup_score} / 5`
              : 'Not linked yet'}
          </p>
        </div>
        <p className="col-span-2 text-xs leading-relaxed text-slate-500">
          {completed
            ? differentRubrics
              ? 'Different rubric versions. Scores are not comparable.'
              : change === null
                ? 'A score comparison is unavailable for this dimension.'
                : `${change > 0 ? '+' : ''}${change} ${Math.abs(change) === 1 ? 'point' : 'points'} in this dimension, using the same rubric. This comparison does not establish training impact.`
            : 'A reviewer must link a separate, eligible human-reviewed consultation. Completion is never inferred from a score.'}
        </p>
      </div>
      {completed && item.completed_at && (
        <p className="mt-3 break-words text-xs text-slate-500">
          Completed {date(item.completed_at)}
          {item.followup_call_title ? ` · ${item.followup_call_title}` : ''}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant={completed ? 'outline' : 'default'}
          onClick={() => onOpen(item.call_id)}
        >
          {completed ? 'Open baseline' : 'Review practice'}
          <ArrowRight />
        </Button>
        {completed && item.followup_call_id && (
          <Button
            variant="outline"
            onClick={() => {
              if (item.followup_call_id) onOpen(item.followup_call_id);
            }}
          >
            Open follow-up
            <ArrowRight />
          </Button>
        )}
      </div>
      {!completed && (
        <details className="mt-4 border-t pt-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-slate-600">
            <CalendarPlus size={16} />
            Add a calendar reminder
          </summary>
          <PracticeCalendar assignmentId={item.id} />
        </details>
      )}
    </article>
  );
}
