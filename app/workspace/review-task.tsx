'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  CalendarClock,
  CheckCheck,
  History,
  RefreshCw,
  UserRoundCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { api, ApiError } from '@/lib/api';
import type { WorkspaceData } from '@/lib/product';
import {
  REVIEW_TASK_LABELS,
  isReviewTaskOverdue,
  type ReviewTaskData,
  type ReviewTaskStatus,
} from '@/lib/review-tasks';

type Draft = { assignee: string; due: string; status: ReviewTaskStatus };
function draftFrom(data: ReviewTaskData): Draft {
  return {
    assignee:
      data.task?.assignee_id ?? data.eligible_reviewers[0]?.user_id ?? '',
    due: data.task?.due_date ?? '',
    status: data.task?.status ?? 'open',
  };
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function dateLabel(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

type ReviewTaskPanelProps = {
  callId: string;
  access: WorkspaceData['access'];
  onChanged?: () => Promise<void>;
};
export function ReviewTaskPanel(props: ReviewTaskPanelProps) {
  return <ReviewTaskEditor key={props.callId} {...props} />;
}
function ReviewTaskEditor({ callId, access, onChanged }: ReviewTaskPanelProps) {
  const prefix = useId();
  const [data, setData] = useState<ReviewTaskData | null>(null);
  const [draft, setDraft] = useState<Draft>({
    assignee: '',
    due: '',
    status: 'open',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const requestGeneration = useRef(0);
  const operationPending = useRef(false);
  const owner = access.role === 'owner';
  const task = data?.task;
  const canEdit =
    owner ||
    (access.role === 'reviewer' &&
      task?.assignee_id === access.user_id &&
      task.assignee_active &&
      task.status !== 'done');
  const dirty =
    data && JSON.stringify(draft) !== JSON.stringify(draftFrom(data));
  const inactiveAssignee =
    task &&
    !data?.eligible_reviewers.some(
      (reviewer) => reviewer.user_id === task.assignee_id,
    );
  const closed = task?.status === 'done';
  const path = `consultations/${encodeURIComponent(callId)}/review-task`;
  useEffect(() => {
    const requests = requestGeneration;
    const generation = ++requestGeneration.current;
    void api<ReviewTaskData>(path).then(
      (result) => {
        if (generation !== requestGeneration.current) return;
        setData(result);
        setDraft(draftFrom(result));
      },
      (e: unknown) => {
        if (generation === requestGeneration.current)
          setError(
            e instanceof Error
              ? e.message
              : 'Could not load the review assignment.',
          );
      },
    );
    return () => {
      requests.current++;
    };
  }, [path]);
  async function refresh() {
    if (operationPending.current) return;
    if (
      dirty &&
      !window.confirm(
        'Discard your unsaved assignment changes and load the saved version?',
      )
    )
      return;
    operationPending.current = true;
    const generation = ++requestGeneration.current;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<ReviewTaskData>(path);
      if (generation !== requestGeneration.current) return;
      setData(result);
      setDraft(draftFrom(result));
      setNeedsRefresh(false);
      setNotice('Assignment refreshed.');
    } catch (e) {
      if (generation !== requestGeneration.current) return;
      setError(
        e instanceof Error ? e.message : 'Could not refresh the assignment.',
      );
    } finally {
      if (generation === requestGeneration.current) {
        operationPending.current = false;
        setBusy(false);
      }
    }
  }
  async function save() {
    if (!data || !canEdit || needsRefresh || operationPending.current) return;
    operationPending.current = true;
    const generation = ++requestGeneration.current;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<ReviewTaskData>(path, 'PATCH', {
        version: data.task?.version ?? 0,
        assignee_id: draft.assignee,
        due_date: draft.due || null,
        status: draft.status,
        completion_assessment_id:
          draft.status === 'done' ? data.latest_human_assessment_id : null,
      });
      if (generation !== requestGeneration.current) return;
      setData(result);
      setDraft(draftFrom(result));
      setNotice(
        draft.status === 'done'
          ? 'Review completed and linked to the human assessment.'
          : 'Review assignment saved.',
      );
      try {
        await onChanged?.();
      } catch {
        if (generation === requestGeneration.current)
          setNotice(
            'Assignment saved. Refresh the workspace to update other views.',
          );
      }
    } catch (e) {
      if (generation !== requestGeneration.current) return;
      setError(
        e instanceof Error ? e.message : 'Could not save the assignment.',
      );
      if (
        !(e instanceof ApiError) ||
        e.status === 0 ||
        e.status === 409 ||
        e.status === 403 ||
        e.status >= 500 ||
        e.code === 'invalid_response'
      )
        setNeedsRefresh(true);
    } finally {
      if (generation === requestGeneration.current) {
        operationPending.current = false;
        setBusy(false);
      }
    }
  }
  const pendingCompletion = draft.status === 'done' && !closed;
  return (
    <section
      className="product-panel p-5 sm:p-6"
      aria-labelledby={`${prefix}-heading`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-sky-50 p-2.5 text-sky-700">
            <UserRoundCheck size={20} />
          </span>
          <div>
            <h2 id={`${prefix}-heading`} className="text-lg font-semibold">
              Review ownership
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              One accountable reviewer, with a recorded handoff.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void refresh()}
        >
          <RefreshCw size={14} /> Refresh assignment
        </Button>
      </div>
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
          {needsRefresh
            ? ' Your draft is preserved. Refresh and check the saved state before making another change.'
            : ''}
        </p>
      )}
      {notice && (
        <output className="mt-4 block text-sm text-emerald-800">
          {notice}
        </output>
      )}
      {!data && !error && (
        <output className="mt-5 block text-sm text-slate-500">
          Loading assignment…
        </output>
      )}
      {data && (
        <div className="mt-5 space-y-5">
          {task ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm">
              {closed ? (
                <CheckCheck size={18} className="text-emerald-700" />
              ) : (
                <CalendarClock size={18} className="text-slate-500" />
              )}
              <strong>{REVIEW_TASK_LABELS[task.status]}</strong>
              <span className="min-w-0 break-all text-slate-600">
                {task.assignee_id === access.user_id
                  ? 'Assigned to you'
                  : task.assignee_id}
              </span>
              {task.due_date && (
                <span
                  className={
                    isReviewTaskOverdue(task, today())
                      ? 'font-medium text-amber-800'
                      : 'text-slate-600'
                  }
                >
                  {isReviewTaskOverdue(task, today()) ? 'Overdue · ' : 'Due '}
                  {dateLabel(task.due_date)} (UTC)
                </span>
              )}
              <span className="text-xs text-slate-400">
                Revision {task.version}
              </span>
            </div>
          ) : (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              No reviewer assigned yet.{' '}
              {owner
                ? 'Assign yourself or an active reviewer to give this consultation a clear next step.'
                : 'A workspace owner can assign this consultation for review.'}
            </p>
          )}
          {inactiveAssignee && !closed && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              The assigned reviewer no longer has reviewer access. An owner must
              reassign this review before work can continue.
            </p>
          )}
          {closed && (
            <p className="text-sm text-slate-600">
              Completed against saved human assessment{' '}
              <code className="break-all text-xs">
                {task.completion_assessment_id}
              </code>
              . Later assessment revisions do not rewrite this completion.{' '}
              {owner && 'Reopen the assignment to request another review.'}
            </p>
          )}
          {canEdit && (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label
                  htmlFor={`${prefix}-assignee`}
                  className="grid gap-2 text-sm font-medium"
                >
                  Reviewer
                  <NativeSelect
                    id={`${prefix}-assignee`}
                    value={draft.assignee}
                    disabled={
                      !owner ||
                      busy ||
                      needsRefresh ||
                      (closed && draft.status === 'done')
                    }
                    onChange={(event) =>
                      setDraft({ ...draft, assignee: event.target.value })
                    }
                  >
                    {inactiveAssignee && (
                      <NativeSelectOption value={task.assignee_id} disabled>
                        {task.assignee_id} · access removed
                      </NativeSelectOption>
                    )}
                    {data.eligible_reviewers.map((reviewer) => (
                      <NativeSelectOption
                        key={reviewer.user_id}
                        value={reviewer.user_id}
                      >
                        {reviewer.user_id === access.user_id
                          ? 'You'
                          : reviewer.user_id}{' '}
                        · {reviewer.role}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </label>
                <label
                  htmlFor={`${prefix}-due`}
                  className="grid gap-2 text-sm font-medium"
                >
                  Due date (UTC, optional)
                  <Input
                    id={`${prefix}-due`}
                    type="date"
                    value={draft.due}
                    disabled={
                      !owner ||
                      busy ||
                      needsRefresh ||
                      (closed && draft.status === 'done')
                    }
                    onChange={(event) =>
                      setDraft({ ...draft, due: event.target.value })
                    }
                  />
                </label>
              </div>
              {task && (
                <label
                  htmlFor={`${prefix}-status`}
                  className="grid gap-2 text-sm font-medium"
                >
                  Status
                  <NativeSelect
                    id={`${prefix}-status`}
                    value={draft.status}
                    disabled={busy || needsRefresh}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        status: event.target.value as ReviewTaskStatus,
                      })
                    }
                  >
                    <NativeSelectOption value="open">
                      {closed ? 'Reopen review' : 'Assigned'}
                    </NativeSelectOption>
                    {!closed && (
                      <NativeSelectOption value="in_progress">
                        In progress
                      </NativeSelectOption>
                    )}
                    <NativeSelectOption
                      value="done"
                      disabled={!closed && !data.latest_human_assessment_id}
                    >
                      Completed
                      {!closed && !data.latest_human_assessment_id
                        ? ' · human assessment required'
                        : ''}
                    </NativeSelectOption>
                  </NativeSelect>
                </label>
              )}
              {task && !closed && !data.latest_human_assessment_id && (
                <p className="text-xs leading-relaxed text-slate-500">
                  Save a human assessment, then refresh this assignment to
                  enable completion. An AI assessment alone cannot complete a
                  review.
                </p>
              )}
              {pendingCompletion && (
                <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
                  Completion will pin the latest human assessment. It records
                  that review was performed; it does not certify a score or
                  outcome.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="submit"
                  disabled={
                    busy ||
                    needsRefresh ||
                    !draft.assignee ||
                    (Boolean(task) && !dirty) ||
                    (pendingCompletion && !data.latest_human_assessment_id) ||
                    !data.eligible_reviewers.some(
                      (reviewer) => reviewer.user_id === draft.assignee,
                    )
                  }
                >
                  {busy
                    ? 'Saving…'
                    : !task
                      ? 'Assign review'
                      : closed
                        ? 'Reopen review'
                        : draft.status === 'done'
                          ? 'Complete review'
                          : 'Save assignment'}
                </Button>
                <span className="text-xs text-slate-500">
                  {owner
                    ? 'Only owners can change the reviewer or due date.'
                    : 'Only your assigned review can be updated.'}
                </span>
              </div>
            </form>
          )}
          {data.history.length > 0 && (
            <details className="border-t border-slate-100 pt-4">
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-600">
                <History size={15} /> Assignment history ·{' '}
                {data.history.length === 30
                  ? 'latest 30 revisions'
                  : `${data.history.length} ${data.history.length === 1 ? 'revision' : 'revisions'}`}
              </summary>
              <ol className="mt-3 divide-y divide-slate-100">
                {data.history.map((event) => (
                  <li
                    key={event.id}
                    className="py-3 text-xs leading-relaxed text-slate-500"
                  >
                    <p className="font-medium text-slate-700">
                      Revision {event.version} ·{' '}
                      {REVIEW_TASK_LABELS[event.status]} ·{' '}
                      {new Date(event.created_at).toLocaleString()}
                    </p>
                    <p className="break-all">
                      Changed by{' '}
                      {event.actor_id === access.user_id
                        ? 'you'
                        : event.actor_id}
                      . Reviewer:{' '}
                      {event.assignee_id === access.user_id
                        ? 'you'
                        : event.assignee_id}
                      {event.due_date
                        ? ` · due ${dateLabel(event.due_date)} UTC`
                        : ' · no due date'}
                      .
                    </p>
                    {event.completion_assessment_id && (
                      <p className="break-all">
                        Human assessment: {event.completion_assessment_id}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
