import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  averageScore,
  summarize,
  filterCalls,
  parseTranscript,
  csvExport,
  demoCalls,
} from '../lib/consultations.ts';
const fixture = {
  id: 'test',
  title: 'Role-play',
  coordinator: 'Sarah Mitchell',
  initials: 'SM',
  date: '2026-09-08',
  duration: 0,
  outcome: 'Accepted',
  scores: [4, 4, 4, 4, 4, 4, 4, 4],
  transcript: [],
  source: 'Demo',
};
test('speaker-labeled text is parsed without inventing timestamps', () => {
  assert.deepEqual(
    parseTranscript(' coordinator: Hello there.\n\nPatient: Hello! '),
    [
      { role: 'Coordinator', text: 'Hello there.', time: '' },
      { role: 'Patient', text: 'Hello!', time: '' },
    ],
  );
});
test('unlabeled turns are rejected with their line number', () => {
  assert.throws(
    () => parseTranscript('Coordinator: Hello\nUnknown: Goodbye'),
    /Line 2/,
  );
});
test('both roles and multiple turns are required', () => {
  assert.throws(() => parseTranscript('Coordinator: Hello'), /at least two/);
  assert.throws(
    () => parseTranscript('Coordinator: Hello\nCoordinator: Goodbye'),
    /both/,
  );
  assert.throws(() => parseTranscript('Patient: \nCoordinator: Hi'), /Line 1/);
});
test('oversized pasted transcripts are rejected', () => {
  assert.throws(() => parseTranscript('x'.repeat(100001)), /under 100,000/);
});
test('unscored imports never alter rubric averages or known-outcome acceptance', () => {
  const imported = {
    ...fixture,
    id: 'import',
    scores: [],
    outcome: 'Unscored',
    source: 'Session import',
  };
  assert.equal(averageScore(imported), null);
  assert.deepEqual(summarize([fixture, imported]), {
    count: 2,
    score: 4,
    acceptance: 100,
    needsReview: 0,
  });
});
test('follow-up outcomes are excluded from acceptance denominator', () => {
  const rejected = {
    ...fixture,
    id: 'rejected',
    outcome: 'Not accepted',
    scores: [2, 2, 2, 2, 2, 2, 2, 2],
  };
  const pending = { ...fixture, id: 'pending', outcome: 'Follow-up' };
  assert.deepEqual(summarize([fixture, rejected, pending]), {
    count: 3,
    score: 10 / 3,
    acceptance: 50,
    needsReview: 1,
  });
});
test('empty datasets return unavailable metrics rather than fabricated zeros', () => {
  assert.deepEqual(summarize([]), {
    count: 0,
    score: null,
    acceptance: null,
    needsReview: 0,
  });
});
test('search and filters compose and do not mutate the call list', () => {
  const other = {
    ...fixture,
    id: 'other',
    coordinator: 'James Chen',
    title: 'Implants',
    outcome: 'Follow-up',
  };
  const calls = [fixture, other];
  assert.deepEqual(
    filterCalls(calls, ' implants ', 'James Chen', 'Follow-up'),
    [other],
  );
  assert.deepEqual(filterCalls(calls, 'implants', 'Sarah Mitchell'), []);
  assert.equal(calls.length, 2);
});
test('CSV safely quotes commas, quotes, and spreadsheet formulas', () => {
  const csv = csvExport([{ ...fixture, title: '=SUM(1,2)"' }]);
  assert.ok(csv.includes('"\'=SUM(1,2)"""'));
  assert.ok(csv.includes('"Rubric score"'));
  assert.ok(csv.includes('"4.00"'));
});
test('demo fixtures are labeled, bounded, and provide real source excerpts', () => {
  assert.equal(new Set(demoCalls.map((c) => c.id)).size, demoCalls.length);
  for (const call of demoCalls) {
    assert.equal(call.source, 'Demo');
    assert.equal(call.scores.length, 8);
    assert.ok(
      call.scores.every((s) => Number.isInteger(s) && s >= 1 && s <= 5),
    );
    for (const index of [0, 2, 5, 7, 4, 9, 11, 9])
      assert.ok(call.transcript[index].text.length > 0);
  }
});
