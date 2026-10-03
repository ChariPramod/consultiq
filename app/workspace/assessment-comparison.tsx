'use client';

import { useId, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  GitCompareArrows,
  Quote,
  TriangleAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  compareAssessments,
  resolveRevisionPair,
  type DimensionComparison,
  type RevisionSelection,
} from '@/lib/assessment-comparison';
import { DIMENSIONS, type SavedAssessment } from '@/lib/product';

export function AssessmentComparison({
  assessments,
  onSource,
}: {
  assessments: SavedAssessment[];
  onSource: (turnIndex: number) => void;
}) {
  const [selection, setSelection] = useState<RevisionSelection | null>(null);
  const [changesOnly, setChangesOnly] = useState(false);
  const headingId = useId();
  const fromId = useId();
  const toId = useId();
  const pair = resolveRevisionPair(assessments, selection);
  if (!pair)
    return (
      <div className="mb-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
        <p className="font-medium text-slate-900">Compare saved assessments</p>
        <p className="mt-1">
          Save a second assessment to compare scores, reasoning and cited
          evidence. Each earlier revision stays available below.
        </p>
      </div>
    );
  const comparison = compareAssessments(pair.from, pair.to);
  const shown = comparison.dimensions.filter(
    (item) => !changesOnly || item.changed,
  );
  const isLatestPair =
    pair.from.id === assessments[1].id && pair.to.id === assessments[0].id;
  const revisionLabel = (assessment: SavedAssessment) => {
    const position = assessments.findIndex((item) => item.id === assessment.id);
    return `Revision ${assessments.length - position} · ${assessment.kind === 'human' ? 'Human' : 'AI'}${position === 0 ? ' · Latest' : ''}`;
  };
  return (
    <section
      aria-labelledby={headingId}
      className="mb-6 min-w-0 rounded-xl border border-slate-200 bg-white"
    >
      <div className="border-b border-slate-200 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sky-800">
              <GitCompareArrows size={18} aria-hidden="true" />
              <h3 id={headingId} className="font-semibold text-slate-950">
                Compare assessments
              </h3>
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Inspect what changed between saved revisions of this consultation.
            </p>
          </div>
          {!isLatestPair && (
            <Button variant="outline" onClick={() => setSelection(null)}>
              Compare latest revisions
            </Button>
          )}
        </div>
        <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end">
          <label
            htmlFor={fromId}
            className="grid min-w-0 gap-1.5 text-sm font-medium text-slate-700"
          >
            Compare from
            <NativeSelect
              id={fromId}
              aria-label="Compare from"
              value={pair.from.id}
              className="w-full"
              onChange={(event) =>
                setSelection({ fromId: event.target.value, toId: pair.to.id })
              }
            >
              {assessments.map((assessment) => (
                <NativeSelectOption
                  key={assessment.id}
                  value={assessment.id}
                  disabled={assessment.id === pair.to.id}
                >
                  {revisionLabel(assessment)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <Button
            variant="outline"
            size="icon"
            aria-label="Swap comparison revisions"
            className="justify-self-center"
            onClick={() =>
              setSelection({ fromId: pair.to.id, toId: pair.from.id })
            }
          >
            <ArrowLeftRight aria-hidden="true" />
          </Button>
          <label
            htmlFor={toId}
            className="grid min-w-0 gap-1.5 text-sm font-medium text-slate-700"
          >
            Compare to
            <NativeSelect
              id={toId}
              aria-label="Compare to"
              value={pair.to.id}
              className="w-full"
              onChange={(event) =>
                setSelection({ fromId: pair.from.id, toId: event.target.value })
              }
            >
              {assessments.map((assessment) => (
                <NativeSelectOption
                  key={assessment.id}
                  value={assessment.id}
                  disabled={assessment.id === pair.from.id}
                >
                  {revisionLabel(assessment)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {[pair.from, pair.to].map((assessment, index) => (
            <div
              key={assessment.id}
              className="min-w-0 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600"
            >
              <p className="font-medium text-slate-800">
                {index === 0 ? 'From' : 'To'} · {revisionLabel(assessment)}
              </p>
              <p>{new Date(assessment.created_at).toLocaleString()}</p>
              <p className="break-all">Rubric {assessment.rubric_id}</p>
              <p className="break-words">
                {assessment.kind === 'human'
                  ? 'Human review'
                  : assessment.model}{' '}
                · {assessment.prompt_version}
              </p>
            </div>
          ))}
        </div>
        {!comparison.sameRubric && (
          <output className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
            <TriangleAlert
              className="mt-1 shrink-0"
              size={16}
              aria-hidden="true"
            />
            <span>
              Different rubric versions. Scores may use different anchors and
              are not directly comparable. Numeric differences are hidden;
              review the saved reasoning and evidence in context.
            </span>
          </output>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600" aria-live="polite">
            {comparison.changedDimensions} of {comparison.dimensions.length}{' '}
            dimensions with recorded changes
          </p>
          <Button
            variant={changesOnly ? 'secondary' : 'outline'}
            aria-pressed={changesOnly}
            onClick={() => setChangesOnly((value) => !value)}
          >
            Changes only
          </Button>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Differences describe these saved assessments, not improvement in
          consultation performance. Unscored dimensions have no numeric
          difference.
        </p>
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        {shown.length ? (
          shown.map((item) => (
            <article
              key={item.dimension}
              className="overflow-hidden rounded-lg border border-slate-200"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <h4 className="text-sm font-semibold text-slate-900">
                  {DIMENSIONS[item.dimension]}
                </h4>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {item.changed ? 'Changed' : 'Unchanged'}
                  </Badge>
                  {item.scoreDelta !== null && (
                    <Badge variant="secondary">
                      Score difference {item.scoreDelta > 0 ? '+' : ''}
                      {item.scoreDelta}
                    </Badge>
                  )}
                </div>
              </div>
              {item.changed && (
                <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-600">
                  Changed:{' '}
                  {Object.entries(item.changes)
                    .filter(([, changed]) => changed)
                    .map(
                      ([field]) =>
                        ({
                          score: 'score',
                          support: 'support state',
                          rationale: 'reasoning',
                          coaching: 'coaching note',
                          evidence: 'cited evidence',
                        })[field],
                    )
                    .join(', ')}
                </p>
              )}
              <div className="grid min-w-0 sm:grid-cols-2 sm:divide-x sm:divide-slate-200">
                <DimensionVersion
                  value={item.from}
                  label="From"
                  onSource={onSource}
                />
                <DimensionVersion
                  value={item.to}
                  label="To"
                  onSource={onSource}
                />
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-600">
            No recorded dimension changes between these revisions. Turn off
            “Changes only” to inspect both assessments.
          </div>
        )}
      </div>
    </section>
  );
}

function DimensionVersion({
  value,
  label,
  onSource,
}: {
  value: DimensionComparison['from'];
  label: string;
  onSource: (turnIndex: number) => void;
}) {
  if (!value)
    return (
      <div className="p-4 text-sm text-slate-500">
        {label}: dimension not recorded.
      </div>
    );
  return (
    <div className="min-w-0 space-y-4 border-b border-slate-100 p-4 last:border-b-0 sm:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </span>
        <span className="text-sm font-semibold text-slate-900">
          {value.score === null || value.unsupported
            ? 'Unscored'
            : `${value.score} / 5`}
        </span>
      </div>
      {value.unsupported && (
        <p className="text-xs text-slate-600">
          Unsupported · excluded from scoring
        </p>
      )}
      <div>
        <p className="mb-1 text-xs font-medium text-slate-500">Reasoning</p>
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
          {value.rationale}
        </p>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-slate-500">
          Cited evidence
        </p>
        {value.evidence.length ? (
          <div className="space-y-2">
            {value.evidence.map((evidence, index) => (
              <Button
                key={`${evidence.turn_index}-${index}`}
                variant="ghost"
                className="h-auto w-full items-start justify-start whitespace-normal rounded-lg border border-sky-100 bg-sky-50 p-3 text-left font-normal text-slate-800 hover:bg-sky-100"
                onClick={() => onSource(evidence.turn_index)}
              >
                <Quote
                  size={14}
                  className="mt-1 shrink-0 text-sky-700"
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block whitespace-pre-wrap break-words text-sm leading-6">
                    {evidence.span}
                  </span>
                  <span className="mt-1 flex items-center gap-1 text-xs font-medium text-sky-800">
                    Open transcript · Turn {evidence.turn_index + 1}
                    <ArrowRight size={12} aria-hidden="true" />
                  </span>
                </span>
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No cited evidence</p>
        )}
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-slate-500">Coaching note</p>
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
          {value.coaching_note || 'No coaching note recorded.'}
        </p>
      </div>
    </div>
  );
}
