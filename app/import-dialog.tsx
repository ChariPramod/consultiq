'use client';
import { useRef, useState } from 'react';
import { AudioLines, FileText, Info, Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  coordinators,
  parseTranscript,
  type Consultation,
} from '@/lib/consultations';
export function ImportDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImport: (c: Consultation) => void;
}) {
  const [title, setTitle] = useState('');
  const [coordinator, setCoordinator] = useState(coordinators[0]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const submit = (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      if (!title.trim()) throw new Error('Give this consultation a title.');
      const transcript = parseTranscript(text);
      const call: Consultation = {
        id: `CQ-${crypto.randomUUID().slice(0, 8)}`,
        title: title.trim(),
        coordinator,
        initials: coordinator
          .split(' ')
          .map((n) => n[0])
          .join(''),
        date: new Date().toISOString().slice(0, 10),
        duration: 0,
        outcome: 'Unscored',
        scores: [],
        transcript,
        source: 'Session import',
      };
      onImport(call);
      setTitle('');
      setText('');
      setError('');
      onOpenChange(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Unable to import the transcript.',
      );
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="import-dialog">
        <DialogHeader>
          <div className="import-icon">
            <AudioLines size={25} />
          </div>
          <DialogTitle className="import-title">
            A new conversation to learn from.
          </DialogTitle>
          <DialogDescription>
            Import a synthetic or role-play transcript into this session.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="text">
          <TabsList className="import-tabs">
            <TabsTrigger value="text">
              <FileText size={16} /> Paste transcript
            </TabsTrigger>
            <TabsTrigger value="audio">
              <AudioLines size={16} /> Audio recording
            </TabsTrigger>
          </TabsList>
          <TabsContent value="text">
            <form onSubmit={submit} className="import-form">
              <label>
                Consultation title
                <input
                  autoComplete="off"
                  maxLength={100}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Implant consultation role-play"
                  required
                />
              </label>
              <label>
                Coordinator
                <NativeSelect
                  value={coordinator}
                  onChange={(e) => setCoordinator(e.target.value)}
                >
                  {coordinators.map((c) => (
                    <NativeSelectOption key={c}>{c}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
              <label>
                Transcript
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={100000}
                  placeholder={
                    'Coordinator: What would you like to change about your smile?\nPatient: I would like to feel more confident.'
                  }
                  rows={7}
                  required
                  aria-describedby="transcript-help"
                />
              </label>
              <div className="file-row">
                <span id="transcript-help">
                  One turn per line, labeled Coordinator: or Patient:
                </span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={14} /> Load .txt
                </button>
                <input
                  type="file"
                  accept=".txt,text/plain"
                  hidden
                  ref={fileRef}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      if (!file.name.toLowerCase().endsWith('.txt'))
                        throw new Error('Choose a .txt transcript file.');
                      if (file.size > 100000)
                        throw new Error(
                          'Choose a text file smaller than 100 KB.',
                        );
                      setText(await file.text());
                      setError('');
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : 'Could not read the file.',
                      );
                    } finally {
                      if (fileRef.current) fileRef.current.value = '';
                    }
                  }}
                />
              </div>
              <div className="import-notice">
                <Info size={16} />
                <p>
                  Session only. Refreshing clears imports. Automated scoring is
                  not connected, so imported calls will remain unscored.
                </p>
              </div>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="primary-button">
                Import transcript <Upload size={16} />
              </button>
            </form>
          </TabsContent>
          <TabsContent value="audio">
            <div className="audio-unavailable">
              <AudioLines size={34} />
              <h3>Audio transcription is next.</h3>
              <p>
                The transcription service is not connected yet. Use the
                transcript tab to review a synthetic or role-play conversation
                today.
              </p>
              <span>Planned formats: MP3, MP4, WAV</span>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
