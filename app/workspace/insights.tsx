'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpenCheck,
  CheckCheck,
  ClipboardList,
  FileText,
  RefreshCw,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import type { WorkspaceInsights } from '@/lib/insights';
import { DIMENSIONS, OUTCOME_LABELS } from '@/lib/product';

type InsightsProps = {
  onOpenQueue?: () => void;
  onImport?: () => void;
  onOpenCoordinator?: (name: string) => void;
};
const count = (value: number) => value.toLocaleString();

export function Insights({
  onOpenQueue,
  onImport,
  onOpenCoordinator,
}: InsightsProps) {
  const [snapshot, setSnapshot] = useState<WorkspaceInsights | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const request = useRef(0);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const current = ++request.current;
    setBusy(true);
    setError('');
    try {
      const result = await api<WorkspaceInsights>('insights');
      if (current === request.current && !signal?.aborted) setSnapshot(result);
    } catch (e) {
      if (current === request.current && !signal?.aborted)
        setError(
          e instanceof Error
            ? e.message
            : 'Insights could not be loaded. Try again.',
        );
    } finally {
      if (current === request.current && !signal?.aborted) setBusy(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) void refresh(controller.signal);
    });
    return () => controller.abort();
  }, [refresh]);

  return (
    <div className="space-y-6" aria-busy={busy}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl space-y-2">
          <Badge
            variant="outline"
            className="border-teal-200 bg-teal-50 text-teal-900"
          >
            All time · Entire workspace
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
            A clear view of your review work.
          </h2>
          <p className="text-sm leading-6 text-slate-600">
            See what needs attention, how much evidence is available, and where
            practice stands. Counts include every saved consultation.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void refresh()}
        >
          <RefreshCw
            size={16}
            className={busy ? 'motion-safe:animate-spin' : ''}
          />
          {busy ? 'Refreshing…' : 'Refresh insights'}
        </Button>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
        >
          <p className="font-medium">
            {snapshot
              ? 'The snapshot could not be refreshed.'
              : 'Insights are unavailable.'}
          </p>
          <p className="mt-1">
            {error} {snapshot ? 'The previous snapshot remains below.' : ''}
          </p>
          <Button
            variant="outline"
            className="mt-3"
            disabled={busy}
            onClick={() => void refresh()}
          >
            Try again
          </Button>
        </div>
      )}
      {!snapshot && busy && (
        <output aria-label="Loading workspace insights" className="space-y-6">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-36 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-xl" />
          <span className="sr-only">Loading workspace insights</span>
        </output>
      )}
      {snapshot && (
        <>
          <p className="text-xs text-slate-500">
            Snapshot as of {new Date(snapshot.generated_at).toLocaleString()}.
            Refresh to include new work.
          </p>
          {snapshot.totals.calls === 0 ? (
            <Card className="border-0 bg-white py-10">
              <CardContent className="mx-auto max-w-xl space-y-4 text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
                  <FileText size={24} />
                </div>
                <h3 className="text-xl font-semibold text-slate-950">
                  Start with one conversation.
                </h3>
                <p className="text-sm leading-6 text-slate-600">
                  Import a permitted role-play or synthetic transcript, then
                  review it against an approved rubric. Your team’s saved work
                  will appear here.
                </p>
                {onImport && (
                  <Button onClick={onImport}>
                    Import a transcript <ArrowRight size={16} />
                  </Button>
                )}
                {!onImport && (
                  <p className="text-sm text-slate-500">
                    An owner or reviewer can import the first transcript.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <Metric
                  title="Consultations"
                  value={snapshot.totals.calls}
                  note={`${count(snapshot.totals.latest_human)} with a human latest revision`}
                  icon={<FileText size={18} />}
                />
                <Metric
                  title="No assessment yet"
                  value={snapshot.totals.unreviewed}
                  note="Ready for a first review"
                  icon={<ClipboardList size={18} />}
                  attention={snapshot.totals.unreviewed > 0}
                />
                <Metric
                  title="AI latest revision"
                  value={snapshot.totals.latest_ai}
                  note="Human review still needed"
                  icon={<Sparkles size={18} />}
                  attention={snapshot.totals.latest_ai > 0}
                />
                <Metric
                  title="Practice pending"
                  value={snapshot.practice.pending}
                  note={`${count(snapshot.practice.completed)} completed follow-ups`}
                  icon={<BookOpenCheck size={18} />}
                />
              </div>
              {(snapshot.totals.unreviewed > 0 ||
                snapshot.totals.latest_ai > 0) &&
                onOpenQueue && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50/70 px-5 py-4">
                    <div>
                      <p className="text-sm font-semibold text-teal-950">
                        Keep the human review loop moving.
                      </p>
                      <p className="mt-1 text-sm text-teal-900">
                        {count(
                          snapshot.totals.unreviewed +
                            snapshot.totals.latest_ai,
                        )}{' '}
                        consultations have no assessment or an AI latest
                        revision.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="border-teal-300 bg-white"
                      onClick={onOpenQueue}
                    >
                      Open review queue <ArrowRight size={16} />
                    </Button>
                  </div>
                )}
              <div className="grid items-start gap-6 xl:grid-cols-[1.35fr_1fr]">
                <Card className="bg-white">
                  <CardHeader>
                    <CardTitle>
                      <h3>Evidence coverage</h3>
                    </CardTitle>
                    <CardDescription>
                      Latest assessment per consultation. Human and AI revisions
                      are both included.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {[
                      [
                        'All 8 dimensions supported',
                        snapshot.totals.fully_supported,
                        'A valid supporting quote exists for every score.',
                      ],
                      [
                        'Partial support',
                        snapshot.totals.partially_supported,
                        'Between 1 and 7 dimensions have supported scores.',
                      ],
                      [
                        'No supported scores',
                        snapshot.totals.unscored,
                        'An assessment exists, with every dimension unscored.',
                      ],
                      [
                        'No assessment',
                        snapshot.totals.unreviewed,
                        'No assessment revision has been saved.',
                      ],
                    ].map(([label, value, note]) => (
                      <div key={String(label)}>
                        <div className="mb-2 flex items-baseline justify-between gap-3">
                          <span className="text-sm font-medium text-slate-800">
                            {label}
                          </span>
                          <span className="text-sm tabular-nums text-slate-700">
                            {count(Number(value))}{' '}
                            <span className="text-slate-400">
                              / {count(snapshot.totals.calls)}
                            </span>
                          </span>
                        </div>
                        <Progress
                          aria-label={String(label)}
                          value={Number(value)}
                          max={snapshot.totals.calls}
                        />
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          {note}
                        </p>
                      </div>
                    ))}
                    <p className="border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">
                      Quote support checks text against the transcript. It does
                      not establish that a score is fair or that advice is
                      clinically correct.
                    </p>
                  </CardContent>
                </Card>
                <div className="space-y-6">
                  <Card className="bg-white">
                    <CardHeader>
                      <CardTitle>
                        <h3>Recorded outcomes</h3>
                      </CardTitle>
                      <CardDescription>
                        Manually recorded context, including records without an
                        outcome.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <dl className="space-y-3">
                        {Object.entries(OUTCOME_LABELS).map(([key, label]) => (
                          <div
                            key={key}
                            className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0"
                          >
                            <dt className="text-sm text-slate-600">{label}</dt>
                            <dd className="font-semibold tabular-nums text-slate-900">
                              {count(
                                snapshot.outcomes[
                                  key as keyof typeof snapshot.outcomes
                                ],
                              )}
                            </dd>
                          </div>
                        ))}
                      </dl>
                      <p className="mt-4 text-xs leading-5 text-slate-500">
                        These counts describe recorded training data. They are
                        not acceptance predictions or evidence of business
                        impact.
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-slate-50/70">
                    <CardHeader>
                      <CardTitle>
                        <h3>Background processing</h3>
                      </CardTitle>
                      <CardDescription>
                        Current job states across this workspace.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <dl className="grid grid-cols-3 gap-4">
                        {Object.entries(snapshot.jobs).map(
                          ([status, value]) => (
                            <div key={status}>
                              <dt className="text-xs capitalize text-slate-500">
                                {status}
                              </dt>
                              <dd className="mt-1 text-lg font-semibold tabular-nums">
                                {count(value)}
                              </dd>
                            </div>
                          ),
                        )}
                      </dl>
                      <p className="mt-4 text-xs leading-5 text-slate-500">
                        Historical totals do not verify worker availability.
                        Inspect Activity for individual run outcomes.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
              <Card className="bg-white">
                <CardHeader>
                  <div className="mb-1 flex items-center gap-2 text-teal-700">
                    <CheckCheck size={18} />
                    <Badge variant="secondary">
                      Human latest revisions only
                    </Badge>
                  </div>
                  <CardTitle>
                    <h3>Current rubric · Dimension detail</h3>
                  </CardTitle>
                  <CardDescription>
                    {snapshot.current_rubric ? (
                      <>
                        <span className="font-medium text-slate-700">
                          {snapshot.current_rubric.title}
                        </span>{' '}
                        · {count(snapshot.current_rubric.human_calls)}{' '}
                        consultations with a latest human assessment under this
                        exact version.
                      </>
                    ) : (
                      'Publish an owner-approved rubric to establish a comparable group.'
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {snapshot.current_rubric ? (
                    <>
                      <div className="grid gap-x-8 md:grid-cols-2">
                        {snapshot.current_rubric.dimensions.map((d) => (
                          <div
                            key={d.dimension}
                            className="flex items-center justify-between gap-4 border-b border-slate-100 py-4"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800">
                                {DIMENSIONS[d.dimension]}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {count(d.supported)} scored ·{' '}
                                {count(d.unscored)} unscored
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-xl font-semibold tabular-nums text-slate-950">
                                {d.mean === null ? '—' : d.mean.toFixed(2)}
                                {d.mean !== null && (
                                  <span className="ml-1 text-xs font-normal text-slate-400">
                                    / 5
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-slate-500">
                                {d.mean === null
                                  ? 'No scored evidence'
                                  : 'Mean supported score'}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="mt-5 text-xs leading-5 text-slate-500">
                        Each mean includes only that dimension’s supported human
                        scores. Unscored dimensions are excluded, never treated
                        as zero. AI latest revisions and other rubric versions
                        are excluded. Small or selectively reviewed groups can
                        be unrepresentative; these are descriptive counts, not a
                        team ranking.
                      </p>
                    </>
                  ) : (
                    <p className="rounded-lg bg-slate-50 p-5 text-sm text-slate-600">
                      No rubric has been published. Counts above remain
                      available; score summaries will stay empty.
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card className="bg-white">
                <CardHeader>
                  <div className="mb-1 flex items-center gap-2 text-teal-700">
                    <UsersRound size={18} />
                    <span className="text-xs font-medium">
                      Review distribution
                    </span>
                  </div>
                  <CardTitle>
                    <h3>Coordinator coverage</h3>
                  </CardTitle>
                  <CardDescription>
                    Counts by the exact coordinator name entered on each
                    transcript. Sorted by number of consultations.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Coordinator</TableHead>
                        <TableHead className="text-right">
                          Consultations
                        </TableHead>
                        <TableHead className="text-right">
                          No assessment
                        </TableHead>
                        <TableHead className="text-right">AI latest</TableHead>
                        <TableHead className="text-right">
                          Human latest
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {snapshot.coordinators.items.map((c) => (
                        <TableRow key={c.name}>
                          <TableCell className="max-w-64 whitespace-normal break-words font-medium">
                            {onOpenCoordinator ? (
                              <button
                                type="button"
                                onClick={() => onOpenCoordinator(c.name)}
                                className="text-left text-teal-800 underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700"
                              >
                                {c.name}
                              </button>
                            ) : (
                              c.name
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {count(c.calls)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {count(c.unreviewed)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {count(c.latest_ai)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {count(c.latest_human)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <p className="mt-4 text-xs text-slate-500">
                    {snapshot.coordinators.has_more
                      ? `Showing the 20 largest groups of ${count(snapshot.coordinators.total)}. Search the review queue for other names.`
                      : `${count(snapshot.coordinators.total)} coordinator ${snapshot.coordinators.total === 1 ? 'name' : 'names'}.`}{' '}
                    Names are transcript labels, not verified team identities.
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-white">
                <CardHeader>
                  <CardTitle>
                    <h3>Rubric version coverage</h3>
                  </CardTitle>
                  <CardDescription>
                    Every consultation belongs to its latest assessment’s rubric
                    version. Scores are never averaged across versions.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {snapshot.rubric_groups.items.length ? (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Rubric version</TableHead>
                            <TableHead className="text-right">
                              Human latest
                            </TableHead>
                            <TableHead className="text-right">
                              AI latest
                            </TableHead>
                            <TableHead className="text-right">
                              Fully supported
                            </TableHead>
                            <TableHead className="text-right">
                              Partial / unscored
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {snapshot.rubric_groups.items.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell className="max-w-72 whitespace-normal">
                                <p className="break-words font-medium">
                                  {r.title}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {new Date(r.created_at).toLocaleString()} ·{' '}
                                  {count(r.calls)} consultations
                                </p>
                                <p className="mt-1 break-all font-mono text-[10px] text-slate-400">
                                  {r.id}
                                </p>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {count(r.latest_human)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {count(r.latest_ai)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {count(r.fully_supported)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {count(r.partially_supported)} /{' '}
                                {count(r.unscored)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {snapshot.rubric_groups.has_more && (
                        <p className="mt-4 text-xs text-slate-500">
                          Showing the 50 most recent rubric versions with latest
                          assessments, of {count(snapshot.rubric_groups.total)}.
                          Workspace totals still include every version.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">
                      No saved assessments yet. Published but unused rubric
                      versions are not included.
                    </p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Metric({
  title,
  value,
  note,
  icon,
  attention = false,
}: {
  title: string;
  value: number;
  note: string;
  icon: React.ReactNode;
  attention?: boolean;
}) {
  return (
    <Card className={attention ? 'bg-amber-50/40' : 'bg-white'}>
      <CardContent>
        <div className="flex items-center justify-between gap-2 text-slate-500">
          <p className="text-xs font-medium sm:text-sm">{title}</p>
          <span aria-hidden="true">{icon}</span>
        </div>
        <p className="mt-5 text-3xl font-semibold tracking-tight tabular-nums text-slate-950">
          {count(value)}
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-500">{note}</p>
      </CardContent>
    </Card>
  );
}
