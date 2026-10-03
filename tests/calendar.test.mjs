import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calendarText,
  foldCalendarLine,
  practiceCalendar,
} from '../lib/calendar.ts';
const input = {
  assignmentId: 'assignment-123',
  date: '2028-02-29',
  origin: 'https://app.test',
};
test('all-day reminders preserve leap day and exclusive next-day end with CRLF', () => {
  const result = practiceCalendar(input, new Date('2026-10-02T12:30:00.000Z'));
  assert.match(
    result,
    /DTSTART;VALUE=DATE:20280229\r\nDTEND;VALUE=DATE:20280301/,
  );
  assert.match(result, /DTSTAMP:20261002T123000Z/);
  assert.match(result, /URL:https:\/\/app.test\/workspace/);
  assert.match(result, /CLASS:PRIVATE/);
  assert.doesNotMatch(result, /ATTENDEE|ORGANIZER|VALARM/);
  assert.equal(result.replaceAll('\r\n', '').includes('\n'), false);
});
test('calendar input rejects rolled dates and injected identifiers or origins', () => {
  for (const date of [
    '2026-02-29',
    '2026-13-01',
    '2026-00-01',
    '2026-04-31',
    '26-01-01',
    '2100-01-01',
  ])
    assert.throws(() => practiceCalendar({ ...input, date }));
  assert.throws(() =>
    practiceCalendar({ ...input, assignmentId: 'x\r\nATTENDEE:bad' }),
  );
  for (const origin of [
    'javascript:bad',
    'https://a.test/path',
    'https://user:password@a.test',
  ])
    assert.throws(() => practiceCalendar({ ...input, origin }));
});
test('calendar text escaping and UTF-8 folding round-trip without splitting characters', () => {
  assert.equal(
    calendarText('a\\b;c,d\r\nNEXT:bad'),
    'a\\\\b\\;c\\,d\\nNEXT:bad',
  );
  const line = 'DESCRIPTION:' + '🦷é'.repeat(40);
  const folded = foldCalendarLine(line);
  for (const segment of folded.split('\r\n'))
    assert.ok(Buffer.byteLength(segment) <= 75);
  assert.equal(folded.replaceAll('\r\n ', ''), line);
});
