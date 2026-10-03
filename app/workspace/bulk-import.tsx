'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, FileSpreadsheet, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api, selectedWorkspace } from '@/lib/api';
import {
  executeImport,
  IMPORT_MAX_BYTES,
  importTemplate,
  previewImport,
  type ImportResult,
  type ImportRow,
} from '@/lib/bulk-import';

export function BulkImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => Promise<void>;
}) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const locked = useRef(false);
  const selection = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const invalid = rows.filter((row) => row.error).length;
  const saved = results.filter((row) => row.status === 'saved').length;
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!locked.current) onOpenChange(value);
      }}
    >
      <DialogContent
        className="product-dialog max-h-[90dvh] overflow-y-auto sm:max-w-3xl"
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet size={20} />
            Import a training batch
          </DialogTitle>
          <DialogDescription>
            Review up to 50 synthetic or role-play consultations before saving.
            Files stay in your browser until you confirm. Real patient data is
            not supported.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-medium">CSV · maximum 2 MB · 50 records</p>
            <Button
              variant="outline"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([importTemplate()], {
                    type: 'text/csv;charset=utf-8',
                  }),
                );
                const link = document.createElement('a');
                link.href = url;
                link.download = 'consultiq-import-template.csv';
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              <Download size={16} />
              Download template
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Use source <code>roleplay</code> or <code>synthetic</code>, dates as
            YYYY-MM-DD, and transcript turns labeled Coordinator: and Patient:.
            Spreadsheet CSV export preserves multiline cells.
          </p>
          <label className="block space-y-2 text-sm font-medium">
            Choose a CSV file
            <input
              className="block w-full rounded-lg border p-2 font-normal"
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                const version = ++selection.current;
                setRows([]);
                setResults([]);
                setConfirmed(false);
                setAttempted(false);
                setError('');
                setFilename(file?.name ?? '');
                if (!file) return;
                try {
                  if (file.size > IMPORT_MAX_BYTES)
                    throw new Error('CSV must be 2 MB or smaller.');
                  const text = await file.text();
                  if (version === selection.current)
                    setRows(previewImport(text));
                } catch (e) {
                  if (version === selection.current)
                    setError(
                      e instanceof Error
                        ? e.message
                        : 'Could not read this file.',
                    );
                }
              }}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Re-importing a previously saved file creates duplicates. Duplicate
            checks cover this file only.
          </p>
        </div>
        {rows.length > 0 && (
          <>
            <p className="text-sm">
              <strong>{filename}</strong> · {rows.length - invalid} valid ·{' '}
              {invalid} need correction
            </p>
            <div className="max-h-64 overflow-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="p-3">CSV record</th>
                    <th className="p-3">Consultation</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const result = results.find((item) => item.row === row.row);
                    return (
                      <tr key={row.row} className="border-t">
                        <td className="p-3">{row.row}</td>
                        <td className="p-3 break-words">{row.title}</td>
                        <td className="p-3">
                          {result?.status === 'saved'
                            ? 'Saved'
                            : result?.status === 'uncertain'
                              ? 'Check workspace before retrying'
                              : (row.error ??
                                (attempted ? 'Not submitted' : 'Ready'))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!attempted && (
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy || invalid > 0}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-1"
                />
                I confirm these are synthetic or role-play records and want to
                add all {rows.length} consultations to the current workspace.
              </label>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <output aria-live="polite" className="text-sm text-muted-foreground">
          {attempted
            ? `${saved} confirmed saved of ${rows.length}.${busy ? ' Importing sequentially…' : ' No automatic retries were made.'}`
            : 'All rows must be valid before import.'}
        </output>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {attempted ? 'Close' : 'Cancel'}
          </Button>
          <Button
            disabled={
              busy || attempted || !confirmed || !rows.length || invalid > 0
            }
            onClick={async () => {
              if (locked.current || attempted) return;
              const workspaceAtStart = selectedWorkspace();
              locked.current = true;
              setBusy(true);
              setAttempted(true);
              setError('');
              try {
                const outcome = await executeImport(
                  rows,
                  (payload) =>
                    api<{ id: string }>('consultations', 'POST', payload),
                  setResults,
                  () =>
                    mounted.current && selectedWorkspace() === workspaceAtStart,
                );
                if (
                  !mounted.current ||
                  selectedWorkspace() !== workspaceAtStart
                )
                  return;
                if (outcome.stopped)
                  setError(
                    'Import stopped because a save could not be confirmed or the workspace changed. Earlier confirmed records are saved. Refresh the workspace and check the uncertain record before preparing a new file containing only missing records.',
                  );
                try {
                  await onImported();
                } catch {
                  setError((previous) =>
                    `${previous} Saved records were not rolled back, but the workspace could not refresh. Refresh before another import.`.trim(),
                  );
                }
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : 'Import stopped. Check your workspace before retrying.',
                );
              } finally {
                locked.current = false;
                setBusy(false);
              }
            }}
          >
            {busy && <LoaderCircle className="animate-spin" size={16} />}
            {busy ? 'Importing…' : `Import ${rows.length || ''} consultations`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
