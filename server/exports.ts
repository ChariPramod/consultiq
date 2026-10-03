import { AppError, type Repository } from './repository.ts';
import type { AssessmentContent } from '../lib/assessment.ts';
import type { Turn, RubricDefinition } from '../lib/product.ts';

const MAX_REVISIONS = 100;
const MAX_BYTES = 3 * 1024 * 1024;
const tooLarge = () =>
  new AppError(
    413,
    'export_too_large',
    'This consultation exceeds the portable export limit. Use an administrator backup instead.',
  );

/** Quoted CSV alone does not prevent spreadsheet formula evaluation. */
type Cell = string | number | null | undefined;
export function exportCell(value: Cell): string {
  const text = value == null ? '' : String(value);
  const safe =
    /^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text)
      ? "'" + text
      : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}

/** The caller must supply an authenticated, role-authorized workspace repository. */
export async function exportConsultation(
  repo: Repository,
  callId: string,
  format: string | null,
): Promise<{ filename: string; mime: string; content: string }> {
  if (format !== 'json' && format !== 'csv')
    throw new AppError(
      422,
      'invalid_export_format',
      'Choose json or csv export format.',
    );
  const call = await repo
    .statement(
      'SELECT id,title,coordinator,source,outcome,recorded_at,created_at,turns FROM consultations WHERE workspace_id=? AND id=?',
      repo.workspaceId,
      callId,
    )
    .first<{
      id: string;
      title: string;
      coordinator: string;
      source: string;
      outcome: string;
      recorded_at: string;
      created_at: string;
      turns: string;
    }>();
  if (!call) throw new AppError(404, 'not_found', 'Consultation not found.');
  const rows = await repo
    .statement(
      `SELECT a.id,a.rubric_id,a.kind,a.prompt_version,a.model,a.created_at,
      CASE WHEN length(a.content)<=524288 THEN a.content END AS content,
      r.title AS rubric_title,r.created_at AS rubric_created_at,
      CASE WHEN length(r.definitions)<=100000 THEN r.definitions END AS rubric_definitions
     FROM assessments a LEFT JOIN rubrics r ON r.id=a.rubric_id AND r.workspace_id=a.workspace_id
     WHERE a.workspace_id=? AND a.call_id=? ORDER BY a.created_at DESC,a.rowid DESC LIMIT ?`,
      repo.workspaceId,
      callId,
      MAX_REVISIONS + 1,
    )
    .all<{
      id: string;
      rubric_id: string;
      kind: string;
      prompt_version: string;
      model: string | null;
      created_at: string;
      content: string | null;
      rubric_title: string | null;
      rubric_created_at: string | null;
      rubric_definitions: string | null;
    }>();
  if (
    rows.results.length > MAX_REVISIONS ||
    rows.results.some(
      (row) =>
        row.content === null ||
        (row.rubric_title !== null && row.rubric_definitions === null),
    )
  )
    throw tooLarge();
  // Explicit fields keep future credential/internal columns out of portable files.
  const turns = JSON.parse(call.turns) as Turn[];
  const revisions = rows.results.map((row) => ({
    id: row.id,
    rubric_id: row.rubric_id,
    kind: row.kind,
    prompt_version: row.prompt_version,
    model: row.model,
    created_at: row.created_at,
    content: JSON.parse(row.content!) as AssessmentContent,
    rubric:
      row.rubric_definitions === null
        ? null
        : {
            id: row.rubric_id,
            title: row.rubric_title,
            created_at: row.rubric_created_at,
            definitions: JSON.parse(
              row.rubric_definitions,
            ) as RubricDefinition[],
          },
  }));
  const bundle = {
    schema: 'consultiq.consultation-export',
    schema_version: 1,
    exported_at: new Date().toISOString(),
    workspace_id: repo.workspaceId,
    consultation: {
      ...call,
      turns: turns.map((turn) => ({
        role: turn.role,
        text: turn.text,
        time: turn.time,
      })),
    },
    assessment_revisions: revisions,
    notes: [
      'Revisions are newest first. Scores and evidence are saved records, not a new assessment.',
      'Turn indices are zero based. This is a portable handoff, not a restorable backup or native CRM synchronization.',
      'This export uses separate scoped reads, not a transactional backup snapshot; concurrent updates may be reflected between reads.',
    ],
  };
  let body = JSON.stringify(bundle, null, 2);
  if (Buffer.byteLength(body) > MAX_BYTES) throw tooLarge();
  if (format === 'csv') {
    const columns = [
      'record_type',
      'consultation_id',
      'title',
      'coordinator',
      'source',
      'outcome',
      'recorded_at',
      'revision_id',
      'revision_created_at',
      'author_kind',
      'rubric_id',
      'rubric_title',
      'prompt_version',
      'model',
      'dimension',
      'score',
      'rationale',
      'coaching_note',
      'turn_index',
      'role',
      'time',
      'text',
      'rubric_definitions_json',
    ];
    const records: Cell[][] = [];
    const base = [
      call.id,
      call.title,
      call.coordinator,
      call.source,
      call.outcome,
      call.recorded_at,
    ];
    records.push(['consultation', ...base]);
    turns.forEach((turn, index) =>
      records.push([
        'transcript',
        ...base,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        index,
        turn.role,
        turn.time,
        turn.text,
      ]),
    );
    for (const revision of revisions) {
      const provenance = [
        ...base,
        revision.id,
        revision.created_at,
        revision.kind,
        revision.rubric_id,
        revision.rubric?.title ?? '',
        revision.prompt_version,
        revision.model,
      ];
      records.push([
        'rubric',
        ...provenance,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        JSON.stringify(revision.rubric?.definitions ?? null),
      ]);
      for (const dimension of revision.content.dimensions) {
        const assessment = [
          ...provenance,
          dimension.dimension,
          dimension.score,
          dimension.rationale,
          dimension.coaching_note,
        ];
        records.push(['assessment', ...assessment]);
        for (const evidence of dimension.evidence)
          records.push([
            'evidence',
            ...assessment,
            evidence.turn_index,
            '',
            '',
            evidence.span,
          ]);
      }
    }
    body =
      [columns, ...records]
        .map((row) =>
          columns.map((_, index) => exportCell(row[index])).join(','),
        )
        .join('\r\n') + '\r\n';
    if (Buffer.byteLength(body) > MAX_BYTES) throw tooLarge();
  }
  // The authenticated client creates the download; workspace headers remain attached.
  const envelope = {
    filename: `consultiq-consultation.${format}`,
    mime:
      format === 'json'
        ? 'application/json; charset=utf-8'
        : 'text/csv; charset=utf-8',
    content: body,
  };
  // The API returns JSON, so escaped download content must fit the response too.
  if (Buffer.byteLength(JSON.stringify(envelope)) > MAX_BYTES) throw tooLarge();
  return envelope;
}
