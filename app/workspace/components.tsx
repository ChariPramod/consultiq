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
import { api } from '@/lib/api';
import {
  OUTCOME_LABELS,
  type CallRecord,
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
export function Score({ call }: { call: CallRecord }) {
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
  calls: CallRecord[];
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
                    {call.turns.length} transcript turns
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
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onCreated: (call: CallRecord) => Promise<void>;
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
  const input = useRef<HTMLInputElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!busy) onOpenChange(v);
      }}
    >
      <DialogContent className="product-dialog">
        <DialogHeader>
          <DialogTitle>Import a consultation</DialogTitle>
          <DialogDescription>
            Add a synthetic or role-play transcript to your private workspace.
          </DialogDescription>
        </DialogHeader>
        <form
          className="product-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              const call = await api<CallRecord>('consultations', 'POST', {
                title,
                coordinator,
                source,
                recorded_at: recorded,
                transcript,
              });
              await onCreated(call);
              onOpenChange(false);
              setTitle('');
              setTranscript('');
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Import failed.');
            } finally {
              setBusy(false);
            }
          }}
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
                if (!file) return;
                try {
                  if (
                    file.size > 100000 ||
                    !file.name.toLowerCase().endsWith('.txt')
                  )
                    throw new Error('Choose a .txt file smaller than 100 KB.');
                  setTranscript(await file.text());
                  setError('');
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : 'File could not be read.',
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
            <button className="primary-button" disabled={busy}>
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
