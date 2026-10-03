import { parseTurns } from './product.ts';

export const IMPORT_MAX_BYTES = 2_000_000;
export const IMPORT_MAX_ROWS = 50;
export const IMPORT_COLUMNS = [
  'title',
  'coordinator',
  'source',
  'recorded_at',
  'transcript',
] as const;
export type ImportPayload = {
  title: string;
  coordinator: string;
  source: 'roleplay' | 'synthetic';
  recorded_at: string;
  transcript: string;
};
export type ImportRow = {
  row: number;
  title: string;
  payload: ImportPayload | null;
  error: string | null;
};
export type ImportResult = {
  row: number;
  title: string;
  status: 'saved' | 'uncertain';
  id?: string;
};

/** Strict CSV state machine: quoted multiline fields, doubled quotes and CRLF. */
export function parseImportCsv(text: string): string[][] {
  if (new TextEncoder().encode(text).length > IMPORT_MAX_BYTES)
    throw new Error('CSV must be 2 MB or smaller.');
  text = text.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let fields: string[] = [],
    field = '',
    quoted = false,
    closed = false;
  const finishField = () => {
    fields.push(field);
    field = '';
    closed = false;
  };
  const finishRecord = () => {
    finishField();
    if (fields.some((value) => value.trim() !== '')) records.push(fields);
    fields = [];
    if (records.length > IMPORT_MAX_ROWS + 1)
      throw new Error(
        `Import at most ${IMPORT_MAX_ROWS} consultations at a time.`,
      );
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
    } else if (c === ',') finishField();
    else if (c === '\n' || c === '\r') {
      finishRecord();
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else if (c === '"' && !field && !closed) quoted = true;
    else {
      if (closed || c === '"')
        throw new Error('Malformed CSV: quotes must enclose the entire field.');
      field += c;
    }
  }
  if (quoted) throw new Error('Malformed CSV: a quoted field is not closed.');
  if (field || fields.length || closed) finishRecord();
  return records;
}

export function previewImport(text: string): ImportRow[] {
  const [header, ...records] = parseImportCsv(text);
  if (
    !header ||
    header.length !== IMPORT_COLUMNS.length ||
    new Set(header).size !== header.length ||
    IMPORT_COLUMNS.some((key) => !header.includes(key))
  )
    throw new Error(
      `Use exactly these column headers: ${IMPORT_COLUMNS.join(', ')}.`,
    );
  if (!records.length) throw new Error('The CSV has no consultation rows.');
  const seen = new Set<string>();
  return records.map((fields, index) => {
    const data = Object.fromEntries(
      header.map((key, i) => [key, fields[i]?.trim() ?? '']),
    );
    const row = index + 2;
    try {
      if (fields.length !== header.length)
        throw new Error('Column count does not match the header.');
      if (!data.title || data.title.length > 120)
        throw new Error('Title must contain 1–120 characters.');
      if (!data.coordinator || data.coordinator.length > 100)
        throw new Error('Coordinator must contain 1–100 characters.');
      if (data.source !== 'roleplay' && data.source !== 'synthetic')
        throw new Error(
          'Source must be roleplay or synthetic. Real patient data is not supported.',
        );
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(data.recorded_at) ||
        !Number.isFinite(Date.parse(data.recorded_at)) ||
        new Date(data.recorded_at).toISOString().slice(0, 10) !==
          data.recorded_at
      )
        throw new Error('Recorded date must be a valid YYYY-MM-DD date.');
      parseTurns(data.transcript);
      const payload = data as ImportPayload;
      const fingerprint = JSON.stringify(
        IMPORT_COLUMNS.map((key) => payload[key]),
      );
      if (seen.has(fingerprint))
        throw new Error('Duplicate consultation within this file.');
      seen.add(fingerprint);
      return { row, title: data.title, payload, error: null };
    } catch (error) {
      return {
        row,
        title: data.title || 'Untitled',
        payload: null,
        error: error instanceof Error ? error.message : 'Invalid row.',
      };
    }
  });
}

// Headers only: no example record can accidentally become live workspace content.
export function importTemplate(): string {
  return IMPORT_COLUMNS.join(',') + '\r\n';
}

/** Stop on every error; any failed response may hide a committed create. Never retry. */
export async function executeImport(
  rows: ImportRow[],
  create: (payload: ImportPayload) => Promise<{ id: string }>,
  progress: (results: ImportResult[]) => void = () => {},
  canContinue: () => boolean = () => true,
): Promise<{ results: ImportResult[]; stopped: boolean }> {
  if (
    !rows.length ||
    rows.length > IMPORT_MAX_ROWS ||
    rows.some((row) => !row.payload || row.error)
  )
    throw new Error('Correct every invalid row before importing.');
  const results: ImportResult[] = [];
  for (const row of rows) {
    if (!canContinue()) return { results, stopped: true };
    try {
      const saved = await create(row.payload!);
      if (!saved || typeof saved.id !== 'string' || !saved.id)
        throw new Error('Missing saved record confirmation.');
      results.push({
        row: row.row,
        title: row.title,
        status: 'saved',
        id: saved.id,
      });
    } catch {
      results.push({ row: row.row, title: row.title, status: 'uncertain' });
      progress([...results]);
      return { results, stopped: true };
    }
    progress([...results]);
  }
  return { results, stopped: false };
}
