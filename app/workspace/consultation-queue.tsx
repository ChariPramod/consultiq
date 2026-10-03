'use client';
import { useEffect, useState } from 'react';
import {
  Download,
  RefreshCw,
  Upload,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { api } from '@/lib/api';
import { csv, OUTCOME_LABELS, type ConsultationSummary } from '@/lib/product';
import { CallTable, Empty } from './components';

type Page = {
  calls: ConsultationSummary[];
  next_cursor: string | null;
  has_more: boolean;
  total: number;
};
export function ConsultationQueue({
  coordinator,
  onOpen,
  onImport,
  onBulkImport,
  readOnly,
}: {
  coordinator: string;
  onOpen: (id: string) => void;
  onImport: () => void;
  onBulkImport: () => void;
  readOnly: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [outcome, setOutcome] = useState('all');
  const [review, setReview] = useState('all');
  const [person, setPerson] = useState(
    coordinator === 'all' ? '' : coordinator,
  );
  const [personFilter, setPersonFilter] = useState(person);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [result, setResult] = useState<{
    key: string;
    page: Page | null;
    error: string;
  } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const cursor = cursors[cursors.length - 1];
  const requestKey = JSON.stringify([
    q,
    outcome,
    review,
    personFilter,
    cursor,
    refresh,
  ]);
  const current = result?.key === requestKey ? result : null;
  const page = current?.page ?? null;
  const error = current?.error ?? '';
  const loading = !current;
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ q, outcome, review, limit: '25' });
    if (personFilter) params.set('coordinator', personFilter);
    if (cursor) params.set('cursor', cursor);
    void api<Page>(`consultations?${params}`).then(
      (page) => {
        if (active) setResult({ key: requestKey, page, error: '' });
      },
      (e) => {
        if (active) {
          setResult({
            key: requestKey,
            page: null,
            error:
              e instanceof Error
                ? e.message
                : 'Could not load the review queue.',
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [q, outcome, review, personFilter, cursor, requestKey]);
  const reset = () => setCursors([null]);
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border bg-white p-5">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Review queue</h2>
            <p className="mt-1 text-sm text-slate-500">
              Search all saved records and prioritize conversations awaiting a
              review.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => setRefresh((x) => x + 1)}
            >
              <RefreshCw />
              Refresh
            </Button>
            {!readOnly && (
              <Button variant="outline" onClick={onBulkImport}>
                <Upload />
                Import CSV
              </Button>
            )}
          </div>
        </div>
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(draft.trim());
            setPersonFilter(person.trim());
            reset();
          }}
        >
          <Input
            aria-label="Search title or coordinator"
            placeholder="Search conversations…"
            value={draft}
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Input
            aria-label="Exact coordinator name"
            placeholder="Coordinator (exact name)"
            value={person}
            maxLength={200}
            onChange={(e) => setPerson(e.target.value)}
          />
          <NativeSelect
            aria-label="Review status"
            value={review}
            onChange={(e) => {
              setReview(e.target.value);
              reset();
            }}
          >
            <NativeSelectOption value="all">
              All review states
            </NativeSelectOption>
            <NativeSelectOption value="unreviewed">
              Awaiting first review
            </NativeSelectOption>
            <NativeSelectOption value="ai">
              Latest review: AI
            </NativeSelectOption>
            <NativeSelectOption value="human">
              Latest review: human
            </NativeSelectOption>
          </NativeSelect>
          <NativeSelect
            aria-label="Recorded outcome"
            value={outcome}
            onChange={(e) => {
              setOutcome(e.target.value);
              reset();
            }}
          >
            <NativeSelectOption value="all">All outcomes</NativeSelectOption>
            {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button type="submit">Search</Button>
        </form>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <span>
            Review state refers to the latest saved assessment. AI output still
            needs human review.
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft('');
              setQ('');
              setPerson('');
              setPersonFilter('');
              setOutcome('all');
              setReview('all');
              reset();
            }}
          >
            Clear filters
          </Button>
        </div>
      </section>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4"
        >
          <p>{error}</p>
          <Button
            className="mt-3"
            variant="outline"
            onClick={() => {
              reset();
              setRefresh((x) => x + 1);
            }}
          >
            Reload first page
          </Button>
        </div>
      )}
      {loading && (
        <output className="p-8 text-center text-slate-500">
          Loading review queue…
        </output>
      )}
      {page && (
        <>
          <section className="product-panel">
            {page.calls.length ? (
              <CallTable calls={page.calls} onOpen={onOpen} />
            ) : (
              <Empty
                title="No conversations match"
                description="Adjust the filters or import a role-play transcript to begin."
                action={
                  !readOnly ? (
                    <Button onClick={onImport}>Import transcript</Button>
                  ) : undefined
                }
              />
            )}
          </section>
          <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-slate-500">
            <span>
              {page.total} matching records · Page {cursors.length} ·{' '}
              {page.calls.length} shown
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!page.calls.length}
                onClick={() => {
                  const url = URL.createObjectURL(
                    new Blob([csv(page.calls)], {
                      type: 'text/csv;charset=utf-8',
                    }),
                  );
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'consultiq-review-queue-page.csv';
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                <Download />
                Export this page
              </Button>
              <Button
                variant="outline"
                disabled={cursors.length === 1 || loading}
                onClick={() => setCursors((x) => x.slice(0, -1))}
              >
                <ArrowLeft />
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={!page.has_more || !page.next_cursor || loading}
                onClick={() => {
                  if (page.next_cursor)
                    setCursors((x) => [...x, page.next_cursor]);
                }}
              >
                Next
                <ArrowRight />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
