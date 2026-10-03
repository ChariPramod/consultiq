'use client';
import { useCallback, useEffect, useState, useRef } from 'react';
import { BookCheck, ClipboardList, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { api, ApiError } from '@/lib/api';
import type {
  FollowupCandidate,
  FollowupCandidatePage,
} from '@/lib/followup-candidates';
import { PracticeCalendar } from './practice-calendar';
import {
  comparison,
  type LearningData,
  type CoachingReview,
  type PracticeAssignment,
} from '@/lib/learning';
import { DIMENSIONS, type Coaching, type CallRecord } from '@/lib/product';
const blank: LearningData = { reviews: [], assignments: [] };
export function LearningWorkspace({
  call,
  coaching,
  onHumanReview,
  onRefresh,
  readOnly = false,
}: {
  call: CallRecord;
  coaching: Coaching[];
  onHumanReview: () => void;
  onRefresh: () => Promise<void>;
  readOnly?: boolean;
}) {
  const [data, setData] = useState<LearningData | null>(null),
    [error, setError] = useState('');
  const reload = useCallback(async () => {
    await onRefresh();
    const value = await api<LearningData>(`consultations/${call.id}/learning`);
    setData(value);
    setError('');
  }, [call.id, onRefresh]);
  useEffect(() => {
    let active = true;
    void api<LearningData>(`consultations/${call.id}/learning`).then(
      (value) => {
        if (active) setData(value);
      },
      (e) => {
        if (active) setError(e.message);
      },
    );
    return () => {
      active = false;
    };
  }, [call.id]);
  const view = data ?? blank;
  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-slate-950 p-6 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm text-sky-300">
              <BookCheck size={18} /> REVIEW → PRACTICE → REASSESS
            </div>
            <h2 className="text-2xl font-semibold">
              Turn feedback into focused practice
            </h2>
            <p className="mt-3 max-w-2xl text-slate-300">
              Approve or correct coaching, choose one behavior to practice, then
              compare human-reviewed role-plays against the same rubric.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => void reload().catch((e) => setError(e.message))}
          >
            <RefreshCw size={16} />
            Refresh
          </Button>
        </div>
      </section>
      {error && (
        <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-950">
          {error} Your unsaved text stays in this page. Refresh records before
          trying again; leaving the page discards unsaved text.
        </p>
      )}
      {!data && !error && <output>Loading review and practice history…</output>}
      {data && (
        <>
          <section className="space-y-4">
            <h3 className="flex items-center gap-2 text-xl font-semibold">
              <ShieldCheck size={20} />
              Coaching decisions
            </h3>
            {coaching.length ? (
              coaching.map((c) => (
                <CoachingDecision
                  key={c.id}
                  coaching={c}
                  readOnly={readOnly}
                  history={view.reviews.filter((r) => r.coaching_id === c.id)}
                  onSaved={reload}
                />
              ))
            ) : (
              <p className="rounded-xl border border-dashed p-5 text-slate-600">
                No AI coaching to review. You can still assign practice from a
                human assessment below, without an AI account.
              </p>
            )}
          </section>
          <section className="space-y-4">
            <h3 className="flex items-center gap-2 text-xl font-semibold">
              <ClipboardList size={20} />
              Practice assignments
            </h3>
            {call.latest?.kind !== 'human' && (
              <div className="rounded-xl border p-5">
                <p className="mb-3">
                  Record a human assessment first. Practice uses that immutable
                  review as its baseline.
                </p>
                <Button disabled={readOnly} onClick={onHumanReview}>
                  Record human assessment
                </Button>
              </div>
            )}
            {!readOnly && (
              <AssignmentForm call={call} data={view} onSaved={reload} />
            )}
            {view.assignments.map((assignment) => (
              <PracticeCard
                key={assignment.id}
                assignment={assignment}
                readOnly={readOnly}
                reviews={view.reviews}
                onSaved={reload}
              />
            ))}
            {!view.assignments.length && (
              <p className="text-sm text-slate-500">
                No assignments yet. Choose a behavior and write a concrete
                exercise; no AI generation is required.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
function CoachingDecision({
  coaching,
  history,
  readOnly,
  onSaved,
}: {
  coaching: Coaching;
  history: CoachingReview[];
  readOnly: boolean;
  onSaved: () => Promise<void>;
}) {
  const latest = history[0];
  const [baseId, setBaseId] = useState(latest?.id ?? '');
  const lastDecision = useRef<string | null>(null);
  const [guidance, setGuidance] = useState(latest?.guidance || coaching.answer),
    [notes, setNotes] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const edit = () => {
    setRequestId(crypto.randomUUID());
    setError('');
  };
  async function save(decision: 'approved' | 'rejected') {
    setBusy(true);
    setError('');
    const attemptId =
      lastDecision.current && lastDecision.current !== decision
        ? crypto.randomUUID()
        : requestId;
    setRequestId(attemptId);
    lastDecision.current = decision;
    try {
      await api(`coaching/${coaching.id}/reviews`, 'POST', {
        request_id: attemptId,
        base_id: baseId,
        decision,
        guidance,
        notes,
      });
      await onSaved();
      setBaseId(attemptId);
      setRequestId(crypto.randomUUID());
      setNotes('');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Unable to save. Refresh to check the latest decision.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="space-y-4 rounded-xl border bg-white p-5">
      <div className="flex flex-wrap justify-between gap-2">
        <h4 className="font-semibold">{coaching.question}</h4>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm">
          {latest
            ? latest.decision === 'approved'
              ? 'Human approved'
              : 'Human rejected'
            : 'Awaiting review'}
        </span>
      </div>
      <details className="rounded-lg bg-slate-50 p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Original AI answer and cited sources
        </summary>
        <p className="my-3 whitespace-pre-wrap">{coaching.answer}</p>
        {coaching.citations.map((c, i) => (
          <blockquote
            key={i}
            className="my-3 border-l-2 border-sky-400 pl-3 text-sm"
          >
            <strong>{c.title}</strong>
            <p>{c.span}</p>
          </blockquote>
        ))}
      </details>
      {!readOnly && baseId !== (latest?.id ?? '') && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm">
          <p>
            A newer decision is available. Your draft is preserved. Read the
            decision history before rebasing.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setBaseId(latest?.id ?? '');
              setRequestId(crypto.randomUUID());
            }}
          >
            Rebase this draft on latest decision
          </Button>
        </div>
      )}
      <fieldset disabled={busy || readOnly} className="space-y-3">
        <Label htmlFor={`guidance-${coaching.id}`}>Reviewed guidance</Label>
        <Textarea
          id={`guidance-${coaching.id}`}
          rows={4}
          maxLength={12000}
          value={readOnly ? latest?.guidance || coaching.answer : guidance}
          onChange={(e) => {
            edit();
            setGuidance(e.target.value);
          }}
        />
        <Label htmlFor={`notes-${coaching.id}`}>Reason for your decision</Label>
        <Textarea
          id={`notes-${coaching.id}`}
          value={readOnly ? (latest?.notes ?? '') : notes}
          maxLength={2000}
          onChange={(e) => {
            edit();
            setNotes(e.target.value);
          }}
        />
        <p className="text-sm text-slate-500">
          Check the sources and relevance. Edited guidance is human-authored; it
          has not been automatically validated against every citation.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!notes.trim() || !guidance.trim()}
            onClick={() => void save('approved')}
          >
            Approve reviewed guidance
          </Button>
          <Button
            variant="outline"
            disabled={!notes.trim()}
            onClick={() => void save('rejected')}
          >
            Reject guidance
          </Button>
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-amber-800">
          {error}
        </p>
      )}
      {history.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm">
            Decision history ({history.length})
          </summary>
          {history.map((r) => (
            <div key={r.id} className="mt-3 border-t pt-3 text-sm">
              <strong>
                {r.decision} · {new Date(r.created_at).toLocaleString()}
              </strong>
              <p className="whitespace-pre-wrap">{r.notes}</p>
              <p className="whitespace-pre-wrap text-slate-600">{r.guidance}</p>
            </div>
          ))}
        </details>
      )}
    </article>
  );
}
function AssignmentForm({
  call,
  data,
  onSaved,
}: {
  call: CallRecord;
  data: LearningData;
  onSaved: () => Promise<void>;
}) {
  const [baselineId, setBaselineId] = useState(
    call.latest?.kind === 'human' ? call.latest.id : '',
  );
  const [dimension, setDimension] = useState(0),
    [instruction, setInstruction] = useState(''),
    [review, setReview] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const latest = data.reviews.filter(
    (r, i) =>
      r.decision === 'approved' &&
      data.reviews.findIndex((x) => x.coaching_id === r.coaching_id) === i,
  );
  const edit = () => {
    setRequestId(crypto.randomUUID());
    setError('');
  };
  return (
    <form
      className="space-y-4 rounded-xl border bg-white p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          await api(`consultations/${call.id}/practice`, 'POST', {
            request_id: requestId,
            baseline_id: baselineId,
            review_id: review || null,
            dimension,
            instruction,
          });
          await onSaved();
          setInstruction('');
          setRequestId(crypto.randomUUID());
        } catch (e) {
          setError(
            e instanceof Error ? e.message : 'Could not save assignment.',
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      {call.latest?.kind === 'human' && baselineId !== call.latest.id && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm">
          <p>The baseline review changed. Your practice draft is preserved.</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setBaselineId(call.latest!.id);
              edit();
            }}
          >
            Use latest human assessment
          </Button>
        </div>
      )}
      <fieldset
        disabled={busy || call.latest?.kind !== 'human'}
        className="space-y-3"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-medium">
            Focus dimension
            <NativeSelect
              value={dimension}
              onChange={(e) => {
                edit();
                setDimension(Number(e.target.value));
              }}
            >
              {DIMENSIONS.map((label, i) => (
                <NativeSelectOption key={label} value={i}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <label className="space-y-2 text-sm font-medium">
            Basis for practice
            <NativeSelect
              value={review}
              onChange={(e) => {
                edit();
                setReview(e.target.value);
              }}
            >
              <NativeSelectOption value="">
                Human assessment only
              </NativeSelectOption>
              {latest.map((r) => (
                <NativeSelectOption key={r.id} value={r.id}>
                  Approved coaching · {r.guidance.slice(0, 70)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        </div>
        <Label htmlFor="practice-instruction">
          Exercise and success criteria
        </Label>
        <Textarea
          id="practice-instruction"
          rows={3}
          required
          maxLength={4000}
          value={instruction}
          onChange={(e) => {
            edit();
            setInstruction(e.target.value);
          }}
        />
        <p className="text-sm text-slate-500">
          Baseline: {baselineId.slice(0, 8)} · Assigned to coordinator label “
          {call.coordinator}”. This does not send a notification or invite
          another user.
        </p>
        <Button type="submit" disabled={!instruction.trim()}>
          Create practice assignment
        </Button>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-amber-800">
          {error}
        </p>
      )}
    </form>
  );
}
function PracticeCard({
  assignment,
  reviews,
  readOnly,
  onSaved,
}: {
  assignment: PracticeAssignment;
  reviews: CoachingReview[];
  readOnly: boolean;
  onSaved: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<FollowupCandidate | null>(null),
    [searchOpen, setSearchOpen] = useState(false),
    [searchRevision, setSearchRevision] = useState(0),
    [reflection, setReflection] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const original = reviews.find((r) => r.id === assignment.review_id);
  const current = original
    ? reviews.find((r) => r.coaching_id === original.coaching_id)
    : null;
  const valid = !assignment.review_id || current?.id === assignment.review_id;
  const scores = comparison(
    assignment.baseline,
    assignment.followup,
    assignment.dimension,
  );
  const edit = () => {
    setRequestId(crypto.randomUUID());
    setError('');
  };
  return (
    <article className="space-y-4 rounded-xl border bg-white p-5">
      <div className="flex flex-wrap justify-between gap-2">
        <h4 className="font-semibold">{DIMENSIONS[assignment.dimension]}</h4>
        <span className="text-sm text-slate-500">
          {assignment.completion
            ? 'Reviewed follow-up linked'
            : valid
              ? 'Ready for practice'
              : 'Coaching approval changed'}
        </span>
      </div>
      <p className="whitespace-pre-wrap">{assignment.instruction}</p>
      {!assignment.completion && (
        <PracticeCalendar assignmentId={assignment.id} />
      )}
      <p className="text-xs text-slate-500">
        Baseline {assignment.baseline_id} · Rubric{' '}
        {assignment.baseline.rubric_id} ·{' '}
        {new Date(assignment.created_at).toLocaleString()}
      </p>
      {assignment.completion ? (
        <>
          <div className="grid grid-cols-3 gap-3 rounded-lg bg-slate-50 p-4 text-sm">
            <div>
              Before
              <strong className="block text-xl">
                {scores.before ?? 'Unscored'}
              </strong>
            </div>
            <div>
              After
              <strong className="block text-xl">
                {scores.after ?? 'Unscored'}
              </strong>
            </div>
            <div>
              Difference
              <strong className="block text-xl">
                {scores.delta === null
                  ? 'Unavailable'
                  : `${scores.delta > 0 ? '+' : ''}${scores.delta}`}
              </strong>
            </div>
          </div>
          <p className="whitespace-pre-wrap text-sm">
            {assignment.completion.reflection}
          </p>
          <p className="text-sm text-slate-500">
            Same rubric, human-reviewed assessments. A score difference does not
            establish causal improvement or business outcomes.
          </p>
        </>
      ) : !valid ? (
        <p className="text-sm text-amber-800">
          The coaching decision was revised. Create a new assignment using the
          current approved guidance or a human assessment.
        </p>
      ) : readOnly ? (
        <p className="text-sm text-slate-500">
          A reviewer can link a follow-up assessment to this assignment.
        </p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              await api(`practice/${assignment.id}/complete`, 'POST', {
                request_id: requestId,
                assessment_id: selected?.assessment_id,
                reflection,
              });
              setSelected(null);
              setReflection('');
              setRequestId(crypto.randomUUID());
              await onSaved();
            } catch (e) {
              if (
                e instanceof ApiError &&
                (e.code === 'learning_conflict' || e.status === 404)
              ) {
                setSelected(null);
                setSearchRevision((value) => value + 1);
                setRequestId(crypto.randomUUID());
              }
              setError(
                e instanceof Error ? e.message : 'Could not link follow-up.',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy} className="space-y-3">
            <div className="space-y-3 rounded-xl border bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  Follow-up human assessment
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-expanded={searchOpen}
                  aria-controls={`candidates-${assignment.id}`}
                  onClick={() => setSearchOpen((value) => !value)}
                >
                  {searchOpen
                    ? 'Close search'
                    : selected
                      ? 'Change follow-up'
                      : 'Find a follow-up'}
                </Button>
              </div>
              {selected ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <p>
                    <strong>{selected.title}</strong> · {selected.recorded_at}
                    <br />
                    <span className="text-slate-500">
                      Selected review {selected.assessment_id.slice(0, 8)}
                    </span>
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      edit();
                      setSelected(null);
                    }}
                  >
                    Clear selection
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Search all eligible consultations in this workspace.
                </p>
              )}
              {searchOpen && (
                <FollowupSearch
                  key={searchRevision}
                  assignmentId={assignment.id}
                  selected={selected}
                  onSelect={(candidate) => {
                    edit();
                    setSelected(candidate);
                  }}
                />
              )}
              <p className="text-xs leading-relaxed text-slate-500">
                Choices use the same coordinator and rubric, with a role-play
                date on or after the baseline. The latest assessment must be
                human-reviewed on or after this assignment. Eligibility is
                checked again when you save.
              </p>
            </div>
            <Label htmlFor={`reflection-${assignment.id}`}>
              What changed, and what still needs practice?
            </Label>
            <Textarea
              id={`reflection-${assignment.id}`}
              value={reflection}
              maxLength={4000}
              onChange={(e) => {
                edit();
                setReflection(e.target.value);
              }}
            />
            <Button
              type="submit"
              variant="outline"
              disabled={!selected || !reflection.trim()}
            >
              Link reviewed follow-up
            </Button>
          </fieldset>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-amber-800">
          {error}
        </p>
      )}
    </article>
  );
}

function FollowupSearch({
  assignmentId,
  selected,
  onSelect,
}: {
  assignmentId: string;
  selected: FollowupCandidate | null;
  onSelect: (candidate: FollowupCandidate | null) => void;
}) {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    page: FollowupCandidatePage | null;
    error: string;
  } | null>(null);
  const cursor = cursors.at(-1) ?? null;
  const requestKey = JSON.stringify([assignmentId, query, cursor, revision]);
  const current = result?.key === requestKey ? result : null;
  const page = current?.page;
  const error = current?.error;
  const loading = !current;
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const params = new URLSearchParams({ q: query, limit: '25' });
    if (cursor) params.set('cursor', cursor);
    const send: typeof fetch = (input, init) =>
      fetch(input, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([controller.signal, init.signal])
          : controller.signal,
      });
    void api<FollowupCandidatePage>(
      `practice/${assignmentId}/candidates?${params}`,
      'GET',
      undefined,
      send,
    ).then(
      (value) => {
        if (active) setResult({ key: requestKey, page: value, error: '' });
      },
      (failure: unknown) => {
        if (active)
          setResult({
            key: requestKey,
            page: null,
            error:
              failure instanceof Error
                ? failure.message
                : 'Could not load eligible follow-ups.',
          });
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [assignmentId, query, cursor, requestKey]);
  const search = () => {
    setQuery(draft.trim());
    setCursors([null]);
    setRevision((value) => value + 1);
  };
  const options = page?.candidates ?? [];
  const retained =
    selected &&
    !options.some(
      (candidate) => candidate.assessment_id === selected.assessment_id,
    );
  return (
    <div id={`candidates-${assignmentId}`} className="space-y-3 border-t pt-3">
      <Label htmlFor={`candidate-search-${assignmentId}`}>
        Search follow-up titles
      </Label>
      <div className="flex gap-2">
        <Input
          id={`candidate-search-${assignmentId}`}
          value={draft}
          maxLength={200}
          placeholder="Find a reviewed role-play…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              search();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={search}>
          Search
        </Button>
      </div>
      {loading && (
        <output className="block text-sm text-slate-500">
          Loading eligible follow-ups…
        </output>
      )}
      {error && (
        <div role="alert" className="space-y-2 text-sm text-amber-800">
          <p>{error} Your selected follow-up and reflection are preserved.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setCursors([null]);
              setRevision((value) => value + 1);
            }}
          >
            Reload choices
          </Button>
        </div>
      )}
      {page && (
        <>
          {options.length ? (
            <>
              <Label htmlFor={`candidate-choice-${assignmentId}`}>
                Eligible human assessments
              </Label>
              <NativeSelect
                id={`candidate-choice-${assignmentId}`}
                className="w-full"
                value={selected?.assessment_id ?? ''}
                onChange={(event) =>
                  onSelect(
                    options.find(
                      (candidate) =>
                        candidate.assessment_id === event.target.value,
                    ) ??
                      (selected?.assessment_id === event.target.value
                        ? selected
                        : null),
                  )
                }
              >
                <NativeSelectOption value="">
                  Choose a reviewed consultation
                </NativeSelectOption>
                {retained && (
                  <NativeSelectOption value={selected.assessment_id}>
                    Selected: {selected.title} · {selected.recorded_at}
                  </NativeSelectOption>
                )}
                {options.map((candidate) => (
                  <NativeSelectOption
                    key={candidate.assessment_id}
                    value={candidate.assessment_id}
                  >
                    {candidate.title} · {candidate.recorded_at}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <output className="block text-xs text-slate-500">
                Page {cursors.length} · {options.length} eligible{' '}
                {options.length === 1 ? 'consultation' : 'consultations'} shown
              </output>
            </>
          ) : (
            <output className="block text-sm text-slate-600">
              {query
                ? 'No eligible follow-ups match this title search. Clear the search to browse other choices.'
                : 'No eligible follow-ups found. Import another role-play and record a human assessment with the same rubric.'}
            </output>
          )}
          {(cursors.length > 1 || page.has_more) && (
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={cursors.length === 1}
                onClick={() => setCursors((value) => value.slice(0, -1))}
              >
                Previous page
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!page.next_cursor}
                onClick={() => {
                  if (page.next_cursor)
                    setCursors((value) => [...value, page.next_cursor]);
                }}
              >
                Next page
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
