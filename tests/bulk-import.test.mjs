import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseImportCsv,
  previewImport,
  executeImport,
  importTemplate,
  IMPORT_MAX_BYTES,
} from '../lib/bulk-import.ts';
const record = [
  'Training, "one"',
  'Reviewer',
  'synthetic',
  '2026-10-02',
  'Coordinator: Hello.\nPatient: Good morning.',
];
const encode = (row) =>
  row.map((value) => '"' + value.replaceAll('"', '""') + '"').join(',');
const file = (...records) =>
  importTemplate() + records.map(encode).join('\r\n');
test('CSV preserves multiline quoted transcripts, commas, escaped quotes, BOM and CRLF', () => {
  assert.deepEqual(parseImportCsv('\uFEFF' + file(record))[1], record);
  assert.equal(previewImport(file(record))[0].payload.title, record[0]);
  assert.deepEqual(parseImportCsv('a,b\r\n"",x\r\n'), [
    ['a', 'b'],
    ['', 'x'],
  ]);
});
test('malformed CSV, unknown headers, excessive rows and bytes fail before submission', () => {
  for (const input of ['"unclosed', 'a"bad,b', '"closed"oops,b'])
    assert.throws(() => parseImportCsv(input), /Malformed/);
  assert.throws(() => previewImport('title,title\na,b'), /headers/);
  assert.throws(() => previewImport(file(...Array(51).fill(record))), /50/);
  assert.throws(
    () => parseImportCsv('é'.repeat(IMPORT_MAX_BYTES / 2 + 1)),
    /2 MB/,
  );
  assert.throws(() => previewImport(importTemplate()), /no consultation/);
});
test('preflight rejects real patient sources, bad dates, transcripts, field count and duplicate rows', () => {
  const changes = [
    [2, 'patient'],
    [3, '2026-02-30'],
    [4, 'Patient: Alone'],
    [0, ''],
    [1, 'x'.repeat(101)],
  ];
  for (const [index, value] of changes) {
    const invalid = [...record];
    invalid[index] = value;
    assert.equal(previewImport(file(invalid))[0].payload, null);
  }
  assert.match(previewImport(file(record, record))[1].error, /Duplicate/);
  assert.match(
    previewImport(file(record.slice(0, 4)))[0].error,
    /Column count/,
  );
});
test('template is header-only and contains no sample or formula executable content', () => {
  assert.equal(parseImportCsv(importTemplate()).length, 1);
  assert.ok(!/[=+@]/.test(importTemplate()));
});
test('sequential submission stops after lost response, retains successes, never retries or submits remaining rows', async () => {
  const rows = previewImport(
    file(record, ['Second', ...record.slice(1)], ['Third', ...record.slice(1)]),
  );
  const calls = [];
  const snapshots = [];
  const result = await executeImport(
    rows,
    async (payload) => {
      calls.push(payload.title);
      if (calls.length === 2) throw new Error('response lost after commit');
      return { id: 'saved-id' };
    },
    (progress) => snapshots.push(progress),
  );
  assert.equal(result.stopped, true);
  assert.deepEqual(calls, [record[0], 'Second']);
  assert.deepEqual(
    result.results.map((row) => row.status),
    ['saved', 'uncertain'],
  );
  assert.equal(result.results[0].id, 'saved-id');
  assert.equal(snapshots[0].length, 1);
});
test('invalid confirmation is uncertain and invalid previews never issue requests', async () => {
  const rows = previewImport(file(record));
  assert.equal((await executeImport(rows, async () => ({}))).stopped, true);
  let requested = false;
  await assert.rejects(
    executeImport(previewImport(file(record, record)), async () => {
      requested = true;
      return { id: 'x' };
    }),
    /invalid/,
  );
  assert.equal(requested, false);
  const result = await executeImport(rows, async () => ({ id: 'ok' }));
  assert.equal(result.stopped, false);
  assert.equal(result.results[0].status, 'saved');
});

test('navigation guard stops the batch before another workspace can receive a record', async () => {
  const rows = previewImport(file(record, ['Second', ...record.slice(1)]));
  let workspace = 'original';
  let requested = 0;
  const result = await executeImport(
    rows,
    async () => {
      requested++;
      workspace = 'different';
      return { id: 'confirmed' };
    },
    () => {},
    () => workspace === 'original',
  );
  assert.equal(requested, 1);
  assert.equal(result.stopped, true);
  assert.deepEqual(
    result.results.map((row) => row.status),
    ['saved'],
  );
  const unmounted = await executeImport(
    rows,
    async () => {
      throw new Error('Must not send');
    },
    () => {},
    () => false,
  );
  assert.deepEqual(unmounted.results, []);
});
