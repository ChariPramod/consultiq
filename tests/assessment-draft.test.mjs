import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessmentDraftEntryReady,
  buildAssessmentDimensions,
  createAssessmentDraftEntry,
} from '../lib/assessment-draft.ts';
import { prepareAssessment } from '../lib/assessment.ts';

function savedDimension(count = 3) {
  return {
    dimension: 0,
    score: 3,
    unsupported: false,
    rationale: 'Mechanical preservation fixture.',
    coaching_note: '',
    evidence: Array.from({ length: count }, (_, turn_index) => ({
      turn_index,
      span: `Stored citation from turn ${turn_index}.`,
      validated: true,
    })),
  };
}

test('rationale and score edits preserve every saved citation without mutating history', () => {
  const original = savedDimension(8);
  const originalJson = JSON.stringify(original);
  const draft = createAssessmentDraftEntry(0, original);
  draft.rationale = 'Corrected reasoning.';
  draft.score = 4;
  const result = buildAssessmentDimensions([draft])[0];
  assert.equal(result.evidence.length, 8);
  assert.deepEqual(
    result.evidence,
    original.evidence.map(({ turn_index, span }) => ({ turn_index, span })),
  );
  assert.equal(result.rationale, 'Corrected reasoning.');
  assert.equal(result.score, 4);
  assert.equal(JSON.stringify(original), originalJson);
  assert.ok(result.evidence.every((item) => !('validated' in item)));
});

test('editing or clearing the primary citation preserves additional quotes until explicitly removed', () => {
  const draft = createAssessmentDraftEntry(0, savedDimension());
  draft.span = '';
  assert.equal(assessmentDraftEntryReady(draft), true);
  assert.deepEqual(
    buildAssessmentDimensions([draft])[0].evidence.map(
      (item) => item.turn_index,
    ),
    [1, 2],
  );
  draft.additional_evidence = draft.additional_evidence.filter(
    (item) => item.turn_index !== 1,
  );
  assert.deepEqual(
    buildAssessmentDimensions([draft])[0].evidence.map(
      (item) => item.turn_index,
    ),
    [2],
  );
  draft.additional_evidence = [];
  assert.equal(assessmentDraftEntryReady(draft), false);
  draft.score = null;
  assert.equal(assessmentDraftEntryReady(draft), true);
  assert.equal(buildAssessmentDimensions([draft])[0].score, null);
});

test('duplicate primary and retained quotes are deduplicated using the quote normalizer and turn identity', () => {
  const draft = createAssessmentDraftEntry(0, savedDimension());
  draft.turn_index = 1;
  draft.span = ' Stored citation  from turn 1. ';
  const result = buildAssessmentDimensions([draft])[0];
  assert.equal(result.evidence.length, 2);
  assert.equal(result.evidence[0].span, draft.span);
  draft.additional_evidence.push({ turn_index: 7, span: draft.span });
  assert.equal(buildAssessmentDimensions([draft])[0].evidence.length, 3);
});

test('an empty draft for a new rubric carries no scores, notes or old evidence', () => {
  const empty = createAssessmentDraftEntry(4);
  assert.equal(empty.dimension, 4);
  assert.equal(empty.score, null);
  assert.equal(empty.rationale, '');
  assert.equal(empty.coaching_note, '');
  assert.deepEqual(buildAssessmentDimensions([empty])[0].evidence, []);
  assert.equal(assessmentDraftEntryReady(empty), false);
});

test('preserved citations still pass through the real server quote validator', () => {
  const saved = savedDimension(2);
  const entries = Array.from({ length: 8 }, (_, dimension) =>
    createAssessmentDraftEntry(dimension, saved),
  );
  entries[0].span = 'Fabricated replacement quotation.';
  const turns = saved.evidence.map((item) => ({ text: item.span }));
  const result = prepareAssessment(turns, buildAssessmentDimensions(entries));
  assert.equal(result.rejections.length, 1);
  assert.equal(result.dimensions[0].score, 3);
  assert.deepEqual(
    result.dimensions[0].evidence.map((item) => item.turn_index),
    [1],
  );
  entries[0].additional_evidence = [];
  assert.equal(
    prepareAssessment(turns, buildAssessmentDimensions(entries)).dimensions[0]
      .score,
    null,
  );
});
