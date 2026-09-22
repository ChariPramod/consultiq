import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparison } from '../lib/learning.ts';
test('comparison preserves unsupported scores and refuses differences across rubrics', () => {
  const before = {
    rubric_id: 'r',
    content: { dimensions: [{ dimension: 0, score: 3 }] },
  };
  assert.deepEqual(comparison(before, null, 0), {
    before: 3,
    after: null,
    delta: null,
  });
  assert.equal(
    comparison(
      before,
      { ...before, content: { dimensions: [{ dimension: 0, score: null }] } },
      0,
    ).delta,
    null,
  );
  assert.equal(
    comparison(before, { ...before, rubric_id: 'other' }, 0).delta,
    null,
  );
  assert.equal(
    comparison(
      before,
      { ...before, content: { dimensions: [{ dimension: 0, score: 5 }] } },
      0,
    ).delta,
    2,
  );
});
