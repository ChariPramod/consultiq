'use client';
import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
export function ReviewExport({ callId }: { callId: string }) {
  const alive = useRef(true);
  const locked = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function download(format: 'json' | 'csv') {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api<{
        filename: string;
        mime: string;
        content: string;
      }>(`consultations/${encodeURIComponent(callId)}/export?format=${format}`);
      if (!alive.current) return;
      const url = URL.createObjectURL(
        new Blob([result.content], { type: result.mime }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : 'Export unavailable. Try again.',
        );
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section className="my-4 rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Share a review with your team</h3>
          <p className="mt-1 text-sm text-slate-500">
            Download transcript, review revisions and supporting evidence. CSV
            opens in spreadsheet tools; JSON preserves structured provenance.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void download('csv')}
          >
            <Download />
            CSV
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void download('json')}
          >
            <Download />
            JSON
          </Button>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Files contain the conversation text. Share only with authorized
        recipients. This is a file export, not automatic app synchronization.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
