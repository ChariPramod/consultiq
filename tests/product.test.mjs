import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTurns, validateRubric, csv } from '../lib/product.ts';
test('transcript import preserves labels and supplied timestamps', () => {
  assert.deepEqual(
    parseTurns(
      '[01:24] Coordinator: How can I help?\nPatient: I have a question.',
    ),
    [
      { role: 'Coordinator', text: 'How can I help?', time: '01:24' },
      { role: 'Patient', text: 'I have a question.', time: '' },
    ],
  );
});
test('unlabeled lines and one-sided transcripts fail explicitly', () => {
  assert.throws(() => parseTurns('Coordinator: Hello\nUnknown: Hi'), /Line 2/);
  assert.throws(
    () => parseTurns('Coordinator: Hello\nCoordinator: Bye'),
    /both/,
  );
});
test('oversized transcripts and invalid rubric anchors are rejected', () => {
  assert.throws(() => parseTurns('x'.repeat(100001)), /length/);
  assert.throws(() => validateRubric([]), /every/);
});
test('export leaves unscored values blank and neutralizes spreadsheet formulas', () => {
  const result = csv([
    {
      title: '=SUM(1,2)',
      coordinator: 'A "name"',
      source: 'roleplay',
      recorded_at: '2026-09-09',
      outcome: 'unknown',
      latest: null,
    },
  ]);
  assert.ok(result.includes('"\'=SUM(1,2)"'));
  assert.ok(result.includes('"A ""name"""'));
  assert.ok(result.endsWith('"Not recorded","","0"'));
});
