import {
  parseTurns,
  validateRubric,
  type CallRecord,
  type SavedAssessment,
  type Rubric,
  type KnowledgeDocument,
  type WorkspaceData,
  type Coaching,
  type Citation,
} from '../lib/product.ts';
import {
  prepareAssessment,
  type AssessmentContent,
} from '../lib/assessment.ts';
export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<{ meta: { changes: number } }[]>;
}
export class AppError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
export function requiredText(value: unknown, name: string, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new AppError(422, 'invalid_input', `Provide a valid ${name}.`);
  return value.trim();
}
function object(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AppError(422, 'invalid_input', 'Expected an object.');
  return value as Record<string, unknown>;
}
const readAssessment = (row: Record<string, unknown>): SavedAssessment =>
  ({ ...row, content: JSON.parse(String(row.content)) }) as SavedAssessment;
const readRubric = (row: Record<string, unknown>): Rubric =>
  ({ ...row, definitions: JSON.parse(String(row.definitions)) }) as Rubric;
export class Repository {
  db: Database;
  workspaceId: string;
  constructor(db: Database, workspaceId: string) {
    this.db = db;
    this.workspaceId = workspaceId;
  }
  static async forUser(db: Database, userId: string) {
    if (!userId)
      throw new AppError(
        401,
        'sign_in_required',
        'Sign in to access your workspace.',
      );
    await db
      .prepare(
        'INSERT OR IGNORE INTO workspaces (id,owner_id,name,created_at) VALUES (?,?,?,?)',
      )
      .bind(id(), userId, 'My workspace', now())
      .run();
    const workspace = await db
      .prepare('SELECT id,name FROM workspaces WHERE owner_id=?')
      .bind(userId)
      .first<{ id: string; name: string }>();
    if (!workspace)
      throw new AppError(
        503,
        'storage_unavailable',
        'Your workspace could not be opened.',
      );
    return new Repository(db, workspace.id);
  }
  statement(sql: string, ...params: unknown[]) {
    return this.db.prepare(sql).bind(...params);
  }
  event(action: string, entityId: string) {
    return this.statement(
      'INSERT INTO audit_events (id,workspace_id,action,entity_id,created_at) VALUES (?,?,?,?,?)',
      id(),
      this.workspaceId,
      action,
      entityId,
      now(),
    );
  }
  async rubric(rubricId?: string) {
    const row = await this.statement(
      `SELECT * FROM rubrics WHERE workspace_id=? ${rubricId ? 'AND id=?' : ''} ORDER BY created_at DESC,rowid DESC LIMIT 1`,
      this.workspaceId,
      ...(rubricId ? [rubricId] : []),
    ).first();
    return row ? readRubric(row) : null;
  }
  async assessmentList(callId: string) {
    const rows = await this.statement(
      'SELECT * FROM assessments WHERE workspace_id=? AND call_id=? ORDER BY created_at DESC,rowid DESC',
      this.workspaceId,
      callId,
    ).all();
    return rows.results.map(readAssessment);
  }
  async getCall(callId: string): Promise<CallRecord> {
    const row = await this.statement(
      'SELECT * FROM consultations WHERE workspace_id=? AND id=?',
      this.workspaceId,
      callId,
    ).first();
    if (!row) throw new AppError(404, 'not_found', 'Consultation not found.');
    const assessments = await this.assessmentList(callId);
    return {
      ...row,
      turns: JSON.parse(String(row.turns)),
      latest: assessments[0] ?? null,
    } as CallRecord;
  }
  async detail(callId: string) {
    const call = await this.getCall(callId);
    const rows = await this.statement(
      'SELECT * FROM coaching_runs WHERE workspace_id=? AND call_id=? ORDER BY created_at DESC,rowid DESC LIMIT 20',
      this.workspaceId,
      callId,
    ).all();
    return {
      call,
      assessments: await this.assessmentList(callId),
      coaching: rows.results.map((row) => ({
        ...row,
        citations: JSON.parse(String(row.citations)),
      })) as Coaching[],
    };
  }
  async overview() {
    const [workspace, rows, total, rubric, documents, jobs] = await Promise.all(
      [
        this.statement(
          'SELECT id,name FROM workspaces WHERE id=?',
          this.workspaceId,
        ).first<{ id: string; name: string }>(),
        this.statement(
          'SELECT * FROM consultations WHERE workspace_id=? ORDER BY created_at DESC,rowid DESC LIMIT 200',
          this.workspaceId,
        ).all(),
        this.statement(
          'SELECT COUNT(*) AS count FROM consultations WHERE workspace_id=?',
          this.workspaceId,
        ).first<{ count: number }>(),
        this.rubric(),
        this.statement(
          'SELECT id,title,body,created_at FROM knowledge_documents WHERE workspace_id=? ORDER BY created_at DESC,rowid DESC',
          this.workspaceId,
        ).all<KnowledgeDocument>(),
        this.statement(
          'SELECT id,call_id,kind,status,error_code,created_at FROM analysis_jobs WHERE workspace_id=? ORDER BY created_at DESC,rowid DESC LIMIT 20',
          this.workspaceId,
        ).all<WorkspaceData['jobs'][number]>(),
      ],
    );
    const assessmentRows = await this.statement(
      'SELECT a.* FROM assessments a WHERE a.workspace_id=? AND a.id=(SELECT b.id FROM assessments b WHERE b.call_id=a.call_id AND b.workspace_id=a.workspace_id ORDER BY b.created_at DESC,b.rowid DESC LIMIT 1)',
      this.workspaceId,
    ).all();
    const latest = new Map(
      assessmentRows.results.map((row) => [
        String(row.call_id),
        readAssessment(row),
      ]),
    );
    return {
      workspace: workspace!,
      calls: rows.results.map((row) => ({
        ...row,
        turns: JSON.parse(String(row.turns)),
        latest: latest.get(String(row.id)) ?? null,
      })) as CallRecord[],
      total: total?.count ?? 0,
      rubric,
      documents: documents.results,
      jobs: jobs.results,
    };
  }
  async createCall(input: unknown) {
    const data = object(input);
    const title = requiredText(data.title, 'consultation title', 120);
    const coordinator = requiredText(data.coordinator, 'coordinator', 100);
    if (data.source !== 'roleplay' && data.source !== 'synthetic')
      throw new AppError(
        422,
        'invalid_source',
        'Use a synthetic or role-play transcript during the pilot.',
      );
    let turns;
    try {
      turns = parseTurns(requiredText(data.transcript, 'transcript', 100000));
    } catch (e) {
      throw new AppError(
        422,
        'invalid_transcript',
        e instanceof Error ? e.message : 'Invalid transcript.',
      );
    }
    const recorded = requiredText(data.recorded_at, 'recorded date', 10);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(recorded) ||
      !Number.isFinite(Date.parse(recorded)) ||
      new Date(recorded).toISOString().slice(0, 10) !== recorded
    )
      throw new AppError(422, 'invalid_date', 'Choose a valid recording date.');
    const callId = id();
    await this.db.batch([
      this.statement(
        'INSERT INTO consultations (id,workspace_id,title,coordinator,source,outcome,turns,recorded_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        callId,
        this.workspaceId,
        title,
        coordinator,
        data.source,
        'unknown',
        JSON.stringify(turns),
        recorded,
        now(),
      ),
      this.event('consultation_created', callId),
    ]);
    return this.getCall(callId);
  }
  async deleteCall(callId: string) {
    await this.getCall(callId);
    await this.db.batch([
      this.statement(
        'DELETE FROM consultations WHERE id=? AND workspace_id=?',
        callId,
        this.workspaceId,
      ),
      this.event('consultation_deleted', callId),
    ]);
    return { deleted: true };
  }
  async setOutcome(callId: string, input: unknown) {
    await this.getCall(callId);
    const data = object(input);
    if (
      !['unknown', 'accepted', 'not_accepted', 'follow_up'].includes(
        String(data.outcome),
      )
    )
      throw new AppError(422, 'invalid_input', 'Choose a valid outcome.');
    await this.db.batch([
      this.statement(
        'UPDATE consultations SET outcome=? WHERE id=? AND workspace_id=?',
        data.outcome,
        callId,
        this.workspaceId,
      ),
      this.event('outcome_updated', callId),
    ]);
    return this.getCall(callId);
  }
  async publishRubric(input: unknown) {
    const data = object(input);
    if (data.approved !== true)
      throw new AppError(
        422,
        'approval_required',
        'Confirm that you approve this rubric for assessment.',
      );
    let definitions;
    try {
      definitions = validateRubric(data.definitions);
    } catch (e) {
      throw new AppError(
        422,
        'invalid_rubric',
        e instanceof Error ? e.message : 'Invalid rubric.',
      );
    }
    const title = requiredText(data.title, 'rubric name', 120);
    const rubricId = id();
    await this.db.batch([
      this.statement(
        'INSERT INTO rubrics (id,workspace_id,title,definitions,created_at) VALUES (?,?,?,?,?)',
        rubricId,
        this.workspaceId,
        title,
        JSON.stringify(definitions),
        now(),
      ),
      this.event('rubric_published', rubricId),
    ]);
    return this.rubric(rubricId);
  }
  async saveAssessment(
    callId: string,
    input: unknown,
    kind: 'human' | 'ai' = 'human',
    model = 'human-reviewer',
    promptVersion = 'manual-review/v1',
  ) {
    const call = await this.getCall(callId);
    const data = object(input);
    const rubricId = requiredText(data.rubric_id, 'rubric version', 100);
    if (!(await this.rubric(rubricId)))
      throw new AppError(
        404,
        'rubric_not_found',
        'Published rubric not found.',
      );
    const base =
      typeof data.base_assessment_id === 'string'
        ? data.base_assessment_id
        : '';
    let content: AssessmentContent;
    try {
      content = prepareAssessment(call.turns, data.dimensions);
    } catch (e) {
      throw new AppError(
        422,
        'invalid_assessment',
        e instanceof Error ? e.message : 'Invalid assessment.',
      );
    }
    const assessmentId = id();
    const result = await this.statement(
      `INSERT INTO assessments (id,workspace_id,call_id,rubric_id,kind,content,prompt_version,model,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM consultations WHERE id=? AND workspace_id=?) AND COALESCE((SELECT id FROM assessments WHERE call_id=? AND workspace_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1),'')=?`,
      assessmentId,
      this.workspaceId,
      callId,
      rubricId,
      kind,
      JSON.stringify(content),
      promptVersion,
      model,
      now(),
      callId,
      this.workspaceId,
      callId,
      this.workspaceId,
      base,
    ).run();
    if (!result.meta.changes)
      throw new AppError(
        409,
        'review_conflict',
        'The consultation changed while you were reviewing it. Reload before saving.',
      );
    // Only identifiers and rejection reasons are logged. Raw transcript content never enters logs.
    for (const rejection of content.rejections)
      console.warn(
        JSON.stringify({
          event: 'evidence_rejected',
          assessment_id: assessmentId,
          ...rejection,
        }),
      );
    await this.event('assessment_saved', assessmentId).run();
    return (await this.assessmentList(callId)).find(
      (a) => a.id === assessmentId,
    )!;
  }
  async addDocument(input: unknown) {
    const data = object(input);
    if (data.approved !== true)
      throw new AppError(
        422,
        'approval_required',
        'Only approved material can enter the coaching library.',
      );
    const count = await this.statement(
      'SELECT COUNT(*) AS count FROM knowledge_documents WHERE workspace_id=?',
      this.workspaceId,
    ).first<{ count: number }>();
    if ((count?.count ?? 0) >= 50)
      throw new AppError(
        422,
        'library_limit',
        'This pilot supports up to fifty documents.',
      );
    const title = requiredText(data.title, 'document title', 150);
    const body = requiredText(data.body, 'document content', 60000);
    const documentId = id();
    const chunks = body.match(/[\s\S]{1,1800}/g) ?? [];
    await this.db.batch([
      this.statement(
        'INSERT INTO knowledge_documents (id,workspace_id,title,body,created_at) VALUES (?,?,?,?,?)',
        documentId,
        this.workspaceId,
        title,
        body,
        now(),
      ),
      ...chunks.map((chunk, position) =>
        this.statement(
          'INSERT INTO knowledge_chunks (id,workspace_id,document_id,position,body) VALUES (?,?,?,?,?)',
          id(),
          this.workspaceId,
          documentId,
          position,
          chunk,
        ),
      ),
      this.event('knowledge_approved', documentId),
    ]);
    return { id: documentId, title, body };
  }
  async deleteDocument(documentId: string) {
    const doc = await this.statement(
      'SELECT id FROM knowledge_documents WHERE id=? AND workspace_id=?',
      documentId,
      this.workspaceId,
    ).first();
    if (!doc) throw new AppError(404, 'not_found', 'Document not found.');
    await this.db.batch([
      this.statement(
        'DELETE FROM knowledge_documents WHERE id=? AND workspace_id=?',
        documentId,
        this.workspaceId,
      ),
      this.statement(
        'DELETE FROM coaching_runs WHERE workspace_id=?',
        this.workspaceId,
      ),
      this.event('knowledge_deleted', documentId),
    ]);
    return { deleted: true };
  }
  async retrieve(query: string) {
    const stop = new Set([
      'the',
      'and',
      'for',
      'with',
      'that',
      'this',
      'what',
      'how',
      'can',
      'should',
      'our',
      'about',
      'from',
      'have',
      'into',
      'when',
      'would',
      'could',
    ]);
    const tokens = [
      ...new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []),
    ]
      .filter((t) => !stop.has(t))
      .slice(0, 12);
    if (!tokens.length) return [];
    const rows = await this.statement(
      `SELECT k.id AS chunk_id,k.document_id,k.body,d.title FROM knowledge_chunks k JOIN knowledge_documents d ON d.id=k.document_id AND d.workspace_id=k.workspace_id WHERE k.workspace_id=? AND (${tokens.map(() => 'instr(lower(k.body),?)>0').join(' OR ')}) LIMIT 120`,
      this.workspaceId,
      ...tokens,
    ).all<{
      chunk_id: string;
      document_id: string;
      body: string;
      title: string;
    }>();
    return rows.results
      .map((row) => ({
        ...row,
        relevance: tokens.filter((t) => row.body.toLowerCase().includes(t))
          .length,
      }))
      .sort(
        (a, b) =>
          b.relevance - a.relevance || a.chunk_id.localeCompare(b.chunk_id),
      )
      .slice(0, 5);
  }
  async beginJob(callId: string, kind: string, limit: number) {
    await this.getCall(callId);
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const stale = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    await this.statement(
      "UPDATE analysis_jobs SET status='failed',error_code='interrupted',finished_at=? WHERE workspace_id=? AND status='running' AND created_at<?",
      now(),
      this.workspaceId,
      stale,
    ).run();
    const jobId = id();
    const result = await this.statement(
      "INSERT INTO analysis_jobs (id,workspace_id,call_id,kind,status,created_at) SELECT ?,?,?,?,'running',? WHERE NOT EXISTS (SELECT 1 FROM analysis_jobs WHERE workspace_id=? AND call_id=? AND status='running') AND (SELECT COUNT(*) FROM analysis_jobs WHERE workspace_id=? AND created_at>?)<?",
      jobId,
      this.workspaceId,
      callId,
      kind,
      now(),
      this.workspaceId,
      callId,
      this.workspaceId,
      cutoff,
      limit,
    ).run();
    if (!result.meta.changes)
      throw new AppError(
        429,
        'processing_limit',
        'A run is already in progress, or the daily processing limit has been reached.',
      );
    return jobId;
  }
  async finishJob(jobId: string, error?: string) {
    await this.statement(
      'UPDATE analysis_jobs SET status=?,error_code=?,finished_at=? WHERE id=? AND workspace_id=?',
      error ? 'failed' : 'completed',
      error ?? null,
      now(),
      jobId,
      this.workspaceId,
    ).run();
  }
  async saveCoaching(
    callId: string,
    question: string,
    answer: string,
    citations: Citation[],
    model: string,
    sources: Pick<Citation, 'chunk_id' | 'document_id'>[] = citations,
  ) {
    if (!citations.length || !sources.length)
      throw new AppError(
        422,
        'unsupported_coaching',
        'No supported coaching answer was returned.',
      );
    // Check every passage given to the model, even if the answer does not cite it.
    // The existence checks and insert share one statement, closing the deletion race.
    const sourceChecks = [...sources, ...citations].map(
      () =>
        'EXISTS (SELECT 1 FROM knowledge_chunks k JOIN knowledge_documents d ON d.id=k.document_id AND d.workspace_id=k.workspace_id WHERE k.id=? AND k.document_id=? AND k.workspace_id=?)',
    );
    const runId = id();
    const [saved] = await this.db.batch([
      this.statement(
        `INSERT INTO coaching_runs (id,workspace_id,call_id,question,answer,citations,model,prompt_version,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM consultations WHERE id=? AND workspace_id=?) AND ${sourceChecks.join(' AND ')}`,
        runId,
        this.workspaceId,
        callId,
        question,
        answer,
        JSON.stringify(citations),
        model,
        'grounded-coaching/v1',
        now(),
        callId,
        this.workspaceId,
        ...[...sources, ...citations].flatMap((source) => [
          source.chunk_id,
          source.document_id,
          this.workspaceId,
        ]),
      ),
      this.statement(
        "INSERT INTO audit_events (id,workspace_id,action,entity_id,created_at) SELECT ?,?,'coaching_saved',?,? WHERE EXISTS (SELECT 1 FROM coaching_runs WHERE id=? AND workspace_id=?)",
        id(),
        this.workspaceId,
        runId,
        now(),
        runId,
        this.workspaceId,
      ),
    ]);
    if (!saved.meta.changes)
      throw new AppError(
        409,
        'coaching_context_changed',
        'The consultation or source material changed while coaching was generated. No answer was saved. Refresh before trying again.',
      );
    return { id: runId, question, answer, citations, model };
  }
  async renameWorkspace(name: unknown) {
    const text = requiredText(name, 'workspace name', 100);
    await this.db.batch([
      this.statement(
        'UPDATE workspaces SET name=? WHERE id=?',
        text,
        this.workspaceId,
      ),
      this.event('workspace_renamed', this.workspaceId),
    ]);
    return { name: text };
  }
}
