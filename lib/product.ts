import type { AssessmentContent } from './assessment.ts';
export const DIMENSIONS = [
  'Needs discovery',
  'Emotional acknowledgment',
  'Presentation clarity',
  'Price anchoring',
  'Objection response',
  'Call to action',
  'Social proof and reassurance',
  'Follow-up commitment',
] as const;
export type Turn = {
  role: 'Coordinator' | 'Patient';
  text: string;
  time: string;
};
export type RubricDefinition = {
  dimension: number;
  one: string;
  three: string;
  five: string;
};
export type Rubric = {
  id: string;
  title: string;
  definitions: RubricDefinition[];
  created_at: string;
};
export type SavedAssessment = {
  id: string;
  call_id: string;
  rubric_id: string;
  kind: 'human' | 'ai';
  content: AssessmentContent;
  prompt_version: string;
  model: string;
  created_at: string;
};
export type CallRecord = {
  id: string;
  title: string;
  coordinator: string;
  source: 'roleplay' | 'synthetic';
  outcome: 'unknown' | 'accepted' | 'not_accepted' | 'follow_up';
  recorded_at: string;
  created_at: string;
  turns: Turn[];
  latest: SavedAssessment | null;
};
export type Citation = {
  chunk_id: string;
  document_id: string;
  title: string;
  span: string;
};
export type Coaching = {
  id: string;
  question: string;
  answer: string;
  citations: Citation[];
  model: string;
  created_at: string;
};
export type KnowledgeDocument = {
  id: string;
  title: string;
  body: string;
  created_at: string;
};
export type RunTelemetry = {
  schema_version: 1;
  total_ms: number;
  model_ms: number | null;
  validation_save_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
};
export type WorkspaceData = {
  workspace: { id: string; name: string };
  access: { role: 'owner' | 'reviewer' | 'viewer'; user_id: string };
  calls: CallRecord[];
  total: number;
  rubric: Rubric | null;
  documents: KnowledgeDocument[];
  configuration: {
    scoring: boolean;
    tracing: boolean;
    model: string | null;
    queue?: boolean;
  };
  jobs: {
    id: string;
    status: string;
    kind: string;
    call_id: string;
    error_code: string | null;
    telemetry: RunTelemetry | null;
    created_at: string;
  }[];
};
export const OUTCOME_LABELS = {
  unknown: 'Not recorded',
  accepted: 'Accepted',
  not_accepted: 'Not accepted',
  follow_up: 'Follow-up',
} as const;
export function parseTurns(raw: string): Turn[] {
  if (raw.length > 100000)
    throw new Error('Transcript exceeds the supported length.');
  const lines = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length < 2)
    throw new Error('Add at least two speaker-labeled turns.');
  if (lines.length > 1000) throw new Error('Transcript has too many turns.');
  const turns = lines.map((line, index) => {
    const m = line.match(
      /^(?:\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*)?(Coordinator|Patient):\s*(.+)$/i,
    );
    if (!m)
      throw new Error(
        `Line ${index + 1}: use Coordinator: or Patient: before the text.`,
      );
    return {
      role: m[2].toLowerCase() === 'coordinator' ? 'Coordinator' : 'Patient',
      text: m[3],
      time: m[1] ?? '',
    } as Turn;
  });
  if (new Set(turns.map((t) => t.role)).size < 2)
    throw new Error('Include both Coordinator and Patient turns.');
  return turns;
}
export function validateRubric(value: unknown): RubricDefinition[] {
  if (!Array.isArray(value) || value.length !== 8)
    throw new Error('Define anchors for every rubric dimension.');
  return value.map((entry, index) => {
    if (
      !entry ||
      entry.dimension !== index ||
      ['one', 'three', 'five'].some(
        (k) =>
          typeof entry[k] !== 'string' ||
          entry[k].trim().length < 12 ||
          entry[k].length > 2000,
      )
    )
      throw new Error(`Complete the score anchors for ${DIMENSIONS[index]}.`);
    return {
      dimension: index,
      one: entry.one.trim(),
      three: entry.three.trim(),
      five: entry.five.trim(),
    };
  });
}
export function csv(calls: CallRecord[]) {
  const cell = (v: string | number | null | undefined) =>
    '"' +
    String(v ?? '')
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  return [
    [
      'Consultation',
      'Coordinator',
      'Source',
      'Recorded',
      'Outcome',
      'Score',
      'Supported dimensions',
    ],
    ...calls.map((c) => [
      c.title,
      c.coordinator,
      c.source,
      c.recorded_at,
      OUTCOME_LABELS[c.outcome],
      c.latest?.content.average?.toFixed(2) ?? '',
      c.latest?.content.supported_count ?? 0,
    ]),
  ]
    .map((row) => row.map(cell).join(','))
    .join('\r\n');
}
