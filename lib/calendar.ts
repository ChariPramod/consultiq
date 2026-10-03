/** RFC 5545 sections 3.1, 3.3.11 and 3.6.1: https://www.rfc-editor.org/rfc/rfc5545 */
export function calendarText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,');
}
export function foldCalendarLine(value: string): string {
  const encoder = new TextEncoder();
  let line = '',
    bytes = 0;
  const lines: string[] = [];
  for (const char of value) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) {
      lines.push(line);
      line = ' ';
      bytes = 1;
    }
    line += char;
    bytes += size;
  }
  lines.push(line);
  return lines.join('\r\n');
}
export function practiceCalendar(
  input: { assignmentId: string; date: string; origin: string },
  now = new Date(),
): string {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(input.assignmentId))
    throw new Error('Invalid assignment identifier.');
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(input.date))
    throw new Error('Choose a valid date between 2000 and 2099.');
  const day = new Date(`${input.date}T00:00:00.000Z`);
  if (
    !Number.isFinite(day.getTime()) ||
    day.toISOString().slice(0, 10) !== input.date
  )
    throw new Error('Choose a valid calendar date.');
  const origin = new URL(input.origin);
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.origin !== input.origin
  )
    throw new Error('Invalid application origin.');
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid export time.');
  const next = new Date(day.getTime() + 86400000)
    .toISOString()
    .slice(0, 10)
    .replaceAll('-', '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ConsultIQ//Practice reminder//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${input.assignmentId}@${origin.host}`,
    `DTSTAMP:${now
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z')}`,
    `DTSTART;VALUE=DATE:${input.date.replaceAll('-', '')}`,
    `DTEND;VALUE=DATE:${next}`,
    'SUMMARY:ConsultIQ practice review',
    `DESCRIPTION:${calendarText('Open ConsultIQ and select your workspace and practice assignment. This reminder contains no consultation content.')}`,
    `URL:${origin.origin}/workspace`,
    'CLASS:PRIVATE',
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldCalendarLine).join('\r\n') + '\r\n';
}
