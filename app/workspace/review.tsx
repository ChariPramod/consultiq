'use client';
import { useCallback, useEffect, useState } from 'react';
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
}: {
  callId: string;
  data: WorkspaceData;
  onChanged: () => Promise<void>;
  onBack: () => void;
  onDeleted: () => Promise<void>;
  onConfigure: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('transcript');
  const [highlight, setHighlight] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [historical, setHistorical] = useState<SavedAssessment | null>(null);
  const reload = useCallback(async () => {
    try {
      const result = await api<Detail>(`consultations/${callId}`);
      setDetail(result);
      setError('');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not open the consultation.',
      );
    }
  }, [callId]);
  useEffect(() => {
    let active = true;
    void api<Detail>(`consultations/${callId}`).then(
      (result) => {
        if (active) setDetail(result);
      },
      (error: unknown) => {
        if (active)
          setError(
            error instanceof Error
              ? error.message
              : 'Could not open the consultation.',
          );
      },
    );
    return () => {
      active = false;
    };
  }, [callId]);
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
  if (!detail)
    return (
      <section className="product-panel">
        {error ? (
          <div className="product-empty">
            <p role="alert">{error}</p>
            <button className="primary-button" onClick={() => void reload()}>
              Retry
            </button>
            <button className="text-button" onClick={onBack}>
              Back to consultations
            </button>
          </div>
        ) : (
          <output className="product-loading">
            <LoaderCircle className="spin" size={21} /> Loading consultation
          </output>
        )}
      </section>
    );
  const { call } = detail;
  const assessment = historical ?? call.latest;
  return (
    <>
      <div className="review-navigation">
        <button className="text-button" onClick={onBack}>
          <ArrowLeft size={15} /> All consultations
        </button>
        <button className="danger-link" onClick={() => setDeleteOpen(true)}>
          <Trash2 size={15} /> Delete consultation
        </button>
      </div>
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
              disabled={busy}
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
              disabled={busy || !data.rubric}
              onClick={() => setEditOpen(true)}
            >
              <Pencil size={15} /> Human assessment
            </button>
            <button
              className="primary-button"
              disabled={busy || !data.configuration.scoring || !data.rubric}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await api(`consultations/${callId}/score`, 'POST', {});
                  await reload();
                  await onChanged();
                  setHistorical(null);
                  setTab('assessment');
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Analysis failed.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? (
                <Busy>Processing</Busy>
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
      {error && (
        <div className="product-error" role="alert">
          {error}
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
          <TabsTrigger value="history">
            <History size={15} /> History{' '}
            <span className="count-badge">{detail.assessments.length}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="transcript">
          <section className="product-panel transcript-record">
            <div className="product-panel-heading">
              <div>
                <h2>Original transcript</h2>
                <p>
                  Speaker labels and timestamps are preserved from your import.
                </p>
              </div>
              <span className="product-status">Read only</span>
            </div>
            <div className="source-turns">
              {call.turns.map((turn, i) => (
                <article
                  id={`source-turn-${i}`}
                  key={i}
                  className={
                    highlight === i ? 'source-turn highlighted' : 'source-turn'
                  }
                >
                  <span
                    className={
                      turn.role === 'Coordinator'
                        ? 'speaker-avatar'
                        : 'speaker-avatar patient'
                    }
                  >
                    {turn.role === 'Coordinator' ? 'TC' : 'P'}
                  </span>
                  <div>
                    <div className="source-turn-meta">
                      <strong>{turn.role}</strong>
                      <span>{turn.time || `Turn ${i + 1}`}</span>
                      {highlight === i && (
                        <span className="product-status approved">
                          Cited evidence
                        </span>
                      )}
                    </div>
                    <p>{turn.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
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
                    onClick={() =>
                      data.rubric ? setEditOpen(true) : onConfigure()
                    }
                  >
                    {data.rubric ? 'Start human assessment' : 'Define rubric'}
                    <ArrowRight size={16} />
                  </button>
                }
              />
            </section>
          )}
        </TabsContent>
        <TabsContent value="coaching">
          <CoachingPanel
            callId={callId}
            enabled={data.configuration.scoring}
            coaching={detail.coaching}
            onSaved={async () => {
              await reload();
              await onChanged();
            }}
          />
        </TabsContent>
        <TabsContent value="history">
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
      {data.rubric && (
        <AssessmentDialog
          key={`${call.id}-${call.latest?.id ?? 'new'}`}
          open={editOpen}
          onOpenChange={setEditOpen}
          call={call}
          rubric={data.rubric}
          onSaved={async () => {
            await reload();
            await onChanged();
            setHistorical(null);
            setTab('assessment');
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
  rubric,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  call: CallRecord;
  rubric: NonNullable<WorkspaceData['rubric']>;
  onSaved: () => Promise<void>;
}) {
  const [active, setActive] = useState(0);
  const [entries, setEntries] = useState(
    DIMENSIONS.map((_, dimension) => {
      const existing = call.latest?.content.dimensions[dimension];
      return {
        dimension,
        score: existing?.score ?? null,
        rationale: existing?.rationale ?? '',
        coaching_note: existing?.coaching_note ?? '',
        turn_index: existing?.evidence[0]?.turn_index ?? 0,
        span: existing?.evidence[0]?.span ?? '',
      };
    }),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const entry = entries[active];
  const anchor = rubric.definitions[active];
  const complete = entries.filter(
    (e) =>
      e.rationale.trim().length >= 3 &&
      (e.score === null || e.span.trim().length >= 8),
  ).length;
  const update = (value: Partial<typeof entry>) =>
    setEntries((old) =>
      old.map((e, i) => (i === active ? { ...e, ...value } : e)),
    );
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <DialogContent className="assessment-dialog">
        <DialogHeader>
          <DialogTitle>Human assessment</DialogTitle>
          <DialogDescription>
            {rubric.title} · {complete} of 8 dimensions ready to save
          </DialogDescription>
        </DialogHeader>
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
                {entries[i].rationale.trim().length >= 3 &&
                  (entries[i].score === null ||
                    entries[i].span.trim().length >= 8) && <Check size={14} />}
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
                  rows={2}
                  maxLength={6000}
                  value={entry.span}
                  onChange={(e) => update({ span: e.target.value })}
                  placeholder="Copy the relevant words from the selected turn."
                />
              </label>
              <label>
                Coaching note <span className="optional-label">Optional</span>
                <textarea
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
                setBusy(true);
                setError('');
                try {
                  await api(`consultations/${call.id}/reviews`, 'POST', {
                    rubric_id: rubric.id,
                    base_assessment_id: call.latest?.id ?? '',
                    dimensions: entries.map((e) => ({
                      dimension: e.dimension,
                      score: e.score,
                      rationale: e.rationale,
                      coaching_note: e.coaching_note,
                      evidence: e.span.trim()
                        ? [{ turn_index: e.turn_index, span: e.span }]
                        : [],
                    })),
                  });
                  await onSaved();
                  onOpenChange(false);
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : 'Could not save the assessment.',
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Busy>Saving</Busy> : 'Save assessment'}
            </button>
          </div>
        </div>
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
  const [sources, setSources] = useState<
    { chunk_id: string; title: string; body: string }[] | null
  >(null);
  return (
    <div className="coaching-workspace">
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
            try {
              if (enabled) {
                await api(`consultations/${callId}/coaching`, 'POST', {
                  question,
                });
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
                {enabled ? 'Preparing guidance' : 'Searching sources'}
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
