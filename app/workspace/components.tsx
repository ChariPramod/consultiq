'use client';
import { useRef, useState } from 'react';
import {
  ArrowRight,
  AudioLines,
  ChevronRight,
  FileText,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Checkbox } from '@/components/ui/checkbox';
import { api, ApiError } from '@/lib/api';
import {
  OUTCOME_LABELS,
  type CallRecord,
  type ConsultationSummary,
  type KnowledgeDocument,
} from '@/lib/product';
export const dateLabel = (date: string) =>
  new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
export function Empty({
  icon: Icon = FileText,
  title,
  description,
  action,
}: {
  icon?: typeof FileText;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="product-empty">
      <div className="empty-icon">
        <Icon size={26} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Busy({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LoaderCircle size={16} className="spin" />
      {children}
    </>
  );
}
export function Outcome({ outcome }: { outcome: CallRecord['outcome'] }) {
  return (
    <span className={`product-status outcome-${outcome}`}>
      {OUTCOME_LABELS[outcome]}
    </span>
  );
}
export function Score({ call }: { call: Pick<ConsultationSummary, 'latest'> }) {
  if (!call.latest)
    return <span className="product-status awaiting">Awaiting review</span>;
  return (
    <span className="product-score">
      {call.latest.content.average?.toFixed(1) ?? 'Not scored'}
      {call.latest.content.average !== null && <small>/ 5</small>}
      {call.latest.content.supported_count < 8 && (
        <span className="coverage-warning">
          {call.latest.content.supported_count}/8 supported
        </span>
      )}
    </span>
  );
}
export function CallTable({
  calls,
  onOpen,
}: {
  calls: (CallRecord | ConsultationSummary)[];
  onOpen: (id: string) => void;
}) {
  return (
    <Table className="product-table">
      <TableHeader>
        <TableRow>
          <TableHead>Consultation</TableHead>
          <TableHead>Coordinator</TableHead>
          <TableHead>Recorded</TableHead>
          <TableHead>Assessment</TableHead>
          <TableHead>Outcome</TableHead>
          <TableHead>
            <span className="sr-only">Review</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {calls.map((call) => (
          <TableRow key={call.id}>
            <TableCell>
              <button
                onClick={() => onOpen(call.id)}
                className="product-call-link"
              >
                <span className="product-call-icon">
                  <AudioLines size={18} />
                </span>
                <span>
                  <strong>{call.title}</strong>
                  <small>
                    {call.source === 'roleplay' ? 'Role-play' : 'Synthetic'} ·{' '}
                    {'turn_count' in call ? call.turn_count : call.turns.length}{' '}
                    transcript turns
                  </small>
                </span>
              </button>
            </TableCell>
            <TableCell>{call.coordinator}</TableCell>
            <TableCell>{dateLabel(call.recorded_at)}</TableCell>
            <TableCell>
              <Score call={call} />
            </TableCell>
            <TableCell>
              <Outcome outcome={call.outcome} />
            </TableCell>
            <TableCell>
              <button
                aria-label={`Review ${call.title}`}
                className="icon-button"
                onClick={() => onOpen(call.id)}
              >
                <ChevronRight size={17} />
              </button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
export function ConfirmDelete({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <AlertDialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          onOpenChange(value);
          setError('');
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className="destructive-button"
            onClick={async (event) => {
              event.preventDefault();
              setBusy(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Deletion failed.');
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Deleting…' : 'Delete permanently'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
export function TranscriptDialog({
  open,
  onOpenChange,
  onCreated,
  onInspect,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onCreated: (call: CallRecord) => Promise<void>;
  onInspect: () => void;
}) {
  const [title, setTitle] = useState('');
  const [coordinator, setCoordinator] = useState('');
  const [source, setSource] = useState('roleplay');
  const [recorded, setRecorded] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [transcript, setTranscript] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<CallRecord | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [checkedRecords, setCheckedRecords] = useState(false);
  const locked = useRef(false);
  const confirmed = useRef<CallRecord | null>(null);
  const fileRead = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  function resetDraft() {
    confirmed.current = null;
    setSaved(null);
    setUncertain(false);
    setCheckedRecords(false);
    setTitle('');
    setTranscript('');
    setError('');
    fileRead.current++;
  }
  async function openSaved(call: CallRecord) {
    try {
      await onCreated(call);
      onOpenChange(false);
      resetDraft();
    } catch {
      setError(
        'The consultation is saved, but the workspace could not refresh. Open the saved consultation again when your connection recovers; this will not import it twice.',
      );
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!locked.current) onOpenChange(v);
      }}
    >
      <DialogContent className="product-dialog">
        <DialogHeader>
          <DialogTitle>Import a consultation</DialogTitle>
          <DialogDescription>
            Add a synthetic or role-play transcript to your private workspace.
          </DialogDescription>
        </DialogHeader>
        {saved ? (
          <div className="space-y-5">
            <output className="block rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
              <strong className="block">Consultation saved</strong>
              <span className="mt-1 block break-words">
                {saved.title || title}
              </span>
              <span className="mt-2 block break-all text-xs">
                Record ID: {saved.id}
              </span>
            </output>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Your import is complete. Opening the saved record only refreshes
              the workspace. You can safely close this dialog.
            </p>
            <div className="form-actions flex-wrap">
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                Close
              </button>
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={resetDraft}
              >
                Import another consultation
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={busy}
                onClick={async () => {
                  if (locked.current || !confirmed.current) return;
                  locked.current = true;
                  setBusy(true);
                  setError('');
                  try {
                    await openSaved(confirmed.current);
                  } finally {
                    locked.current = false;
                    setBusy(false);
                  }
                }}
              >
                {busy ? (
                  <Busy>Opening saved consultation</Busy>
                ) : (
                  'Open saved consultation'
                )}
              </button>
            </div>
          </div>
        ) : (
          <form
            className="product-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                locked.current ||
                confirmed.current ||
                (uncertain && !checkedRecords)
              )
                return;
              locked.current = true;
              fileRead.current++;
              setBusy(true);
              setError('');
              setUncertain(false);
              setCheckedRecords(false);
              try {
                const call = await api<CallRecord>('consultations', 'POST', {
                  title,
                  coordinator,
                  source,
                  recorded_at: recorded,
                  transcript,
                });
                if (!call || typeof call.id !== 'string' || !call.id)
                  throw new ApiError(
                    'The saved record could not be confirmed. Check your consultation list before saving again.',
                    200,
                    'invalid_response',
                  );
                // Persistence is confirmed before any refresh or navigation.
                confirmed.current = call;
                setSaved(call);
                await openSaved(call);
              } catch (e) {
                setUncertain(
                  !(e instanceof ApiError) ||
                    e.status === 0 ||
                    e.status >= 500 ||
                    e.code === 'invalid_response',
                );
                setError(
                  e instanceof Error
                    ? e.message
                    : 'Import could not be confirmed.',
                );
              } finally {
                locked.current = false;
                setBusy(false);
              }
            }}
          >
            <fieldset
              disabled={busy}
              className="product-form min-w-0 border-0 p-0"
            >
              <label>
                Consultation title
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  maxLength={120}
                  placeholder="e.g. Follow-up consultation"
                />
              </label>
              <div className="form-columns">
                <label>
                  Coordinator
                  <input
                    value={coordinator}
                    onChange={(e) => setCoordinator(e.target.value)}
                    required
                    maxLength={100}
                    placeholder="Coordinator name"
                  />
                </label>
                <label>
                  Recorded on
                  <input
                    type="date"
                    value={recorded}
                    onChange={(e) => setRecorded(e.target.value)}
                    required
                  />
                </label>
              </div>
              <label htmlFor="import-source">
                Source
                <NativeSelect
                  id="import-source"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  <NativeSelectOption value="roleplay">
                    Role-play recording
                  </NativeSelectOption>
                  <NativeSelectOption value="synthetic">
                    Synthetic transcript
                  </NativeSelectOption>
                </NativeSelect>
              </label>
              <label>
                Transcript
                <textarea
                  rows={7}
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  required
                  maxLength={100000}
                  placeholder={
                    'Coordinator: What would you like to discuss?\nPatient: I have a question about the next step.'
                  }
                  aria-describedby="transcript-format"
                />
              </label>
              <div className="input-help-row">
                <p id="transcript-format">
                  One speaker per line. Optional timestamps: [01:24].
                </p>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => input.current?.click()}
                >
                  <Upload size={14} /> Load .txt
                </button>
                <input
                  ref={input}
                  type="file"
                  hidden
                  accept=".txt,text/plain"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    const version = ++fileRead.current;
                    if (!file || locked.current) return;
                    try {
                      if (
                        file.size > 100000 ||
                        !file.name.toLowerCase().endsWith('.txt')
                      )
                        throw new Error(
                          'Choose a .txt file smaller than 100 KB.',
                        );
                      const text = await file.text();
                      if (version !== fileRead.current || locked.current)
                        return;
                      setTranscript(text);
                      setError('');
                    } catch (e) {
                      if (version === fileRead.current && !locked.current)
                        setError(
                          e instanceof Error
                            ? e.message
                            : 'File could not be read.',
                        );
                    } finally {
                      if (input.current) input.current.value = '';
                    }
                  }}
                />
              </div>
              <div className="product-notice">
                <ShieldCheck size={17} />
                <p>
                  The pilot accepts synthetic and role-play content. Audio
                  transcription and real patient recordings are not enabled.
                </p>
              </div>
            </fieldset>
            {uncertain && (
              <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                <p>
                  The import may already be saved. No automatic retry was made.
                  Check your consultation list before submitting this draft
                  again.
                </p>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    onOpenChange(false);
                    onInspect();
                  }}
                >
                  Check consultation list
                </button>
                <p>
                  Your draft stays available when you reopen Import transcript
                  in this workspace.
                </p>
                <label
                  className="checkbox-label"
                  htmlFor="import-checked-records"
                >
                  <Checkbox
                    id="import-checked-records"
                    checked={checkedRecords}
                    onCheckedChange={(value) =>
                      setCheckedRecords(value === true)
                    }
                  />
                  <span>I checked and this consultation was not saved.</span>
                </label>
              </div>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={busy || (uncertain && !checkedRecords)}
              >
                {busy ? (
                  <Busy>Saving consultation</Busy>
                ) : (
                  <>
                    Save consultation <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
export function DocumentDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onCreated: () => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!busy) onOpenChange(v);
      }}
    >
      <DialogContent className="product-dialog">
        <DialogHeader>
          <DialogTitle>Add approved knowledge</DialogTitle>
          <DialogDescription>
            Store guidance you are authorized to use for consultation coaching.
          </DialogDescription>
        </DialogHeader>
        <form
          className="product-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              await api<KnowledgeDocument>('library', 'POST', {
                title,
                body,
                approved,
              });
              await onCreated();
              onOpenChange(false);
              setTitle('');
              setBody('');
              setApproved(false);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : 'Could not save the document.',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Document title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={150}
              required
              placeholder="e.g. Follow-up guidelines"
            />
          </label>
          <label>
            Approved content
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              maxLength={60000}
              required
              placeholder="Paste the guidance your team uses."
            />
          </label>
          <label className="checkbox-label" htmlFor="approve-document">
            <Checkbox
              id="approve-document"
              checked={approved}
              onCheckedChange={(value) => setApproved(value === true)}
            />
            <span>
              I have permission to use this material and approve it as a
              coaching source.
            </span>
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <button className="primary-button" disabled={busy || !approved}>
              {busy ? (
                <Busy>Saving</Busy>
              ) : (
                <>
                  Add to library <Plus size={16} />
                </>
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function SearchField({
  value,
  onChange,
  placeholder = 'Search consultations',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="product-search">
      <Search size={17} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
