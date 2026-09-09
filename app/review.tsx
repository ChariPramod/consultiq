'use client';
import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  CalendarDays,
  ChevronRight,
  FileText,
  Info,
  MessageSquare,
  Quote,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  averageScore,
  coordinators,
  dimensions,
  summarize,
  type Consultation,
} from '@/lib/consultations';
const turnIndices = [0, 2, 5, 7, 4, 9, 11, 9];
const notes = [
  'Begin with an open question about what matters most to the patient.',
  'Acknowledge the feeling before moving to the treatment plan.',
  'Explain the next stage in plain language, then check understanding.',
  'Connect cost to the full treatment plan and explore payment questions.',
  'Ask one more question to understand the concern before responding.',
  'Offer a specific next step and ask the patient to confirm it.',
  'Reassure the patient about support without promising an outcome.',
  'Agree on a date, name who will follow up, and confirm how to reach the patient.',
];
export function CallReview({
  call,
  onBack,
}: {
  call: Consultation;
  onBack: () => void;
}) {
  const [activeDimension, setActiveDimension] = useState(0);
  const [tab, setTab] = useState('rubric');
  const [flipped, setFlipped] = useState(false);
  const score = averageScore(call);
  const turnIndex = turnIndices[activeDimension];
  const excerpt = call.transcript[turnIndex];
  const showEvidence = (i: number) => {
    setActiveDimension(i);
    setTab('transcript');
  };
  return (
    <div className="review-page">
      <button className="text-button back-button" onClick={onBack}>
        <ArrowLeft size={16} /> Back to consultations
      </button>
      <div className="report-metadata">
        <span>
          <Users size={15} />
          {call.coordinator}
        </span>
        <span>
          <CalendarDays size={15} />
          {call.date}
        </span>
        <span>
          <AudioLines size={15} />
          {call.id}
        </span>
        <span className="source-label">
          {call.source === 'Demo'
            ? 'Illustrative demo consultation'
            : 'Session-only transcript'}
        </span>
      </div>
      <div className="report-summary">
        <article className="panel report-stat">
          <div className="metric-label">
            Overall rubric score
            <ActivityMark />
          </div>
          <div className="metric-value">
            {score?.toFixed(1) ?? 'Not scored'}
            {score !== null && <span>/ 5</span>}
          </div>
          <p>
            {score === null
              ? 'Your transcript is ready for review.'
              : 'An illustrative assessment across eight dimensions.'}
          </p>
        </article>
        <article className="panel report-stat">
          <div className="metric-label">
            Illustrative acceptance estimate
            <Target size={18} />
          </div>
          <div className="metric-value">
            {call.probability ? `${call.probability}%` : 'Unavailable'}
          </div>
          <p>No trained model connected. Uncertainty is unavailable.</p>
        </article>
        <article className="report-coaching">
          <div className="focus-label">
            <Sparkles size={16} /> NEXT COACHING STEP
          </div>
          <h3>
            {score === null
              ? 'Start with the conversation'
              : dimensions[call.scores.indexOf(Math.min(...call.scores))]}
          </h3>
          <p>
            {score === null
              ? 'Review the speaker labels and transcript before requesting a rubric assessment.'
              : notes[call.scores.indexOf(Math.min(...call.scores))]}
          </p>
        </article>
      </div>
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(String(v))}
        className="report-tabs"
      >
        <TabsList variant="line" className="report-tabs-list">
          <TabsTrigger value="rubric">Rubric assessment</TabsTrigger>
          <TabsTrigger value="transcript">
            Transcript{' '}
            <span className="count-badge">{call.transcript.length}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="rubric">
          {score === null ? (
            <div className="panel empty-state">
              <FileText />
              <h3>Ready for a human review</h3>
              <p>
                Automated scoring is not connected. No scores or acceptance
                predictions have been generated for this transcript.
              </p>
              <button
                className="primary-button"
                onClick={() => setTab('transcript')}
              >
                Read transcript <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <>
              <div className="assessment-note">
                <Info size={16} />
                <span>
                  Demo scores are authored examples. Source excerpts let you
                  inspect the conversation, but do not establish that a score is
                  correct.
                </span>
              </div>
              <div className="rubric-grid">
                {dimensions.map((dimension, i) => (
                  <article className="panel rubric-card" key={dimension}>
                    <div className="rubric-heading">
                      <span className="dimension-index">0{i + 1}</span>
                      <h3>{dimension}</h3>
                      <strong
                        className={call.scores[i] <= 2 ? 'amber-text' : ''}
                      >
                        {call.scores[i]}
                        <small>/5</small>
                      </strong>
                    </div>
                    <Progress
                      value={call.scores[i] * 20}
                      className={`rubric-progress ${call.scores[i] <= 2 ? 'progress-amber' : ''}`}
                      aria-label={`${dimension}: ${call.scores[i]} out of 5`}
                    />
                    <blockquote>
                      <Quote size={14} />
                      <p>
                        {call.transcript[turnIndices[i]]?.text ??
                          'No supporting excerpt available.'}
                      </p>
                    </blockquote>
                    <div className="coaching-note">
                      <Sparkles size={14} />
                      <p>{notes[i]}</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => showEvidence(i)}
                    >
                      View in transcript <ArrowUpRightIcon />
                    </button>
                  </article>
                ))}
              </div>
            </>
          )}
        </TabsContent>
        <TabsContent value="transcript">
          <div className="transcript-layout">
            <article className="panel transcript-panel">
              <div className="panel-heading">
                <div>
                  <h2>Conversation transcript</h2>
                  <p>
                    {call.source === 'Demo'
                      ? 'Scripted excerpts with illustrative timestamps'
                      : 'Pasted speaker labels; timestamps are not available'}
                  </p>
                </div>
                <button
                  className="quiet-button"
                  onClick={() => setFlipped(!flipped)}
                >
                  Swap speaker labels
                </button>
              </div>
              <div className="transcript-turns">
                {call.transcript.map((turn, i) => {
                  const role = flipped
                    ? turn.role === 'Coordinator'
                      ? 'Patient'
                      : 'Coordinator'
                    : turn.role;
                  return (
                    <div
                      key={i}
                      className={`transcript-turn ${call.source === 'Demo' && i === turnIndex ? 'highlighted-turn' : ''}`}
                      id={`turn-${i}`}
                    >
                      <div
                        className={`turn-avatar ${role === 'Patient' ? 'patient-avatar' : ''}`}
                      >
                        {role === 'Coordinator' ? 'TC' : 'P'}
                      </div>
                      <div>
                        <div className="turn-heading">
                          <strong>{role}</strong>
                          <span>{turn.time || `Turn ${i + 1}`}</span>
                          {call.source === 'Demo' && i === turnIndex && (
                            <span className="evidence-tag">Source excerpt</span>
                          )}
                        </div>
                        <p>{turn.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {flipped && (
                <div className="assessment-note">
                  <Info size={16} />
                  Labels are swapped for this review only. Demo scores still
                  refer to the original labels.
                </div>
              )}
            </article>
            <aside className="panel evidence-panel">
              <div className="panel-heading">
                <div>
                  <h2>Evidence lens</h2>
                  <p>Connect the assessment to the words.</p>
                </div>
              </div>
              {score !== null ? (
                <>
                  <div className="evidence-dimensions">
                    {dimensions.map((d, i) => (
                      <button
                        key={d}
                        className={activeDimension === i ? 'active' : ''}
                        onClick={() => {
                          setActiveDimension(i);
                          document
                            .getElementById(`turn-${turnIndices[i]}`)
                            ?.scrollIntoView({
                              behavior: 'smooth',
                              block: 'center',
                            });
                        }}
                      >
                        <span>{d}</span>
                        <strong>
                          {call.scores[i]}
                          <ChevronRight size={14} />
                        </strong>
                      </button>
                    ))}
                  </div>
                  <div className="selected-evidence">
                    <span className="focus-label">
                      <MessageSquare size={14} /> COACHING NOTE
                    </span>
                    <p>{notes[activeDimension]}</p>
                    <small>
                      {excerpt
                        ? `Source: turn ${turnIndex + 1} · ${excerpt.time}`
                        : 'No supporting excerpt'}
                    </small>
                  </div>
                </>
              ) : (
                <div className="selected-evidence">
                  <p>
                    Evidence will appear here after an assessment. This import
                    has not been scored.
                  </p>
                </div>
              )}
            </aside>
          </div>
        </TabsContent>
      </Tabs>
      <div className="assessment-note">
        <ShieldCheck size={15} />
        <span>
          {call.source === 'Demo'
            ? 'This report demonstrates the review workflow using synthetic data. It is not a real clinical or model evaluation.'
            : 'This transcript stays in this page session. Refreshing or closing the page clears it.'}
        </span>
      </div>
    </div>
  );
}
function ActivityMark() {
  return <AudioLines size={18} />;
}
function ArrowUpRightIcon() {
  return <ArrowRight size={14} />;
}
export function CoordinatorView({
  calls,
  onReview,
}: {
  calls: Consultation[];
  onReview: (name: string) => void;
}) {
  return (
    <div className="coordinator-grid">
      {coordinators
        .filter((name) => calls.some((c) => c.coordinator === name))
        .map((name, index) => {
          const own = calls.filter((c) => c.coordinator === name);
          const scored = own.filter((c) => c.scores.length);
          const stats = summarize(own);
          const averages = dimensions.map((_, i) =>
            scored.length
              ? scored.reduce((sum, c) => sum + c.scores[i], 0) / scored.length
              : 0,
          );
          const weak = averages.indexOf(Math.min(...averages));
          return (
            <article className="panel coordinator-card" key={name}>
              <div className="coordinator-heading">
                <span className={`avatar large-avatar avatar-${index}`}>
                  {name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')}
                </span>
                <div>
                  <h2>{name}</h2>
                  <p>{own.length} consultations · Demo coordinator</p>
                </div>
                <div className="coordinator-score">
                  {stats.score?.toFixed(1) ?? '—'}
                  <span>/ 5</span>
                </div>
              </div>
              <div className="dimension-bars">
                {dimensions.map((d, i) => (
                  <div className="dimension-bar" key={d}>
                    <span>{d}</span>
                    <div>
                      <Progress
                        value={averages[i] * 20}
                        aria-label={`${d}: ${averages[i].toFixed(1)} out of 5`}
                      />
                      <strong>{averages[i].toFixed(1)}</strong>
                    </div>
                  </div>
                ))}
              </div>
              <div className="coordinator-priority">
                <LightbulbIcon />
                <div>
                  <span>COACHING PRIORITY</span>
                  <strong>{dimensions[weak]}</strong>
                </div>
              </div>
              <button className="text-button" onClick={() => onReview(name)}>
                Review consultations <ArrowRight size={16} />
              </button>
            </article>
          );
        })}
    </div>
  );
}
function LightbulbIcon() {
  return <Sparkles size={19} />;
}
export function PatternView({
  calls,
  onReview,
}: {
  calls: Consultation[];
  onReview: () => void;
}) {
  const accepted = calls.filter(
    (c) => c.outcome === 'Accepted' && c.scores.length,
  );
  const declined = calls.filter(
    (c) => c.outcome === 'Not accepted' && c.scores.length,
  );
  return (
    <>
      <div className="pattern-banner">
        <span className="pattern-banner-icon">
          <BarIcon />
        </span>
        <div>
          <h2>Find the moments that matter.</h2>
          <p>
            Compare conversation behaviors across outcomes in the selected demo
            calls.
          </p>
        </div>
        <span className="source-label">Exploratory · Synthetic data</span>
      </div>
      <div className="pattern-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>What differs across outcomes?</h2>
              <p>Average dimension score, grouped by recorded outcome</p>
            </div>
          </div>
          <div className="comparison-legend">
            <span>
              <i />
              Accepted ({accepted.length})
            </span>
            <span>
              <i />
              Not accepted ({declined.length})
            </span>
          </div>
          <div className="comparison-chart">
            {dimensions.map((d, i) => {
              const a = accepted.length
                ? accepted.reduce((s, c) => s + c.scores[i], 0) /
                  accepted.length
                : 0;
              const b = declined.length
                ? declined.reduce((s, c) => s + c.scores[i], 0) /
                  declined.length
                : 0;
              return (
                <div className="comparison-row" key={d}>
                  <span>{d}</span>
                  <div>
                    <div className="compare-track">
                      <span style={{ width: `${a * 20}%` }} />
                      <strong>{accepted.length ? a.toFixed(1) : 'N/A'}</strong>
                    </div>
                    <div className="compare-track declined-track">
                      <span style={{ width: `${b * 20}%` }} />
                      <strong>{declined.length ? b.toFixed(1) : 'N/A'}</strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <div className="pattern-side">
          <article className="focus-card">
            <div className="focus-label">
              <Sparkles size={16} /> A PLACE TO START
            </div>
            <h2>
              Make the next step
              <br />a shared commitment.
            </h2>
            <p>
              Review how coordinators close follow-up conversations. Look for a
              named owner, a date, and a clear confirmation from the patient.
            </p>
            <button onClick={onReview}>
              Explore follow-up calls <ArrowRight size={16} />
            </button>
          </article>
          <article className="panel pattern-explainer">
            <ShieldCheck size={21} />
            <h3>A signal, not a conclusion</h3>
            <p>
              These are descriptive comparisons of authored demo examples. They
              do not show causation, statistical significance, or performance on
              real consultations.
            </p>
            <p>
              Phrase mining and objection recovery analysis will need the
              scoring pipeline and a larger evaluated dataset.
            </p>
          </article>
        </div>
      </div>
    </>
  );
}
function BarIcon() {
  return <AudioLines size={25} />;
}
export function RubricGuide() {
  return (
    <>
      <div className="guide-intro panel">
        <div className="guide-icon">
          <ShieldCheck size={28} />
        </div>
        <div>
          <h2>Every score starts with the conversation.</h2>
          <p>
            ConsultIQ’s proposed rubric looks at eight observable behaviors. A
            score should be supported by a transcript excerpt and lead to one
            specific coaching action.
          </p>
        </div>
      </div>
      <div className="guide-grid">
        {dimensions.map((d, i) => (
          <article className="panel guide-card" key={d}>
            <span className="dimension-index">0{i + 1}</span>
            <h3>{d}</h3>
            <p>{notes[i]}</p>
          </article>
        ))}
      </div>
      <div className="assessment-note">
        <Info size={18} />
        <span>
          Dimension names come from the project scope. Final score anchors and
          judge prompts are owner-authored and have not been connected to this
          demo.
        </span>
      </div>
    </>
  );
}
