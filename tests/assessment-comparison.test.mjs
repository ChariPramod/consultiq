import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareAssessments,
  resolveRevisionPair,
} from '../lib/assessment-comparison.ts';

function revision(id, patch = {}) {
  return {
    id,
    call_id: 'same-call',
    rubric_id: 'owner-authored-version',
    kind: 'human',
    prompt_version: 'human-review',
    model: 'human',
    created_at: '2026-10-02T12:00:00.000Z',
    content: {
      dimensions: Array.from({ length: 8 }, (_, dimension) => ({
        dimension,
        score: 3,
        unsupported: false,
        rationale: 'Mechanical comparison fixture, not a rubric anchor.',
        coaching_note: '',
        evidence: [{ turn_index: 0, span: 'Exact stored fixture quotation.' }],
      })),
      rejections: [],
      supported_count: 8,
      average: 3,
    },
    ...patch,
  };
}

test('identical saved contents have no changes and do not mutate either revision', () => {
  const from = revision('earlier');
  const to = revision('later', { kind: 'ai' });
  const original = JSON.stringify([from, to]);
  const result = compareAssessments(from, to);
  assert.equal(result.sameRubric, true);
  assert.equal(result.changedDimensions, 0);
  assert.equal(result.dimensions.length, 8);
  assert.ok(result.dimensions.every((item) => item.scoreDelta === 0));
  assert.equal(JSON.stringify([from, to]), original);
});

test('numeric differences are directional and match dimensions by ID rather than array position', () => {
  const from = revision('earlier');
  const to = revision('later');
  to.content.dimensions[0].score = 5;
  to.content.dimensions[4].score = 2;
  to.content.dimensions.reverse();
  const result = compareAssessments(from, to);
  assert.equal(result.changedDimensions, 2);
  assert.equal(result.dimensions[0].scoreDelta, 2);
  assert.equal(result.dimensions[4].scoreDelta, -1);
  assert.equal(compareAssessments(to, from).dimensions[0].scoreDelta, -2);
});

test('unscored and unsupported values never become zero or numeric differences', () => {
  const from = revision('earlier');
  const to = revision('later');
  from.content.dimensions[0].score = null;
  from.content.dimensions[0].unsupported = true;
  to.content.dimensions[1].score = null;
  to.content.dimensions[1].unsupported = true;
  from.content.dimensions[2].score = null;
  to.content.dimensions[2].score = null;
  // Defensive handling of inconsistent old content: unsupported still abstains.
  to.content.dimensions[3].unsupported = true;
  const result = compareAssessments(from, to);
  for (let i = 0; i < 4; i++)
    assert.equal(result.dimensions[i].scoreDelta, null);
  assert.equal(result.dimensions[0].from.score, null);
  assert.equal(result.dimensions[0].changes.support, true);
  assert.equal(result.dimensions[1].changes.score, true);
  assert.equal(result.dimensions[2].changed, false);
});

test('mixed rubric revisions suppress every numeric difference without hiding saved content changes', () => {
  const from = revision('earlier');
  const to = revision('later', { rubric_id: 'a-different-version' });
  to.content.dimensions[2].score = 5;
  to.content.dimensions[2].rationale =
    'Revised reasoning against another version.';
  const result = compareAssessments(from, to);
  assert.equal(result.sameRubric, false);
  assert.ok(result.dimensions.every((item) => item.scoreDelta === null));
  assert.equal(result.dimensions[2].from.score, 3);
  assert.equal(result.dimensions[2].to.score, 5);
  assert.equal(result.changedDimensions, 1);
  assert.equal(result.dimensions[2].changes.rationale, true);
});

test('quote text, cited turn, reasoning and coaching changes are separately detected', () => {
  const from = revision('earlier');
  const to = revision('later');
  to.content.dimensions[0].evidence[0].span =
    'A different exact stored quotation.';
  to.content.dimensions[1].evidence[0].turn_index = 3;
  to.content.dimensions[2].coaching_note = 'A saved practice instruction.';
  to.content.dimensions[3].rationale = 'A corrected rationale.';
  const result = compareAssessments(from, to);
  assert.equal(result.changedDimensions, 4);
  assert.equal(result.dimensions[0].changes.evidence, true);
  assert.equal(result.dimensions[1].changes.evidence, true);
  assert.equal(result.dimensions[2].changes.coaching, true);
  assert.equal(result.dimensions[3].changes.rationale, true);
  assert.equal(result.dimensions[0].changes.score, false);
});

test('reordering the same citations is not a source change', () => {
  const from = revision('earlier');
  from.content.dimensions[0].evidence.push({
    turn_index: 2,
    span: 'Another stored quote.',
  });
  const to = structuredClone(from);
  to.id = 'later';
  to.content.dimensions[0].evidence.reverse();
  assert.equal(compareAssessments(from, to).changedDimensions, 0);
});

test('revision selection follows newest-first server ordering until explicitly pinned', () => {
  const older = revision('older');
  const latest = revision('latest');
  const newLatest = revision('new-latest');
  assert.deepEqual(resolveRevisionPair([latest, older]), {
    from: older,
    to: latest,
  });
  // All created_at values intentionally tie. The server insertion order wins.
  assert.deepEqual(resolveRevisionPair([newLatest, latest, older]), {
    from: latest,
    to: newLatest,
  });
  assert.deepEqual(
    resolveRevisionPair([newLatest, latest, older], {
      fromId: 'older',
      toId: 'latest',
    }),
    { from: older, to: latest },
  );
  assert.deepEqual(
    resolveRevisionPair([newLatest, latest, older], {
      fromId: 'latest',
      toId: 'older',
    }),
    { from: latest, to: older },
  );
});

test('missing, duplicate or insufficient selections recover to valid distinct revisions', () => {
  const older = revision('older');
  const latest = revision('latest');
  assert.equal(resolveRevisionPair([]), null);
  assert.equal(resolveRevisionPair([latest]), null);
  for (const selection of [
    { fromId: 'missing', toId: 'latest' },
    { fromId: 'latest', toId: 'latest' },
  ])
    assert.deepEqual(resolveRevisionPair([latest, older], selection), {
      from: older,
      to: latest,
    });
});

test('different consultations cannot be compared', () => {
  assert.throws(
    () =>
      compareAssessments(
        revision('one'),
        revision('two', { call_id: 'other-call' }),
      ),
    /same consultation/,
  );
});
