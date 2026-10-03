/** All-time workspace aggregates. Every assessment count uses the latest revision per call. */
export type AssessmentCounts = {
  latest_human: number;
  latest_ai: number;
  fully_supported: number;
  partially_supported: number;
  unscored: number;
};
export type WorkspaceInsights = {
  scope: 'all_time';
  generated_at: string;
  totals: AssessmentCounts & { calls: number; unreviewed: number };
  outcomes: {
    unknown: number;
    accepted: number;
    not_accepted: number;
    follow_up: number;
  };
  rubric_groups: {
    items: (AssessmentCounts & {
      id: string;
      title: string;
      created_at: string;
      calls: number;
    })[];
    total: number;
    has_more: boolean;
  };
  current_rubric: {
    id: string;
    title: string;
    human_calls: number;
    dimensions: {
      dimension: number;
      supported: number;
      unscored: number;
      mean: number | null;
    }[];
  } | null;
  coordinators: {
    items: (AssessmentCounts & {
      name: string;
      calls: number;
      unreviewed: number;
    })[];
    total: number;
    has_more: boolean;
  };
  practice: { pending: number; completed: number };
  jobs: {
    queued: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
  };
};
