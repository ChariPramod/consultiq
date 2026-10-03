import type { AssessmentContent } from './assessment.ts';
import type { SavedAssessment } from './product.ts';

export type RevisionSelection = { fromId: string; toId: string };
type Dimension = AssessmentContent['dimensions'][number];
export type DimensionComparison = {
  dimension: number;
  from: Dimension | null;
  to: Dimension | null;
  scoreDelta: number | null;
  changes: {
    score: boolean;
    support: boolean;
    rationale: boolean;
    coaching: boolean;
    evidence: boolean;
  };
  changed: boolean;
};

/** The detail API supplies newest-first revisions, with insertion order breaking ties. */
export function resolveRevisionPair(
  assessments: SavedAssessment[],
  selection: RevisionSelection | null = null,
) {
  if (assessments.length < 2) return null;
  const selectedFrom = assessments.find(
    (item) => item.id === selection?.fromId,
  );
  const selectedTo = assessments.find((item) => item.id === selection?.toId);
  if (
    selectedFrom &&
    selectedTo &&
    selectedFrom.id !== selectedTo.id &&
    selectedFrom.call_id === selectedTo.call_id
  )
    return { from: selectedFrom, to: selectedTo };
  return { from: assessments[1], to: assessments[0] };
}

function evidenceKey(dimension: Dimension | null) {
  // A different listing order alone does not change which quotes were cited.
  return JSON.stringify(
    (dimension?.evidence ?? [])
      .map(({ turn_index, span }) => JSON.stringify([turn_index, span]))
      .sort(),
  );
}

export function compareAssessments(from: SavedAssessment, to: SavedAssessment) {
  if (from.call_id !== to.call_id)
    throw new Error('Only revisions of the same consultation can be compared.');
  const sameRubric = from.rubric_id === to.rubric_id;
  const dimensionIds = new Set([
    ...from.content.dimensions.map((item) => item.dimension),
    ...to.content.dimensions.map((item) => item.dimension),
  ]);
  const dimensions: DimensionComparison[] = [...dimensionIds]
    .sort((a, b) => a - b)
    .map((dimension) => {
      const before =
        from.content.dimensions.find((item) => item.dimension === dimension) ??
        null;
      const after =
        to.content.dimensions.find((item) => item.dimension === dimension) ??
        null;
      const changes = {
        score: before?.score !== after?.score,
        support: before?.unsupported !== after?.unsupported,
        rationale: before?.rationale !== after?.rationale,
        coaching: before?.coaching_note !== after?.coaching_note,
        evidence: evidenceKey(before) !== evidenceKey(after),
      };
      return {
        dimension,
        from: before,
        to: after,
        scoreDelta:
          sameRubric &&
          before &&
          after &&
          !before.unsupported &&
          !after.unsupported &&
          before.score !== null &&
          after.score !== null
            ? after.score - before.score
            : null,
        changes,
        changed: Object.values(changes).some(Boolean),
      };
    });
  return {
    sameRubric,
    dimensions,
    changedDimensions: dimensions.filter((item) => item.changed).length,
  };
}
