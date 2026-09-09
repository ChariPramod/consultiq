export const dimensions = [
  'Needs discovery',
  'Emotional acknowledgment',
  'Presentation clarity',
  'Price anchoring',
  'Objection response',
  'Call to action',
  'Social proof & reassurance',
  'Follow-up commitment',
] as const;
export type Outcome = 'Accepted' | 'Follow-up' | 'Not accepted' | 'Unscored';
export type Turn = {
  role: 'Coordinator' | 'Patient';
  text: string;
  time: string;
};
export type Consultation = {
  id: string;
  title: string;
  coordinator: string;
  initials: string;
  date: string;
  duration: number;
  outcome: Outcome;
  scores: number[];
  transcript: Turn[];
  source: 'Demo' | 'Session import';
  probability?: number;
};
export const coordinators = [
  'Sarah Mitchell',
  'James Chen',
  'Emily Rodriguez',
  'Michael Brooks',
];
const treatments = [
  'Full-arch dental implants',
  'Invisalign consultation',
  'Smile makeover',
  'Dental implant consultation',
  'Restorative treatment',
  'Porcelain veneers',
];
const profiles = [
  [5, 4, 5, 4, 3, 4, 4, 3],
  [4, 5, 4, 3, 4, 5, 4, 4],
  [4, 3, 4, 3, 2, 3, 4, 2],
  [5, 4, 4, 4, 4, 4, 3, 4],
  [3, 4, 3, 2, 3, 2, 3, 2],
  [4, 4, 5, 4, 4, 5, 4, 5],
];
const concerns = [
  'I am worried about the cost.',
  'I had a difficult experience with a dentist before.',
  'I need to talk it over with my partner.',
];
export const demoCalls: Consultation[] = Array.from({ length: 24 }, (_, i) => {
  const p = i % profiles.length;
  const coordinator = coordinators[i % 4];
  const outcome: Outcome = [0, 1, 3, 5].includes(p)
    ? 'Accepted'
    : p === 2
      ? 'Follow-up'
      : 'Not accepted';
  const transcript: Turn[] = [
    {
      role: 'Coordinator',
      time: '00:00',
      text: 'Before we talk about treatment, what would you most like to change about your smile?',
    },
    {
      role: 'Patient',
      time: '00:24',
      text: 'I want to feel comfortable smiling in photographs again.',
    },
    {
      role: 'Coordinator',
      time: '01:12',
      text: 'It sounds like this has affected your confidence. Thank you for sharing that with me.',
    },
    { role: 'Patient', time: '01:48', text: concerns[i % 3] },
    {
      role: 'Coordinator',
      time: '02:16',
      text:
        p === 4
          ? 'Let me explain the treatment options.'
          : 'That is completely understandable. Can you tell me more about what concerns you most?',
    },
    {
      role: 'Coordinator',
      time: '04:30',
      text: 'We would start with a scan, then plan the treatment together. How does that sound so far?',
    },
    {
      role: 'Patient',
      time: '05:12',
      text: 'That makes sense. What would the cost look like?',
    },
    {
      role: 'Coordinator',
      time: '06:40',
      text:
        p === 4
          ? 'The treatment is $4,800.'
          : 'The full plan is $4,800, including the follow-up visits. We can also walk through monthly payment options.',
    },
    {
      role: 'Patient',
      time: '07:28',
      text:
        p === 2 || p === 4
          ? 'I think I need more time to consider this.'
          : 'That sounds manageable. What happens next?',
    },
    {
      role: 'Coordinator',
      time: '08:04',
      text:
        p === 2 || p === 4
          ? 'Of course. Give us a call when you are ready.'
          : 'Would Tuesday at ten work for your planning visit? I will send you the details today.',
    },
    {
      role: 'Patient',
      time: '08:35',
      text:
        p === 2 || p === 4
          ? 'Okay, thank you for your time.'
          : 'Yes, Tuesday at ten works for me.',
    },
    {
      role: 'Coordinator',
      time: '09:00',
      text: 'You can ask us questions at any point. We will take this at your pace.',
    },
  ];
  return {
    id: `CQ-${1048 - i}`,
    title: treatments[p],
    coordinator,
    initials: coordinator
      .split(' ')
      .map((n) => n[0])
      .join(''),
    date: new Date(Date.UTC(2026, 8, 8 - i)).toISOString().slice(0, 10),
    duration: 600 + ((i * 137) % 740),
    outcome,
    scores: [...profiles[p]],
    transcript,
    source: 'Demo',
    probability: [82, 88, 54, 79, 36, 91][p],
  };
});
export function averageScore(call: Consultation): number | null {
  return call.scores.length
    ? call.scores.reduce((a, b) => a + b, 0) / call.scores.length
    : null;
}
export function summarize(calls: Consultation[]) {
  const scored = calls.filter((c) => c.scores.length);
  const known = calls.filter(
    (c) => c.outcome === 'Accepted' || c.outcome === 'Not accepted',
  );
  return {
    count: calls.length,
    score: scored.length
      ? scored.reduce((a, c) => a + averageScore(c)!, 0) / scored.length
      : null,
    acceptance: known.length
      ? (calls.filter((c) => c.outcome === 'Accepted').length / known.length) *
        100
      : null,
    needsReview: scored.filter((c) => c.scores.some((s) => s <= 2)).length,
  };
}
export function filterCalls(
  calls: Consultation[],
  query: string,
  coordinator = 'all',
  outcome = 'all',
) {
  const q = query.trim().toLowerCase();
  return calls.filter(
    (c) =>
      (coordinator === 'all' || c.coordinator === coordinator) &&
      (outcome === 'all' || c.outcome === outcome) &&
      `${c.id} ${c.title} ${c.coordinator}`.toLowerCase().includes(q),
  );
}
export function parseTranscript(raw: string): Turn[] {
  if (raw.length > 100000)
    throw new Error('Please use a transcript under 100,000 characters.');
  const lines = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length < 2)
    throw new Error('Add at least two speaker-labeled turns.');
  const turns = lines.map((line, i) => {
    const match = line.match(/^(Coordinator|Patient):\s*(.+)$/i);
    if (!match)
      throw new Error(
        `Line ${i + 1}: start each turn with Coordinator: or Patient:.`,
      );
    return {
      role:
        match[1].toLowerCase() === 'coordinator' ? 'Coordinator' : 'Patient',
      text: match[2],
      time: '',
    } as Turn;
  });
  if (new Set(turns.map((t) => t.role)).size !== 2)
    throw new Error('Include both Coordinator and Patient turns.');
  return turns;
}
export function csvExport(calls: Consultation[]): string {
  const cell = (v: string | number) =>
    `"${String(v)
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replaceAll('"', '""')}"`;
  return [
    [
      'ID',
      'Consultation',
      'Coordinator',
      'Date',
      'Outcome',
      'Rubric score',
      'Source',
    ],
    ...calls.map((c) => [
      c.id,
      c.title,
      c.coordinator,
      c.date,
      c.outcome,
      averageScore(c)?.toFixed(2) ?? '',
      c.source,
    ]),
  ]
    .map((r) => r.map(cell).join(','))
    .join('\r\n');
}
