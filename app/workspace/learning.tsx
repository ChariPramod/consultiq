'use client';
import { useCallback, useEffect, useState, useRef } from 'react';
import { BookCheck, ClipboardList, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { api } from '@/lib/api';
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
  calls,
  onHumanReview,
  onRefresh,
}: {
  call: CallRecord;
  coaching: Coaching[];
  calls: CallRecord[];
  onHumanReview: () => void;
  onRefresh: () => Promise<void>;
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
                <Button onClick={onHumanReview}>Record human assessment</Button>
              </div>
            )}
            <AssignmentForm call={call} data={view} onSaved={reload} />
            {view.assignments.map((assignment) => (
              <PracticeCard
                key={assignment.id}
                assignment={assignment}
                calls={calls}
                call={call}
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
  onSaved,
}: {
  coaching: Coaching;
  history: CoachingReview[];
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
      {baseId !== (latest?.id ?? '') && (
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
      <fieldset disabled={busy} className="space-y-3">
        <Label htmlFor={`guidance-${coaching.id}`}>Reviewed guidance</Label>
        <Textarea
          id={`guidance-${coaching.id}`}
          rows={4}
          maxLength={12000}
          value={guidance}
          onChange={(e) => {
            edit();
            setGuidance(e.target.value);
          }}
        />
        <Label htmlFor={`notes-${coaching.id}`}>Reason for your decision</Label>
        <Textarea
          id={`notes-${coaching.id}`}
          value={notes}
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
        <Button disabled={!instruction.trim()}>
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
  calls,
  call,
  reviews,
  onSaved,
}: {
  assignment: PracticeAssignment;
  calls: CallRecord[];
  call: CallRecord;
  reviews: CoachingReview[];
  onSaved: () => Promise<void>;
}) {
  const [assessment, setAssessment] = useState(''),
    [reflection, setReflection] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const original = reviews.find((r) => r.id === assignment.review_id);
  const current = original
    ? reviews.find((r) => r.coaching_id === original.coaching_id)
    : null;
  const valid = !assignment.review_id || current?.id === assignment.review_id;
  const candidates = calls.filter(
    (c) =>
      c.id !== call.id &&
      c.coordinator === call.coordinator &&
      c.recorded_at >= call.recorded_at &&
      c.latest?.kind === 'human' &&
      c.latest.rubric_id === assignment.baseline.rubric_id &&
      c.latest.created_at >= assignment.created_at,
  );
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
                assessment_id: assessment,
                reflection,
              });
              await onSaved();
            } catch (e) {
              setError(
                e instanceof Error ? e.message : 'Could not link follow-up.',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy} className="space-y-3">
            <label className="text-sm font-medium">
              Follow-up human assessment
              <NativeSelect
                value={assessment}
                onChange={(e) => {
                  edit();
                  setAssessment(e.target.value);
                }}
              >
                <NativeSelectOption value="">
                  Choose a reviewed consultation
                </NativeSelectOption>
                {candidates.map((c) => (
                  <NativeSelectOption key={c.id} value={c.latest!.id}>
                    {c.title} · {c.recorded_at}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            {!candidates.length && (
              <p className="text-sm text-slate-500">
                Import another role-play for this coordinator and record a human
                assessment with the same rubric. Its review must be created
                after this assignment. Choices use the loaded consultation list.
              </p>
            )}
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
              variant="outline"
              disabled={!assessment || !reflection.trim()}
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
