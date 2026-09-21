'use client';
import { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  CircleCheck,
  FileText,
  History,
  Layers3,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { api } from '@/lib/api';
import {
  DIMENSIONS,
  type KnowledgeDocument,
  type Rubric,
  type RubricDefinition,
  type WorkspaceData,
} from '@/lib/product';
import {
  Busy,
  ConfirmDelete,
  DocumentDialog,
  Empty,
  SearchField,
  dateLabel,
} from './components';
export function RubricEditor({
  current,
  reload,
}: {
  current: Rubric | null;
  reload: () => Promise<void>;
}) {
  const [title, setTitle] = useState(
    current?.title ?? 'Consultation review standard',
  );
  const [definitions, setDefinitions] = useState<RubricDefinition[]>(
    current?.definitions ??
      DIMENSIONS.map((_, dimension) => ({
        dimension,
        one: '',
        three: '',
        five: '',
      })),
  );
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const edit = (
    index: number,
    key: 'one' | 'three' | 'five',
    value: string,
  ) => {
    setDefinitions((old) =>
      old.map((d, i) => (i === index ? { ...d, [key]: value } : d)),
    );
    setApproved(false);
    setSuccess('');
  };
  const completed = definitions.filter(
    (d) =>
      d.one.trim().length >= 12 &&
      d.three.trim().length >= 12 &&
      d.five.trim().length >= 12,
  ).length;
  return (
    <div className="rubric-editor">
      <div className="rubric-status">
        <div className="rubric-status-icon">
          <Layers3 size={22} />
        </div>
        <div>
          <h2>
            {current
              ? `Current standard: ${current.title}`
              : 'Define your first review standard'}
          </h2>
          <p>
            {current
              ? `Published ${dateLabel(current.created_at)}. Saving creates a new version; previous assessments keep their original rubric.`
              : 'Write observable anchors for each dimension. Publish only when the criteria reflect your coaching standard.'}
          </p>
        </div>
        <span className="product-status">
          {current ? 'Published' : 'Not published'}
        </span>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setSuccess('');
          setBusy(true);
          try {
            await api('rubrics', 'POST', { title, definitions, approved });
            await reload();
            setApproved(false);
            setSuccess(
              'Rubric published. New assessments will use this version.',
            );
          } catch (e) {
            setError(
              e instanceof Error ? e.message : 'Could not publish the rubric.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="product-form rubric-name-field">
          <label>
            Rubric name
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setApproved(false);
              }}
              maxLength={120}
              required
            />
          </label>
          <p>
            {completed} of {DIMENSIONS.length} dimensions complete
          </p>
        </div>
        <Accordion
          multiple
          defaultValue={['dimension-0']}
          className="rubric-accordion"
        >
          {DIMENSIONS.map((name, index) => (
            <AccordionItem key={name} value={`dimension-${index}`}>
              <AccordionTrigger>
                <span className="rubric-item-label">
                  <span className="rubric-item-number">0{index + 1}</span>
                  {name}
                  {definitions[index].one.length >= 12 &&
                    definitions[index].three.length >= 12 &&
                    definitions[index].five.length >= 12 && (
                      <CircleCheck size={16} />
                    )}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="anchor-grid">
                  {[
                    {
                      key: 'one',
                      label: '1 · Limited or absent',
                      placeholder:
                        'Describe the observable behavior that warrants the lowest score.',
                    },
                    {
                      key: 'three',
                      label: '3 · Partially demonstrated',
                      placeholder:
                        'Describe what an adequate but incomplete example looks like.',
                    },
                    {
                      key: 'five',
                      label: '5 · Clearly demonstrated',
                      placeholder:
                        'Describe the evidence required for a strong assessment.',
                    },
                  ].map(({ key, label, placeholder }) => (
                    <label key={key}>
                      {label}
                      <textarea
                        rows={5}
                        maxLength={2000}
                        value={
                          definitions[index][key as 'one' | 'three' | 'five']
                        }
                        onChange={(e) =>
                          edit(
                            index,
                            key as 'one' | 'three' | 'five',
                            e.target.value,
                          )
                        }
                        placeholder={placeholder}
                      />
                    </label>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <div className="rubric-publish-panel">
          <div>
            <label className="checkbox-label" htmlFor="approve-rubric">
              <Checkbox
                id="approve-rubric"
                checked={approved}
                onCheckedChange={(value) => setApproved(value === true)}
              />
              <span>
                I approve these anchors as the assessment standard for my
                workspace.
              </span>
            </label>
            <p>
              Rubrics are versioned. Publishing does not rescore existing
              consultations.
            </p>
          </div>
          <button
            className="primary-button"
            disabled={busy || !approved || completed !== 8}
          >
            {busy ? (
              <Busy>Publishing</Busy>
            ) : (
              <>
                Publish rubric <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {success && (
          <output className="success-message">
            <Check size={16} />
            {success}
          </output>
        )}
      </form>
    </div>
  );
}
export function Knowledge({
  data,
  reload,
}: {
  data: WorkspaceData;
  reload: () => Promise<void>;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<KnowledgeDocument | null>(null);
  const [deleting, setDeleting] = useState<KnowledgeDocument | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<
    | { chunk_id: string; document_id: string; title: string; body: string }[]
    | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <div className="knowledge-toolbar">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              const response = await api<{
                sources: NonNullable<typeof results>;
              }>(`library/search?q=${encodeURIComponent(query)}`);
              setResults(response.sources);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Search failed.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search approved guidance"
          />
          <button className="secondary-button" disabled={busy || !query.trim()}>
            {busy ? (
              <Busy>Searching</Busy>
            ) : (
              <>
                Search <Search size={15} />
              </>
            )}
          </button>
        </form>
        <button className="primary-button" onClick={() => setAddOpen(true)}>
          <Plus size={16} /> Add document
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {results !== null && (
        <section className="product-panel source-results">
          <div className="product-panel-heading">
            <div>
              <h2>Source passages</h2>
              <p>Keyword matches from your approved library.</p>
            </div>
            <button
              className="text-button"
              onClick={() => {
                setResults(null);
                setQuery('');
              }}
            >
              Clear search
            </button>
          </div>
          {results.length ? (
            results.map((result) => (
              <article key={result.chunk_id}>
                <span>
                  <BookOpen size={16} />
                  {result.title}
                </span>
                <p>{result.body}</p>
                <button
                  className="text-button"
                  onClick={() =>
                    setSelected(
                      data.documents.find((d) => d.id === result.document_id) ??
                        null,
                    )
                  }
                >
                  Open document <ArrowRight size={14} />
                </button>
              </article>
            ))
          ) : (
            <Empty
              icon={Search}
              title="No matching guidance"
              description="Try terms used in your source documents, or add approved material that covers this topic."
            />
          )}
        </section>
      )}
      {data.documents.length ? (
        <div className="document-grid">
          {data.documents.map((doc) => (
            <article className="product-panel document-card" key={doc.id}>
              <div className="document-heading">
                <span className="document-icon">
                  <FileText size={22} />
                </span>
                <span className="product-status approved">Approved</span>
              </div>
              <h2>{doc.title}</h2>
              <p>
                {doc.body.slice(0, 170)}
                {doc.body.length > 170 ? '…' : ''}
              </p>
              <div className="document-footer">
                <span>{dateLabel(doc.created_at)}</span>
                <div>
                  <button
                    className="text-button"
                    onClick={() => setSelected(doc)}
                  >
                    Read <ArrowRight size={14} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Delete ${doc.title}`}
                    onClick={() => setDeleting(doc)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="product-panel">
          <Empty
            icon={BookOpen}
            title="Give coaching a reliable source"
            description="Add your approved playbooks, follow-up procedures, and training guidance. These passages can support recommendations with citations."
            action={
              <button
                className="primary-button"
                onClick={() => setAddOpen(true)}
              >
                <Plus size={16} /> Add your first document
              </button>
            }
          />
        </section>
      )}
      <DocumentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={reload}
      />
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent className="document-sheet">
          <SheetHeader>
            <SheetTitle>{selected?.title}</SheetTitle>
            <SheetDescription>Approved source document</SheetDescription>
          </SheetHeader>
          <div className="document-body">{selected?.body}</div>
        </SheetContent>
      </Sheet>
      <ConfirmDelete
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Delete this source document?"
        description="The document and its indexed passages will be deleted. Saved AI coaching answers in this workspace will also be cleared so removed source material is not retained in generated answers."
        onConfirm={async () => {
          await api(`library/${deleting!.id}`, 'DELETE');
          setResults(null);
          await reload();
        }}
      />
    </>
  );
}
export function WorkspaceSettings({
  data,
  reload,
}: {
  data: WorkspaceData;
  reload: () => Promise<void>;
}) {
  const [name, setName] = useState(data.workspace.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  return (
    <div className="settings-layout">
      <section className="product-panel settings-section">
        <div className="product-panel-heading">
          <div>
            <h2>Workspace details</h2>
            <p>Your private working environment.</p>
          </div>
          <Settings2 size={20} />
        </div>
        <form
          className="product-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              await api('workspace', 'PATCH', { name });
              await reload();
              setSuccess(true);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : 'Could not save settings.',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Workspace name
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSuccess(false);
              }}
              maxLength={100}
              required
            />
          </label>
          <div className="form-actions">
            {success && (
              <output className="inline-success">
                <Check size={15} /> Saved
              </output>
            )}
            <button className="primary-button" disabled={busy}>
              {busy ? <Busy>Saving</Busy> : 'Save changes'}
            </button>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </form>
      </section>
      <section className="product-panel settings-section">
        <div className="product-panel-heading">
          <div>
            <h2>Analysis readiness</h2>
            <p>Available capabilities for this workspace.</p>
          </div>
          <ShieldCheck size={20} />
        </div>
        <div className="readiness-list">
          {[
            {
              name: 'Persistent consultation records',
              ready: true,
              detail: 'Saved records survive browser sessions.',
            },
            {
              name: 'Approved review rubric',
              ready: !!data.rubric,
              detail:
                data.rubric?.title ?? 'Publish your anchors in Review rubric.',
            },
            {
              name: 'Automated assessment',
              ready: data.configuration.scoring,
              detail: data.configuration.scoring
                ? `Provider model: ${data.configuration.model}`
                : 'A server-side provider key and model are required.',
            },
            {
              name: 'LangSmith tracing',
              ready: data.configuration.tracing,
              detail: data.configuration.tracing
                ? 'Metadata tracing enabled. Transcript and document content are excluded.'
                : 'Requires a server-side LangSmith project and key.',
            },
            {
              name: 'Coaching knowledge',
              ready: data.documents.length > 0,
              detail: data.documents.length
                ? `${data.documents.length} approved documents available.`
                : 'Add approved material to the knowledge library.',
            },
          ].map((item) => (
            <div key={item.name}>
              <span
                className={
                  item.ready ? 'readiness-icon ready' : 'readiness-icon'
                }
              >
                {item.ready ? <Check size={14} /> : <span />}
              </span>
              <div>
                <strong>{item.name}</strong>
                <p>{item.detail}</p>
              </div>
              <span
                className={`product-status ${item.ready ? 'approved' : ''}`}
              >
                {item.ready ? 'Ready' : 'Setup needed'}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="product-panel settings-section">
        <div className="product-panel-heading">
          <div>
            <h2>Recent analysis runs</h2>
            <p>
              Processing status, measured duration and reported token usage.
            </p>
          </div>
          <History size={20} />
        </div>
        {data.jobs.length ? (
          <div className="run-list">
            {data.jobs.map((job) => (
              <div key={job.id}>
                <div className="run-information">
                  <strong>
                    {job.kind === 'scoring'
                      ? 'Rubric assessment'
                      : 'Grounded coaching'}
                  </strong>
                  <small>
                    {dateLabel(job.created_at)}
                    {job.error_code
                      ? ` · ${job.error_code.replaceAll('_', ' ')}`
                      : ''}
                  </small>
                  <span className="run-id">Run {job.id}</span>
                  {job.telemetry ? (
                    <dl className="run-metrics">
                      <div>
                        <dt>Analysis</dt>
                        <dd>{runDuration(job.telemetry.total_ms)}</dd>
                      </div>
                      <div>
                        <dt>Model response</dt>
                        <dd>{runDuration(job.telemetry.model_ms)}</dd>
                      </div>
                      <div>
                        <dt>Validation & save</dt>
                        <dd>{runDuration(job.telemetry.validation_save_ms)}</dd>
                      </div>
                      <div>
                        <dt>Input tokens (uncached)</dt>
                        <dd>
                          {job.telemetry.input_tokens?.toLocaleString() ??
                            'Not reported'}
                        </dd>
                      </div>
                      <div>
                        <dt>Output tokens</dt>
                        <dd>
                          {job.telemetry.output_tokens?.toLocaleString() ??
                            'Not reported'}
                        </dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="run-measurement-note">
                      {job.status === 'running'
                        ? 'Measurements available after completion.'
                        : 'Measurements were not recorded for this run.'}
                    </p>
                  )}
                </div>
                <span
                  className={`product-status ${job.status === 'completed' ? 'approved' : job.status === 'failed' ? 'failed' : ''}`}
                >
                  {job.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="settings-empty">
            Analysis runs will appear here after automated scoring or coaching
            is enabled.
          </p>
        )}
        {data.jobs.length > 0 && (
          <p className="run-measurement-note">
            Analysis time excludes initial loading, source retrieval, trace
            delivery and optional measurement recording. Tokens are
            provider-reported counts, not a bill. Unknown usage is never counted
            as zero.
          </p>
        )}
      </section>
      <section className="settings-boundary">
        <ShieldCheck size={21} />
        <div>
          <h3>Pilot data boundary</h3>
          <p>
            This release supports synthetic and role-play transcripts. Customer
            invitations, audio processing, real patient data onboarding, and
            calibrated outcome prediction are not enabled.
          </p>
        </div>
      </section>
    </div>
  );
}

function runDuration(ms: number | null) {
  if (ms === null) return 'Not recorded';
  if (ms < 1) return '<1 ms';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}
