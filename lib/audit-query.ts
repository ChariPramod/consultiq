/** Labels describe recorded actions only; event rows do not contain before/after state. */
export const AUDIT_ACTION_LABELS = {
  consultation_created: 'Consultation imported',
  consultation_deleted: 'Consultation deleted',
  outcome_updated: 'Recorded outcome saved',
  assessment_saved: 'Assessment saved',
  rubric_published: 'Rubric published',
  knowledge_approved: 'Library document approved',
  knowledge_deleted: 'Library document deleted',
  coaching_saved: 'Coaching saved',
  coaching_reviewed: 'Coaching review recorded',
  practice_assigned: 'Practice assigned',
  practice_completed: 'Practice completed',
  review_task_assigned: 'Reviewer assignment created',
  review_task_updated: 'Reviewer assignment updated',
  review_task_completed: 'Review task completed',
  analysis_queued: 'Analysis queued',
  analysis_cancelled: 'Analysis cancelled',
  invitation_created: 'Team invitation created or rotated',
  invitation_revoked: 'Team invitation revoked',
  member_joined: 'Team member joined',
  member_removed: 'Team member removed',
  workspace_renamed: 'Workspace renamed',
} as const;

export type AuditAction = keyof typeof AUDIT_ACTION_LABELS;
export type AuditActionFilter = 'all' | AuditAction;
export const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_LABELS) as AuditAction[];

/** Metadata only. Actor IDs may be absent on legacy records. */
export type AuditEvent = {
  id: string;
  action: string;
  entity_id: string;
  actor_id: string | null;
  created_at: string;
};
export type AuditEventPage = {
  events: AuditEvent[];
  limit: number;
  has_more: boolean;
  next_cursor: string | null;
};

export function auditActionLabel(action: string): string {
  return Object.hasOwn(AUDIT_ACTION_LABELS, action)
    ? AUDIT_ACTION_LABELS[action as AuditAction]
    : 'Unrecognized event';
}
