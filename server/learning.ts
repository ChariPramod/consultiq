import { AppError, Repository, requiredText } from './repository.ts';
import type {
  CoachingReview,
  LearningData,
  PracticeAssignment,
} from '../lib/learning.ts';
const timestamp = () => new Date().toISOString();
function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new AppError(422, 'invalid_input', 'Expected an object.');
  return input as Record<string, unknown>;
}
function requestId(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new AppError(422, 'invalid_input', 'Provide a valid request ID.');
  return value;
}
function conflict() {
  return new AppError(
    409,
    'learning_conflict',
    'The record changed or is no longer eligible. Refresh before saving. Your text has not been discarded.',
  );
}
export class Learning {
  private repo: Repository;
  constructor(repo: Repository) {
    this.repo = repo;
  }
  private q(sql: string, ...values: unknown[]) {
    return this.repo.statement(sql, ...values);
  }
  private get workspace() {
    return this.repo.workspaceId;
  }
  private async replay(
    table: 'coaching_reviews' | 'practice_assignments' | 'practice_completions',
    id: string,
    expected: Record<string, unknown>,
  ) {
    const existing = await this.q(
      `SELECT * FROM ${table} WHERE id=? AND workspace_id=?`,
      id,
      this.workspace,
    ).first();
    if (!existing) return null;
    if (
      Object.entries(expected).some(([key, value]) => existing[key] !== value)
    )
      throw conflict();
    return existing;
  }
  private audit(action: string, id: string, table: string) {
    return this.q(
      `INSERT INTO audit_events (id,workspace_id,action,entity_id,created_at) SELECT ?,?,?,?,? WHERE changes()=1 AND EXISTS (SELECT 1 FROM ${table} WHERE id=? AND workspace_id=?)`,
      crypto.randomUUID(),
      this.workspace,
      action,
      id,
      timestamp(),
      id,
      this.workspace,
    );
  }
  async read(callId: string): Promise<LearningData> {
    await this.repo.getCall(callId);
    const reviews = await this.q(
      'SELECT r.* FROM coaching_reviews r JOIN coaching_runs c ON c.id=r.coaching_id AND c.workspace_id=r.workspace_id WHERE r.workspace_id=? AND c.call_id=? ORDER BY r.created_at DESC,r.rowid DESC',
      this.workspace,
      callId,
    ).all<CoachingReview>();
    const assessmentJson = (alias: string) =>
      `json_object('id',${alias}.id,'call_id',${alias}.call_id,'rubric_id',${alias}.rubric_id,'kind',${alias}.kind,'content',json(${alias}.content),'prompt_version',${alias}.prompt_version,'model',${alias}.model,'created_at',${alias}.created_at)`;
    const assignments = await this.q(
      `SELECT p.*, ${assessmentJson('b')} AS baseline_json, CASE WHEN a.id IS NULL THEN NULL ELSE ${assessmentJson('a')} END AS followup_json, CASE WHEN c.id IS NULL THEN NULL ELSE json_object('id',c.id,'assessment_id',c.assessment_id,'reflection',c.reflection,'created_at',c.created_at) END AS completion_json FROM practice_assignments p JOIN assessments b ON b.id=p.baseline_id AND b.workspace_id=p.workspace_id LEFT JOIN practice_completions c ON c.assignment_id=p.id AND c.workspace_id=p.workspace_id LEFT JOIN assessments a ON a.id=c.assessment_id AND a.workspace_id=p.workspace_id WHERE p.workspace_id=? AND p.call_id=? ORDER BY p.created_at DESC,p.rowid DESC`,
      this.workspace,
      callId,
    ).all<
      Omit<PracticeAssignment, 'baseline' | 'completion' | 'followup'> & {
        baseline_json: string;
        followup_json: string | null;
        completion_json: string | null;
      }
    >();
    return {
      reviews: reviews.results,
      assignments: assignments.results.map(
        ({ baseline_json, followup_json, completion_json, ...row }) => ({
          ...row,
          baseline: JSON.parse(baseline_json),
          followup: followup_json ? JSON.parse(followup_json) : null,
          completion: completion_json ? JSON.parse(completion_json) : null,
        }),
      ),
    };
  }
  async review(coachingId: string, input: unknown) {
    const data = record(input),
      id = requestId(data.request_id);
    if (data.decision !== 'approved' && data.decision !== 'rejected')
      throw new AppError(422, 'invalid_input', 'Choose approve or reject.');
    const decision = data.decision;
    const guidance =
      decision === 'approved'
        ? requiredText(data.guidance, 'reviewed guidance', 12000)
        : '';
    const notes = requiredText(data.notes, 'review rationale', 2000);
    const base = typeof data.base_id === 'string' ? data.base_id : '';
    const expected = {
      coaching_id: coachingId,
      decision,
      guidance,
      notes,
      base_id: base,
    };
    const existing = await this.replay('coaching_reviews', id, expected);
    if (existing) return existing;
    const [saved] = await this.repo.db.batch([
      this.q(
        `INSERT OR IGNORE INTO coaching_reviews (id,workspace_id,coaching_id,decision,guidance,notes,base_id,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM coaching_runs WHERE id=? AND workspace_id=?) AND COALESCE((SELECT id FROM coaching_reviews WHERE coaching_id=? AND workspace_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1),'')=?`,
        id,
        this.workspace,
        coachingId,
        decision,
        guidance,
        notes,
        base,
        timestamp(),
        coachingId,
        this.workspace,
        coachingId,
        this.workspace,
        base,
      ),
      this.audit('coaching_reviewed', id, 'coaching_reviews'),
    ]);
    if (!saved.meta.changes) {
      const replay = await this.replay('coaching_reviews', id, expected);
      if (replay) return replay;
      throw conflict();
    }
    return { id, ...expected };
  }
  async assign(callId: string, input: unknown) {
    const data = record(input),
      id = requestId(data.request_id),
      baseline = requiredText(data.baseline_id, 'baseline assessment', 100);
    const review =
      typeof data.review_id === 'string' && data.review_id
        ? data.review_id
        : null;
    const dimension = data.dimension;
    if (
      typeof dimension !== 'number' ||
      !Number.isInteger(dimension) ||
      dimension < 0 ||
      dimension > 7
    )
      throw new AppError(422, 'invalid_input', 'Choose a rubric dimension.');
    const instruction = requiredText(
      data.instruction,
      'practice instructions',
      4000,
    );
    const expected = {
      call_id: callId,
      baseline_id: baseline,
      review_id: review,
      dimension,
      instruction,
    };
    const existing = await this.replay('practice_assignments', id, expected);
    if (existing) return existing;
    const [saved] = await this.repo.db.batch([
      this.q(
        `INSERT OR IGNORE INTO practice_assignments (id,workspace_id,call_id,baseline_id,review_id,dimension,instruction,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM assessments WHERE id=? AND workspace_id=? AND call_id=? AND kind='human') AND (SELECT id FROM assessments WHERE workspace_id=? AND call_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1)=? AND (? IS NULL OR EXISTS (SELECT 1 FROM coaching_reviews r JOIN coaching_runs c ON c.id=r.coaching_id AND c.workspace_id=r.workspace_id WHERE r.id=? AND r.workspace_id=? AND c.call_id=? AND r.decision='approved' AND r.id=(SELECT id FROM coaching_reviews WHERE coaching_id=r.coaching_id AND workspace_id=r.workspace_id ORDER BY created_at DESC,rowid DESC LIMIT 1))) AND (SELECT COUNT(*) FROM practice_assignments WHERE workspace_id=? AND call_id=?)<50`,
        id,
        this.workspace,
        callId,
        baseline,
        review,
        dimension,
        instruction,
        timestamp(),
        baseline,
        this.workspace,
        callId,
        this.workspace,
        callId,
        baseline,
        review,
        review,
        this.workspace,
        callId,
        this.workspace,
        callId,
      ),
      this.audit('practice_assigned', id, 'practice_assignments'),
    ]);
    if (!saved.meta.changes) {
      const replay = await this.replay('practice_assignments', id, expected);
      if (replay) return replay;
      throw conflict();
    }
    return { id, ...expected };
  }
  async complete(assignmentId: string, input: unknown) {
    const data = record(input),
      id = requestId(data.request_id),
      assessment = requiredText(
        data.assessment_id,
        'follow-up assessment',
        100,
      ),
      reflection = requiredText(data.reflection, 'reviewer reflection', 4000);
    const expected = {
      assignment_id: assignmentId,
      assessment_id: assessment,
      reflection,
    };
    const existing = await this.replay('practice_completions', id, expected);
    if (existing) return existing;
    const [saved] = await this.repo.db.batch([
      this.q(
        `INSERT OR IGNORE INTO practice_completions (id,workspace_id,assignment_id,assessment_id,reflection,created_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM practice_completions WHERE assignment_id=? AND workspace_id=?) AND EXISTS (SELECT 1 FROM practice_assignments p JOIN assessments b ON b.id=p.baseline_id AND b.workspace_id=p.workspace_id JOIN consultations bc ON bc.id=p.call_id AND bc.workspace_id=p.workspace_id JOIN assessments a ON a.id=? AND a.workspace_id=p.workspace_id JOIN consultations ac ON ac.id=a.call_id AND ac.workspace_id=a.workspace_id WHERE p.id=? AND p.workspace_id=? AND a.kind='human' AND a.call_id<>p.call_id AND a.rubric_id=b.rubric_id AND ac.coordinator=bc.coordinator AND ac.recorded_at>=bc.recorded_at AND a.created_at>=p.created_at AND a.id=(SELECT id FROM assessments WHERE call_id=a.call_id AND workspace_id=p.workspace_id ORDER BY created_at DESC,rowid DESC LIMIT 1) AND (p.review_id IS NULL OR EXISTS (SELECT 1 FROM coaching_reviews r WHERE r.id=p.review_id AND r.workspace_id=p.workspace_id AND r.decision='approved' AND r.id=(SELECT id FROM coaching_reviews WHERE coaching_id=r.coaching_id AND workspace_id=r.workspace_id ORDER BY created_at DESC,rowid DESC LIMIT 1))))`,
        id,
        this.workspace,
        assignmentId,
        assessment,
        reflection,
        timestamp(),
        assignmentId,
        this.workspace,
        assessment,
        assignmentId,
        this.workspace,
      ),
      this.audit('practice_completed', id, 'practice_completions'),
    ]);
    if (!saved.meta.changes) {
      const replay = await this.replay('practice_completions', id, expected);
      if (replay) return replay;
      throw conflict();
    }
    return { id, ...expected };
  }
}
