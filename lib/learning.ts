import type { SavedAssessment } from './product.ts';
export type CoachingReview = {
  id: string;
  coaching_id: string;
  decision: 'approved' | 'rejected';
  guidance: string;
  notes: string;
  base_id: string;
  created_at: string;
};
export type PracticeAssignment = {
  id: string;
  call_id: string;
  baseline_id: string;
  review_id: string | null;
  dimension: number;
  instruction: string;
  created_at: string;
  completion: {
    id: string;
    assessment_id: string;
    reflection: string;
    created_at: string;
  } | null;
  baseline: SavedAssessment;
  followup: SavedAssessment | null;
};
export type LearningData = {
  reviews: CoachingReview[];
  assignments: PracticeAssignment[];
};
export function comparison(
  baseline: SavedAssessment,
  followup: SavedAssessment | null,
  dimension: number,
) {
  const before =
    baseline.content.dimensions.find((d) => d.dimension === dimension)?.score ??
    null;
  const after =
    followup?.content.dimensions.find((d) => d.dimension === dimension)
      ?.score ?? null;
  return {
    before,
    after,
    delta:
      followup &&
      baseline.rubric_id === followup.rubric_id &&
      before !== null &&
      after !== null
        ? after - before
        : null,
  };
}
