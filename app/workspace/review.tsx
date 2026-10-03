'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  ClipboardCheck,
  FileText,
  History,
  LoaderCircle,
  MessageSquareText,
  Pencil,
  Quote,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { api } from '@/lib/api';
import {
  assessmentDraftEntryReady,
  buildAssessmentDimensions,
  createAssessmentDraftEntry,
} from '@/lib/assessment-draft';
import { LearningWorkspace } from './learning';
import { ReviewExport } from './review-export';
import { TranscriptReader } from './transcript-reader';
import { ReviewTaskPanel } from './review-task';
import { AssessmentComparison } from './assessment-comparison';
import {
  DIMENSIONS,
  OUTCOME_LABELS,
  type CallRecord,
  type Coaching,
  type SavedAssessment,
  type WorkspaceData,
} from '@/lib/product';
import { Busy, ConfirmDelete, Empty, Score, dateLabel } from './components';
type Detail = {
  call: CallRecord;
  assessments: SavedAssessment[];
  coaching: Coaching[];
};
export default function Review({
  callId,
  data,
  onChanged,
  onBack,
  onDeleted,
  onConfigure,
  initialTab = 'transcript',
}: {
  callId: string;
  initialTab?: 'transcript' | 'practice' | 'assessment';
  data: WorkspaceData;
  onChanged: () => Promise<void>;
  onBack: () => void;
  onDeleted: () => Promise<void>;
  onConfigure: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<string>(initialTab);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editSession, setEditSession] = useState<{
    call: CallRecord;
    rubric: NonNullable<WorkspaceData['rubric']>;
  } | null>(null);
  const [refreshPending, setRefreshPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [historical, setHistorical] = useState<SavedAssessment | null>(null);
  const detailRequest = useRef(0);
  const detailLifecycle = useRef({ callId, active: false });
  const viewer = data.access.role === 'viewer';
  const jobRevision = data.jobs
    .filter((job) => job.call_id === callId)
    .map((job) => `${job.id}:${job.status}`)
    .join(',');
  const reload = useCallback(async () => {
    const request = ++detailRequest.current;
    const lifecycle = detailLifecycle.current;
    const isCurrent = () =>
      lifecycle.active &&
      lifecycle === detailLifecycle.current &&
      lifecycle.callId === callId &&
      request === detailRequest.current;
    try {
      const result = await api<Detail>(`consultations/${callId}`);
      if (!isCurrent()) return;
      setDetail(result);
      setError('');
    } catch (e) {
      if (!isCurrent()) return;
      setError(
        e instanceof Error ? e.message : 'Could not open the consultation.',
      );
      throw e;
    }
  }, [callId]);
  useEffect(() => {
    const lifecycle = { callId, active: true };
    detailLifecycle.current = lifecycle;
    return () => {
      lifecycle.active = false;
    };
  }, [callId]);
  useEffect(() => {
    // Initial reads, polling and explicit reloads share one sequence. A slower
    // earlier response cannot replace the result of a post-save read.
    let active = true;
    void Promise.resolve()
      .then(() => (active ? reload() : undefined))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [reload, jobRevision]);
  useEffect(() => {
    if (tab === 'transcript' && highlight !== null) {
      const timer = setTimeout(
        () =>
          document
            .getElementById(`source-turn-${highlight}`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
        80,
      );
      return () => clearTimeout(timer);
    }
  }, [tab, highlight]);
  if (!detail || detail.call.id !== callId)
    return (
      <section className="product-panel">
        {error ? (
          <div className="product-empty">
            <p role="alert">{error}</p>
            <button
              className="primary-button"
              onClick={() => void reload().catch(() => {})}
            >
              Retry
            </button>
            <button className="text-button" onClick={onBack}>
              Back to consultations
            </button>
          </div>
        ) : (
          <output className="block product-loading">
            <LoaderCircle className="spin" size={21} /> Loading consultation
          </output>
        )}
      </section>
    );
  const { call } = detail;
  const assessment = historical ?? call.latest;
  const startHumanAssessment = () => {
    if (!data.rubric) return onConfigure();
    // Capture the saved baseline once. Polling must not rebase an open draft.
    setEditSession({ call, rubric: data.rubric });
    setEditOpen(true);
  };
  const refreshSavedAssessment = async () => {
    const lifecycle = detailLifecycle.current;
    const results = await Promise.allSettled([reload(), onChanged()]);
    if (!lifecycle.active || lifecycle !== detailLifecycle.current) return;
    const failed = results.some((result) => result.status === 'rejected');
    setRefreshPending(failed);
    if (!failed) setError('');
  };
  return (
    <>
      {notice && (
        <output className="block mb-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
          {notice}
        </output>
      )}
      <div className="review-navigation">
        <button className="text-button" onClick={onBack}>
          <ArrowLeft size={15} /> All consultations
        </button>
        <button
          disabled={data.access.role !== 'owner'}
          className="danger-link"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 size={15} /> Delete consultation
        </button>
      </div>
      <ReviewTaskPanel key={`task:${callId}`} callId={callId} access={data.access} />
      <ReviewExport key={`export:${callId}`} callId={callId} />
      <section className="product-panel consultation-header">
        <div className="consultation-title-row">
          <div>
            <span className="product-status">
              {call.source === 'roleplay' ? 'Role-play' : 'Synthetic'}
            </span>
            <h2>{call.title}</h2>
            <p>
              <Users size={15} />
              {call.coordinator}
              <span>·</span>
              {dateLabel(call.recorded_at)}
              <span>·</span>
              {call.turns.length} turns
            </p>
          </div>
          <div className="consultation-header-score">
            <span>Latest assessment</span>
            <Score call={call} />
          </div>
        </div>
        <div className="consultation-action-row">
          <label>
            Recorded outcome
            <NativeSelect
              value={call.outcome}
              disabled={busy || viewer}
              onChange={async (e) => {
                setBusy(true);
                try {
                  await api(`consultations/${callId}`, 'PATCH', {
                    outcome: e.target.value,
                  });
                  await reload();
                  await onChanged();
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : 'Could not update outcome.',
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <div>
            <button
              className="secondary-button"
              disabled={busy || viewer || !data.rubric}
              onClick={startHumanAssessment}
            >
              <Pencil size={15} /> Human assessment
            </button>
            <button
              className="primary-button"
              disabled={
                busy ||
                viewer ||
                !data.configuration.scoring ||
                !data.rubric ||
                data.jobs.some(
                  (job) =>
                    job.call_id === callId &&
                    job.kind === 'scoring' &&
                    ['queued', 'running'].includes(job.status),
                )
              }
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await api(`consultations/${callId}/score`, 'POST', {});
                  setNotice(
                    'Assessment queued. You can leave this page; check Analysis activity for progress and cancellation.',
                  );
                  await onChanged();
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Analysis failed.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? (
                <Busy>Submitting</Busy>
              ) : (
                <>
                  <Sparkles size={15} /> Run assessment
                </>
              )}
            </button>
          </div>
        </div>
        {!data.rubric ? (
          <div className="review-requirement">
            <LayersIcon />
            <span>Publish your rubric before recording an assessment.</span>
            <button className="text-button" onClick={onConfigure}>
              Define rubric <ArrowRight size={14} />
            </button>
          </div>
        ) : (
          !data.configuration.scoring && (
            <div className="review-requirement">
              <ShieldCheck size={15} />
              <span>
                Human review is available. Automated analysis requires a
                configured provider.
              </span>
            </div>
          )
        )}
      </section>
      {(error || refreshPending) && (
        <div className="product-error" role="alert">
          {refreshPending
            ? 'Assessment saved, but the latest workspace data could not be refreshed. Retry loading the saved result.'
            : error}
          {refreshPending && (
            <button
              className="text-button"
              onClick={() => void refreshSavedAssessment()}
            >
              Refresh saved assessment
            </button>
          )}
        </div>
      )}
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(String(value))}
        className="consultation-tabs"
      >
        <TabsList variant="line">
          <TabsTrigger value="transcript">
            <FileText size={15} /> Transcript
          </TabsTrigger>
          <TabsTrigger value="assessment">
            <ClipboardCheck size={15} /> Assessment
          </TabsTrigger>
          <TabsTrigger value="coaching">
            <BookOpen size={15} /> Coaching
          </TabsTrigger>
          <TabsTrigger value="practice">Practice</TabsTrigger>
          <TabsTrigger value="history">
            <History size={15} /> History{' '}
            <span className="count-badge">{detail.assessments.length}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="transcript">
          <TranscriptReader turns={call.turns} citedTurn={highlight} />
        </TabsContent>
        <TabsContent value="assessment">
          {assessment ? (
            <>
              {historical && (
                <div className="history-notice">
                  <History size={16} /> Viewing an earlier assessment from{' '}
                  {dateLabel(historical.created_at)}.
                  <button
                    className="text-button"
                    onClick={() => setHistorical(null)}
                  >
                    Return to latest
                  </button>
                </div>
              )}
              <div className="assessment-provenance">
                <span>
                  {assessment.kind === 'human'
                    ? 'Human assessment'
                    : 'AI-generated assessment'}
                </span>
                <span>
                  {assessment.content.supported_count} of 8 dimensions supported
                </span>
                <span>{dateLabel(assessment.created_at)}</span>
              </div>
              <div className="product-assessment-grid">
                {assessment.content.dimensions.map((d) => (
                  <article
                    className={`product-panel assessment-dimension ${d.unsupported ? 'unsupported' : ''}`}
                    key={d.dimension}
                  >
                    <div className="assessment-dimension-heading">
                      <span>0{d.dimension + 1}</span>
                      <h3>{DIMENSIONS[d.dimension]}</h3>
                      <strong>
                        {d.score === null ? 'N/A' : d.score}
                        <small>{d.score !== null ? '/5' : ''}</small>
                      </strong>
                    </div>
                    <Progress
                      value={(d.score ?? 0) * 20}
                      aria-label={`${DIMENSIONS[d.dimension]}: ${d.score ?? 'unsupported'}`}
                    />
                    {d.unsupported && (
                      <span className="unsupported-label">
                        Unsupported. Excluded from the score.
                      </span>
                    )}
                    <p className="assessment-rationale">{d.rationale}</p>
                    {d.evidence.map((e, i) => (
                      <button
                        key={i}
                        className="evidence-quote"
                        onClick={() => {
                          setHighlight(e.turn_index);
                          setTab('transcript');
                        }}
                      >
                        <Quote size={14} />
                        <span>
                          {e.span}
                          <small>
                            View source · Turn {e.turn_index + 1}{' '}
                            <ArrowRight size={13} />
                          </small>
                        </span>
                      </button>
                    ))}
                    {d.coaching_note && (
                      <div className="assessment-coaching-note">
                        <MessageSquareText size={16} />
                        <p>{d.coaching_note}</p>
                      </div>
                    )}
                  </article>
                ))}
              </div>
              <p className="provenance-note">
                Rubric version {assessment.rubric_id.slice(0, 8)} ·{' '}
                {assessment.model} · {assessment.prompt_version}. A matching
                quote establishes source presence; a reviewer must still assess
                its relevance.
              </p>
            </>
          ) : (
            <section className="product-panel">
              <Empty
                icon={ClipboardCheck}
                title="This consultation has not been assessed"
                description={
                  data.rubric
                    ? 'Record a human assessment using your published rubric. Each supported score needs an excerpt from the transcript.'
                    : 'Define and publish your rubric before assessing this consultation.'
                }
                action={
                  <button
                    className="primary-button"
                    disabled={viewer}
                    onClick={startHumanAssessment}
                  >
                    {data.rubric ? 'Start human assessment' : 'Define rubric'}
                    <ArrowRight size={16} />
                  </button>
                }
              />
            </section>
          )}
        </TabsContent>
        <TabsContent value="practice">
          <LearningWorkspace
            readOnly={viewer}
            call={call}
            coaching={detail.coaching}
            onRefresh={async () => {
              await reload();
              await onChanged();
            }}
            onHumanReview={startHumanAssessment}
          />
        </TabsContent>
        <TabsContent value="coaching">
          <CoachingPanel
            callId={callId}
            enabled={data.configuration.scoring && !viewer}
            coaching={detail.coaching}
            onSaved={async () => {
              await reload();
              await onChanged();
            }}
          />
        </TabsContent>
        <TabsContent value="history">
          <AssessmentComparison
            key={call.id}
            assessments={detail.assessments}
            onSource={(turnIndex) => {
              setHighlight(turnIndex);
              setTab('transcript');
            }}
          />
          <section className="product-panel">
            {detail.assessments.length ? (
              <div className="assessment-history">
                {detail.assessments.map((a, i) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setHistorical(i === 0 ? null : a);
                      setTab('assessment');
                    }}
                  >
                    <span className="history-icon">
                      <ClipboardCheck size={20} />
                    </span>
                    <div>
                      <strong>
                        {a.kind === 'human'
                          ? 'Human assessment'
                          : 'Automated assessment'}
                        {i === 0 && (
                          <span className="product-status approved">
                            Latest
                          </span>
                        )}
                      </strong>
                      <p>
                        {new Date(a.created_at).toLocaleString()} ·{' '}
                        {a.content.supported_count}/8 supported · Rubric{' '}
                        {a.rubric_id.slice(0, 8)}
                      </p>
                    </div>
                    <span className="history-score">
                      {a.content.average?.toFixed(1) ?? 'N/A'}
                    </span>
                    <ChevronRight size={17} />
                  </button>
                ))}
              </div>
            ) : (
              <Empty
                icon={History}
                title="Review history will appear here"
                description="Every saved assessment is a new version. Earlier assessments remain available after a correction."
              />
            )}
          </section>
        </TabsContent>
      </Tabs>
      {editOpen && editSession && (
        <AssessmentDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          call={editSession.call}
          rubric={editSession.rubric}
          latestAssessmentId={call.latest?.id ?? null}
          onSaved={async () => {
            setHistorical(null);
            setTab('assessment');
            setNotice('Human assessment saved as a new revision.');
            await refreshSavedAssessment();
          }}
        />
      )}
      <ConfirmDelete
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this consultation?"
        description="The transcript, assessments, coaching answers, and analysis runs will be permanently deleted. This cannot be undone."
        onConfirm={async () => {
          await api(`consultations/${callId}`, 'DELETE');
          await onDeleted();
        }}
      />
    </>
  );
}
function LayersIcon() {
  return <ClipboardCheck size={16} />;
}
function AssessmentDialog({
  open,
  onOpenChange,
  call,
  rubric: initialRubric,
  latestAssessmentId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  call: CallRecord;
  rubric: NonNullable<WorkspaceData['rubric']>;
  latestAssessmentId: string | null;
  onSaved: () => Promise<void>;
}) {
  const [rubric, setRubric] = useState(initialRubric);
  const [rubricId, setRubricId] = useState(initialRubric.id);
  const [versions, setVersions] = useState<
    { id: string; title: string; created_at: string }[]
  >([]);
  const [versionError, setVersionError] = useState('');
  useEffect(() => {
    if (!open) return;
    let active = true;
    void api<{ rubrics: typeof versions }>('rubrics').then(
      (result) => {
        if (active) {
          setVersions(result.rubrics);
          setVersionError('');
        }
      },
      () => {
        if (active)
          setVersionError(
            'Could not load the version list. The current rubric remains available; you can enter a known rubric ID.',
          );
      },
    );
    return () => {
      active = false;
    };
  }, [open]);
  const [active, setActive] = useState(0);
  const [entries, setEntries] = useState(
    DIMENSIONS.map((_, dimension) => {
      const existing =
        call.latest?.rubric_id === rubric.id
          ? call.latest.content.dimensions[dimension]
          : undefined;
      return createAssessmentDraftEntry(dimension, existing);
    }),
  );
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState('');
  const entry = entries[active];
  const anchor = rubric.definitions[active];
  const complete = entries.filter(assessmentDraftEntryReady).length;
  const update = (value: Partial<typeof entry>) =>
    setEntries((old) =>
      old.map((e, i) => (i === active ? { ...e, ...value } : e)),
    );
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!locked.current) onOpenChange(value);
      }}
    >
      <DialogContent className="assessment-dialog">
        <DialogHeader>
          <DialogTitle>Human assessment</DialogTitle>
          <DialogDescription>
            {rubric.title} · {complete} of 8 dimensions ready to save
          </DialogDescription>
        </DialogHeader>
        {latestAssessmentId !== (call.latest?.id ?? null) && (
          <output className="block rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            A newer assessment was saved while this draft was open. Your draft
            is preserved against its original revision. Saving will be rejected
            if that revision is no longer latest; copy any notes you need before
            closing and starting from the latest assessment.
          </output>
        )}
        <fieldset
          disabled={busy}
          aria-busy={busy}
          className="min-w-0 space-y-4"
        >
          <legend className="sr-only">Assessment draft</legend>
          <div className="rounded-lg border p-3 space-y-2">
            <label className="text-sm">
              Published rubric version
              <NativeSelect
                disabled={busy}
                value={rubricId}
                onChange={(e) => setRubricId(e.target.value)}
              >
                <NativeSelectOption value={rubric.id}>
                  {rubric.title} · current draft
                </NativeSelectOption>
                {versions
                  .filter((v) => v.id !== rubric.id)
                  .map((v) => (
                    <NativeSelectOption key={v.id} value={v.id}>
                      {v.title} · {new Date(v.created_at).toLocaleString()} ·{' '}
                      {v.id.slice(0, 8)}
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
            </label>
            <label className="block text-sm">
              Or enter a published rubric ID
              <input
                className="mt-1 block w-full rounded border p-2"
                value={rubricId}
                disabled={busy}
                onChange={(e) => setRubricId(e.target.value)}
                maxLength={100}
              />
            </label>
            <button
              type="button"
              className="secondary-button"
              disabled={busy || rubricId === rubric.id || !rubricId.trim()}
              onClick={async () => {
                if (locked.current) return;
                locked.current = true;
                setBusy(true);
                setError('');
                try {
                  const chosen = await api<
                    NonNullable<WorkspaceData['rubric']>
                  >(`rubrics/${encodeURIComponent(rubricId)}`);
                  setRubric(chosen);
                  setActive(0);
                  setEntries(
                    DIMENSIONS.map((_, dimension) =>
                      createAssessmentDraftEntry(dimension),
                    ),
                  );
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : 'Could not load rubric. Your draft is unchanged.',
                  );
                } finally {
                  locked.current = false;
                  setBusy(false);
                }
              }}
            >
              Start empty draft with selected rubric
            </button>
            <p className="text-sm text-slate-500">
              Loading a different version clears this assessment draft. Use the
              assignment’s baseline rubric for a comparable follow-up. Version
              list shows the latest 100 published rubrics.
            </p>
            {versionError && (
              <p role="alert" className="text-sm text-amber-800">
                {versionError}
              </p>
            )}
          </div>
          <div className="assessment-editor-layout">
            <nav aria-label="Rubric dimensions">
              {DIMENSIONS.map((d, i) => (
                <button
                  key={d}
                  aria-current={i === active ? 'step' : undefined}
                  className={i === active ? 'active' : ''}
                  onClick={() => setActive(i)}
                >
                  <span>0{i + 1}</span>
                  {d}
                  {assessmentDraftEntryReady(entries[i]) && <Check size={14} />}
                </button>
              ))}
            </nav>
            <div className="assessment-editor-main">
              <h3>{DIMENSIONS[active]}</h3>
              <div className="anchor-reference">
                {[
                  { score: 1, text: anchor.one },
                  { score: 3, text: anchor.three },
                  { score: 5, text: anchor.five },
                ].map((a) => (
                  <div key={a.score}>
                    <strong>{a.score}</strong>
                    <p>{a.text}</p>
                  </div>
                ))}
              </div>
              <div className="product-form">
                <label>
                  Assessment score
                  <NativeSelect
                    value={entry.score === null ? '' : entry.score}
                    onChange={(e) =>
                      update({
                        score: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  >
                    <NativeSelectOption value="">
                      Unsupported / not observable
                    </NativeSelectOption>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <NativeSelectOption key={n} value={n}>
                        {n} out of 5
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </label>
                <label>
                  Rationale
                  <textarea
                    aria-label="Rationale"
                    rows={3}
                    maxLength={2000}
                    value={entry.rationale}
                    onChange={(e) => update({ rationale: e.target.value })}
                    placeholder="Explain the assessment, or why this behavior is not observable."
                  />
                </label>
                <label>
                  Supporting transcript turn
                  <NativeSelect
                    value={entry.turn_index}
                    onChange={(e) => {
                      const index = Number(e.target.value);
                      update({
                        turn_index: index,
                        span: call.turns[index].text.slice(0, 6000),
                      });
                    }}
                  >
                    {call.turns.map((turn, i) => (
                      <NativeSelectOption key={i} value={i}>
                        Turn {i + 1} · {turn.role} · {turn.text.slice(0, 70)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </label>
                <div className="selected-turn-text">
                  {call.turns[entry.turn_index].text}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      update({
                        span: call.turns[entry.turn_index].text.slice(0, 6000),
                      })
                    }
                  >
                    Use this excerpt <ArrowRight size={13} />
                  </button>
                </div>
                <label>
                  Verbatim evidence
                  <textarea
                    aria-label="Verbatim evidence"
                    rows={2}
                    maxLength={6000}
                    value={entry.span}
                    onChange={(e) => update({ span: e.target.value })}
                    placeholder="Copy the relevant words from the selected turn."
                  />
                </label>
                {entry.additional_evidence.length > 0 && (
                  <details className="rounded-lg border border-slate-200 p-3 text-sm">
                    <summary className="cursor-pointer font-medium text-slate-700">
                      {entry.additional_evidence.length} additional citations
                      retained
                    </summary>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      These saved quotes stay attached when you edit the
                      assessment. Remove a quote explicitly to leave it out of
                      the new revision.
                    </p>
                    <div className="mt-3 space-y-3">
                      {entry.additional_evidence.map((evidence, index) => (
                        <div
                          key={`${evidence.turn_index}-${index}`}
                          className="rounded-lg bg-slate-50 p-3"
                        >
                          <blockquote className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
                            {evidence.span}
                          </blockquote>
                          <details className="mt-2 text-xs leading-5 text-slate-600">
                            <summary className="cursor-pointer font-medium text-sky-800">
                              View source · Turn {evidence.turn_index + 1}
                            </summary>
                            <p className="mt-2 whitespace-pre-wrap break-words">
                              {call.turns[evidence.turn_index]?.text ??
                                'Source turn unavailable.'}
                            </p>
                          </details>
                          <button
                            type="button"
                            className="mt-2 text-button text-xs"
                            aria-label={`Remove additional citation ${index + 1} from turn ${evidence.turn_index + 1}`}
                            onClick={() =>
                              update({
                                additional_evidence:
                                  entry.additional_evidence.filter(
                                    (_, position) => position !== index,
                                  ),
                              })
                            }
                          >
                            <Trash2 size={12} />
                            Remove citation
                          </button>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                <label>
                  Coaching note <span className="optional-label">Optional</span>
                  <textarea
                    aria-label="Coaching note"
                    rows={2}
                    maxLength={2000}
                    value={entry.coaching_note}
                    onChange={(e) => update({ coaching_note: e.target.value })}
                    placeholder="A specific action to practice next."
                  />
                </label>
              </div>
            </div>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="assessment-editor-footer">
            <span>Saving preserves earlier assessments.</span>
            <div>
              {active < 7 && (
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setActive(active + 1)}
                >
                  Next dimension <ChevronRight size={15} />
                </button>
              )}
              <button
                className="primary-button"
                disabled={busy || complete !== 8}
                onClick={async () => {
                  if (locked.current) return;
                  locked.current = true;
                  setBusy(true);
                  setError('');
                  try {
                    await api(`consultations/${call.id}/reviews`, 'POST', {
                      rubric_id: rubric.id,
                      base_assessment_id: call.latest?.id ?? '',
                      dimensions: buildAssessmentDimensions(entries),
                    });
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : 'Could not save the assessment.',
                    );
                    locked.current = false;
                    setBusy(false);
                    return;
                  }
                  // A confirmed write is successful even if the next read fails.
                  onOpenChange(false);
                  void onSaved();
                }}
              >
                {busy ? <Busy>Saving</Busy> : 'Save assessment'}
              </button>
            </div>
          </div>
        </fieldset>
      </DialogContent>
    </Dialog>
  );
}
function CoachingPanel({
  callId,
  enabled,
  coaching,
  onSaved,
}: {
  callId: string;
  enabled: boolean;
  coaching: Coaching[];
  onSaved: () => Promise<void>;
}) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sources, setSources] = useState<
    { chunk_id: string; title: string; body: string }[] | null
  >(null);
  return (
    <div className="coaching-workspace">
      {notice && (
        <output className="block rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
          {notice}
        </output>
      )}
      <section className="product-panel coaching-question">
        <div className="product-panel-heading">
          <div>
            <h2>Coaching, with a source</h2>
            <p>
              {enabled
                ? 'Ask a question grounded in your approved training material.'
                : 'Search approved source passages. AI-generated coaching requires provider configuration.'}
            </p>
          </div>
          <BookOpen size={22} />
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            setNotice('');
            try {
              if (enabled) {
                await api(`consultations/${callId}/coaching`, 'POST', {
                  question,
                });
                setNotice(
                  'Coaching queued. Check Analysis activity for progress or cancellation. Validated answers appear here after completion.',
                );
                await onSaved();
                setSources(null);
              } else {
                const response = await api<{
                  sources: NonNullable<typeof sources>;
                }>(`library/search?q=${encodeURIComponent(question)}`);
                setSources(response.sources);
              }
            } catch (e) {
              setError(
                e instanceof Error ? e.message : 'Could not retrieve guidance.',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="sr-only" htmlFor="coaching-question">
            Coaching question
          </label>
          <textarea
            id="coaching-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. How should we confirm a follow-up commitment?"
            maxLength={500}
            rows={3}
            required
          />
          <button
            className="primary-button"
            disabled={busy || !question.trim()}
          >
            {busy ? (
              <Busy>
                {enabled ? 'Submitting request' : 'Searching sources'}
              </Busy>
            ) : (
              <>
                {enabled
                  ? 'Generate grounded guidance'
                  : 'Find source passages'}
                <ArrowRight size={16} />
              </>
            )}
          </button>
          {enabled && (
            <button
              type="button"
              className="secondary-button"
              disabled={busy || !question.trim()}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  const result = await api<{
                    sources: NonNullable<typeof sources>;
                  }>(`library/search?q=${encodeURIComponent(question)}`);
                  setSources(result.sources);
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : 'Could not search approved guidance.',
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Search approved sources only
            </button>
          )}
        </form>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </section>
      {sources !== null && (
        <section className="product-panel retrieved-guidance">
          {sources.length ? (
            sources.map((s) => (
              <article key={s.chunk_id}>
                <h3>
                  <BookOpen size={16} />
                  {s.title}
                </h3>
                <p>{s.body}</p>
                <span>
                  Approved source passage · No generated interpretation
                </span>
              </article>
            ))
          ) : (
            <Empty
              icon={BookOpen}
              title="No relevant source passages"
              description="Add approved guidance on this topic to your knowledge library, or try terms that appear in your documents."
            />
          )}
        </section>
      )}
      {coaching.map((c) => (
        <article key={c.id} className="product-panel coaching-answer">
          <div>
            <span className="product-status">
              AI-generated · Review before use
            </span>
            <small>{dateLabel(c.created_at)}</small>
          </div>
          <h3>{c.question}</h3>
          <p>{c.answer}</p>
          <div className="coaching-citations">
            {c.citations.map((source, i) => (
              <blockquote key={`${source.chunk_id}-${i}`}>
                <span>
                  <BookOpen size={14} />
                  {source.title}
                </span>
                <p>{source.span}</p>
              </blockquote>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
