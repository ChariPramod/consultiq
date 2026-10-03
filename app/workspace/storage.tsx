'use client';
import { useEffect, useRef, useState } from 'react';
import { Database, RefreshCw, HardDrive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatLogicalBytes, type StorageUsage } from '@/lib/storage';
const labels: Record<string, string> = {
  consultations: 'Conversation records',
  assessments: 'Assessment history',
  library: 'Approved library',
  coaching: 'Coaching and reviews',
  practice: 'Practice and follow-ups',
  team: 'Workspace and team',
  operations: 'Jobs and audit history',
};
export function StoragePanel() {
  const [snapshot, setSnapshot] = useState<StorageUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true),
    locked = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function refresh() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api<StorageUsage>('storage');
      if (alive.current) setSnapshot(result);
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : 'Storage usage could not be loaded.',
        );
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const domains = snapshot
    ? Object.entries(
        snapshot.tables.reduce<
          Record<string, { records: number; bytes: number }>
        >((groups, row) => {
          const existing = groups[row.domain] ?? { records: 0, bytes: 0 };
          groups[row.domain] = {
            records: existing.records + row.records,
            bytes: existing.bytes + row.logical_text_bytes,
          };
          return groups;
        }, {}),
      ).sort((a, b) => b[1].bytes - a[1].bytes)
    : [];
  return (
    <section
      className="product-panel settings-section"
      aria-labelledby="storage-heading"
    >
      <div className="product-panel-heading">
        <div>
          <h2 id="storage-heading">Workspace storage</h2>
          <p>
            See where saved text is accumulating before deciding what to retain.
          </p>
        </div>
        <Database size={20} />
      </div>
      <div className="p-5 sm:p-6">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void refresh()}
        >
          <RefreshCw size={16} />
          {busy
            ? 'Measuring…'
            : snapshot
              ? 'Refresh usage'
              : 'Measure storage usage'}
        </Button>
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
          >
            {error}
            {snapshot ? ' The last successful snapshot remains below.' : ''}
          </p>
        )}
        {snapshot ? (
          <div className="mt-5 space-y-5">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-4">
                <dt className="flex items-center gap-2 text-sm text-slate-600">
                  <HardDrive size={16} />
                  Logical text stored
                </dt>
                <dd className="mt-2 text-2xl font-semibold tabular-nums">
                  {formatLogicalBytes(snapshot.logical_text_bytes)}
                </dd>
                <p className="mt-1 text-xs text-slate-500">
                  UTF-8 text bytes across your workspace records.
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <dt className="text-sm text-slate-600">Stored records</dt>
                <dd className="mt-2 text-2xl font-semibold tabular-nums">
                  {snapshot.total_records.toLocaleString()}
                </dd>
                <p className="mt-1 text-xs text-slate-500">
                  Includes revisions, chunks, jobs and metadata.
                </p>
              </div>
            </dl>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Area</TableHead>
                  <TableHead className="text-right">Records</TableHead>
                  <TableHead className="text-right">Text bytes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domains.map(([domain, usage]) => (
                  <TableRow key={domain}>
                    <TableCell>{labels[domain] ?? domain}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {usage.records.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatLogicalBytes(usage.bytes)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Inspect table breakdown
              </summary>
              <div className="mt-3 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Table</TableHead>
                      <TableHead className="text-right">Records</TableHead>
                      <TableHead className="text-right">Text bytes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapshot.tables.map((row) => (
                      <TableRow key={row.table}>
                        <TableCell className="font-mono text-xs">
                          {row.table}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.records.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatLogicalBytes(row.logical_text_bytes)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </details>
            <p className="text-xs text-slate-500">
              Snapshot: {new Date(snapshot.measured_at).toLocaleString()}.
              Recalculate manually after imports or deletions.
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            Usage is calculated on request across this workspace. Nothing has
            been measured yet.
          </p>
        )}
        <div className="mt-5 rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
          <p>
            These totals count text payloads and metadata, including reference
            chunks stored alongside documents. They exclude database pages,
            indexes, replicas and backups, so they are not physical disk usage
            or a hosting bill.
          </p>
          <p className="mt-2">
            Identical approved-document content is rejected within the
            workspace. Existing duplicates and review history are preserved.
            This panel never deletes records automatically.
          </p>
        </div>
      </div>
    </section>
  );
}
