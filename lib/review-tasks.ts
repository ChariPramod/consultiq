export type ReviewTaskStatus = 'open' | 'in_progress' | 'done';
export const REVIEW_TASK_LABELS: Record<ReviewTaskStatus, string> = {
  open: 'Assigned',
  in_progress: 'In progress',
  done: 'Completed',
};
export type ReviewTask = {
  id: string;
  call_id: string;
  assignee_id: string;
  assignee_active: boolean;
  due_date: string | null;
  status: ReviewTaskStatus;
  version: number;
  completion_assessment_id: string | null;
  created_at: string;
  updated_at: string;
};
export type ReviewTaskEvent = {
  id: string;
  version: number;
  actor_id: string;
  assignee_id: string;
  due_date: string | null;
  status: ReviewTaskStatus;
  completion_assessment_id: string | null;
  created_at: string;
};
export type ReviewTaskData = {
  task: ReviewTask | null;
  eligible_reviewers: { user_id: string; role: 'owner' | 'reviewer' }[];
  latest_human_assessment_id: string | null;
  history: ReviewTaskEvent[];
};
export type ReviewTaskSummary = ReviewTask & {
  title: string;
  coordinator: string;
};
export type ReviewTaskPage = {
  tasks: ReviewTaskSummary[];
  next_cursor: string | null;
};
export function isReviewTaskOverdue(
  task: Pick<ReviewTask, 'status' | 'due_date'>,
  today: string,
) {
  return (
    task.status !== 'done' && task.due_date !== null && task.due_date < today
  );
}
