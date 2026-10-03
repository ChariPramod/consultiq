'use client';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  RefreshCw,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { api } from '@/lib/api';
import {
  isReviewTaskOverdue,
  REVIEW_TASK_LABELS,
  type ReviewTaskPage,
} from '@/lib/review-tasks';
import { Empty } from './components';
export function ReviewWorklist({ onOpen }: { onOpen: (id: string) => void }) {
  const [mine, setMine] = useState(true);
  const [status, setStatus] = useState('all');
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [revision, setRevision] = useState(0);
  const cursor = cursors[cursors.length - 1];
  const requestKey = JSON.stringify([mine, status, cursor, revision]);
  const [result, setResult] = useState<{
    key: string;
    page: ReviewTaskPage | null;
    error: string;
  } | null>(null);
  const current = result?.key === requestKey ? result : null;
  const page = current?.page;
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({
      mine: String(mine),
      status,
      limit: '25',
    });
    if (cursor) params.set('cursor', cursor);
    void api<ReviewTaskPage>(`review-tasks?${params}`).then(
      (page) => {
        if (active) setResult({ key: requestKey, page, error: '' });
      },
      (e) => {
        if (active)
          setResult({
            key: requestKey,
            page: null,
            error:
              e instanceof Error ? e.message : 'Could not load assignments.',
          });
      },
    );
    return () => {
      active = false;
    };
  }, [mine, status, cursor, requestKey]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">A clear next review</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Owners assign conversations from the review screen. Completion is
              linked to a saved human assessment, with a preserved assignment
              history.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={!current}
            onClick={() => {
              setCursors([null]);
              setRevision((x) => x + 1);
            }}
          >
            <RefreshCw />
            Refresh
          </Button>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <NativeSelect
            aria-label="Assignment ownership"
            value={mine ? 'mine' : 'all'}
            onChange={(e) => {
              setMine(e.target.value === 'mine');
              setCursors([null]);
            }}
          >
            <NativeSelectOption value="mine">Assigned to me</NativeSelectOption>
            <NativeSelectOption value="all">
              All workspace assignments
            </NativeSelectOption>
          </NativeSelect>
          <NativeSelect
            aria-label="Assignment status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setCursors([null]);
            }}
          >
            <NativeSelectOption value="all">All statuses</NativeSelectOption>
            {Object.entries(REVIEW_TASK_LABELS).map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </section>
      {!current && (
        <output className="block p-8 text-center text-slate-500">
          Loading assigned reviews…
        </output>
      )}
      {current?.error && (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 p-4"
          role="alert"
        >
          <p>{current.error}</p>
          <Button
            variant="outline"
            className="mt-3"
            onClick={() => {
              setCursors([null]);
              setRevision((x) => x + 1);
            }}
          >
            Reload first page
          </Button>
        </div>
      )}
      {page && (
        <>
          {!page.tasks.length ? (
            <div className="product-panel">
              <Empty
                icon={ClipboardCheck}
                title={
                  mine ? 'No reviews assigned to you' : 'No assignments match'
                }
                description="A workspace owner can open a consultation and assign an eligible reviewer. Adjust filters to see completed assignments."
              />
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {page.tasks.map((task) => {
                const overdue = isReviewTaskOverdue(task, today);
                return (
                  <article
                    key={task.id}
                    className="flex flex-col rounded-2xl border bg-white p-5 shadow-sm"
                  >
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${task.status === 'done' ? 'bg-emerald-50 text-emerald-800' : task.status === 'in_progress' ? 'bg-sky-50 text-sky-800' : 'bg-slate-100 text-slate-600'}`}
                      >
                        {REVIEW_TASK_LABELS[task.status]}
                      </span>
                      {overdue && (
                        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-900">
                          Past due
                        </span>
                      )}
                      {!task.assignee_active && task.status !== 'done' && (
                        <span className="rounded-full bg-red-50 px-3 py-1 text-xs text-red-700">
                          Needs reassignment
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-semibold break-words">
                      {task.title}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {task.coordinator}
                    </p>
                    <dl className="my-5 space-y-2 text-sm">
                      <div className="flex gap-2">
                        <UserRound
                          size={16}
                          className="mt-0.5 shrink-0 text-slate-400"
                        />
                        <dt className="sr-only">Reviewer</dt>
                        <dd className="break-all">{task.assignee_id}</dd>
                      </div>
                      <div className="flex gap-2">
                        <CalendarDays
                          size={16}
                          className="mt-0.5 shrink-0 text-slate-400"
                        />
                        <dt className="sr-only">Due date</dt>
                        <dd>
                          {task.due_date
                            ? `Due ${task.due_date} (UTC date)`
                            : 'No due date set'}
                        </dd>
                      </div>
                    </dl>
                    <Button
                      className="mt-auto self-start"
                      variant="outline"
                      onClick={() => onOpen(task.call_id)}
                    >
                      {task.status === 'done'
                        ? 'Inspect completed review'
                        : 'Open review'}
                      <ArrowRight />
                    </Button>
                  </article>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
            <span>
              Page {cursors.length} · {page.tasks.length} assignments shown ·
              Latest updates first
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={cursors.length === 1}
                onClick={() => setCursors((x) => x.slice(0, -1))}
              >
                <ArrowLeft />
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={!page.next_cursor}
                onClick={() => {
                  if (page.next_cursor)
                    setCursors((x) => [...x, page.next_cursor]);
                }}
              >
                Next
                <ArrowRight />
              </Button>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Dates are evaluated in UTC. Updates can move assignments between
            pages; refresh to start again. This worklist does not send
            notifications.
          </p>
        </>
      )}
    </div>
  );
}
