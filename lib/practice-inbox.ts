export type PracticeStatus = 'open' | 'completed' | 'all';

/** A content-minimal summary. Open the consultation to inspect cited evidence. */
export type PracticeInboxItem = {
  id: string;
  call_id: string;
  call_title: string;
  coordinator: string;
  dimension: number;
  instruction_preview: string;
  instruction_truncated: boolean;
  created_at: string;
  status: 'open' | 'completed';
  baseline_id: string;
  baseline_rubric_id: string;
  baseline_score: number | null;
  followup_id: string | null;
  followup_call_id: string | null;
  followup_call_title: string | null;
  followup_rubric_id: string | null;
  followup_score: number | null;
  completion_id: string | null;
  completed_at: string | null;
};

export type PracticeInboxPage = {
  assignments: PracticeInboxItem[];
  total: number;
  limit: number;
  has_more: boolean;
  next_cursor: string | null;
};

/** Never infer a gain from missing scores or assessments using different rubrics. */
export function practiceScoreChange(item: PracticeInboxItem): number | null {
  const valid = (score: number | null): score is number =>
    typeof score === 'number' &&
    Number.isInteger(score) &&
    score >= 1 &&
    score <= 5;
  if (
    item.status !== 'completed' ||
    !item.followup_id ||
    item.baseline_rubric_id !== item.followup_rubric_id ||
    !valid(item.baseline_score) ||
    !valid(item.followup_score)
  )
    return null;
  return item.followup_score - item.baseline_score;
}
