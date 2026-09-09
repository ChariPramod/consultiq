import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEvidence } from '../lib/evidence.ts';
const turns = [
  {
    role: 'Coordinator',
    text: 'Would Thursday at ten work for a follow-up?',
    time: '',
  },
  { role: 'Patient', text: 'Thursday works for me.', time: '' },
];
test('evidence is tied to the cited turn; invented quotes are rejected', () => {
  const result = validateEvidence(turns, [
    { turn_index: 0, span: 'Thursday at ten' },
    { turn_index: 0, span: 'Thursday works for me.' },
    { turn_index: 99, span: 'Thursday works for me.' },
  ]);
  assert.deepEqual(result.valid, [
    { turn_index: 0, span: 'Thursday at ten', validated: true },
  ]);
  assert.deepEqual(
    result.rejected.map((r) => r.reason),
    ['quote_not_found', 'turn_not_found'],
  );
});
import { prepareAssessment } from '../lib/assessment.ts';
test('an unsupported proposed score is not stored as a scored dimension', () => {
  const entries = Array.from({ length: 8 }, (_, dimension) => ({
    dimension,
    score: 4,
    rationale: 'Reviewer explanation.',
    coaching_note: 'Confirm the next step.',
    evidence:
      dimension === 0
        ? [{ turn_index: 0, span: 'Thursday at ten' }]
        : [{ turn_index: 0, span: 'A completely invented sentence.' }],
  }));
  const result = prepareAssessment(turns, entries);
  assert.equal(result.dimensions[0].score, 4);
  assert.equal(result.dimensions[1].score, null);
  assert.equal(result.dimensions[1].unsupported, true);
  assert.equal(result.supported_count, 1);
  assert.equal(result.rejections.length, 7);
});
