import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchingTurns, transcriptMatches } from '../lib/transcript-search.ts';
test('transcript search is literal and preserves original offsets and punctuation', () => {
  const text = 'Cost (today)? COST (today)?';
  assert.deepEqual(transcriptMatches(text, '(today)?'), [
    { start: 5, end: 13 },
    { start: 19, end: 27 },
  ]);
  assert.deepEqual(transcriptMatches('a+b a*b', 'a+b'), [{ start: 0, end: 3 }]);
  assert.deepEqual(transcriptMatches('[fee] $50 \\ ok', '[fee]'), [
    { start: 0, end: 5 },
  ]);
});
test('Unicode matching does not invent source spans from normalization', () => {
  const text = 'K and K; 😀';
  const matches = transcriptMatches(text, 'k');
  assert.deepEqual(
    matches.map((m) => text.slice(m.start, m.end)),
    ['K', 'K'],
  );
  assert.deepEqual(transcriptMatches(text, '😀'), [{ start: 9, end: 11 }]);
  assert.deepEqual(transcriptMatches('é', 'e'), []);
});
test('blank and oversized searches are bounded, and speaker search preserves turn indices', () => {
  assert.deepEqual(transcriptMatches('hello', ' '), []);
  assert.deepEqual(transcriptMatches('x'.repeat(300), 'x'.repeat(201)), []);
  const turns = [
    { role: 'Coordinator', text: 'Follow up tomorrow', time: '' },
    { role: 'Patient', text: 'Tomorrow works', time: '' },
    { role: 'Coordinator', text: 'Good', time: '' },
  ];
  assert.deepEqual(matchingTurns(turns, 'tomorrow', 'all'), [0, 1]);
  assert.deepEqual(matchingTurns(turns, 'tomorrow', 'Patient'), [1]);
  assert.deepEqual(matchingTurns(turns, 'tomorrow', 'Coordinator'), [0]);
});
