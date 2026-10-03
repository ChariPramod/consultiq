/** Eligible current human assessments; transcript and assessment prose stay on demand. */
export type FollowupCandidate = {
  assessment_id: string;
  call_id: string;
  title: string;
  recorded_at: string;
  coordinator: string;
  assessment_created_at: string;
};

export type FollowupCandidatePage = {
  candidates: FollowupCandidate[];
  limit: number;
  has_more: boolean;
  next_cursor: string | null;
};
