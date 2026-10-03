import type { AssessmentContent } from './assessment.ts';
import { normalizeQuote, type EvidenceInput } from './evidence.ts';

type SavedDimension = AssessmentContent['dimensions'][number];
export type AssessmentDraftEntry = {
  dimension: number;
  score: number | null;
  rationale: string;
  coaching_note: string;
  turn_index: number;
  span: string;
  additional_evidence: EvidenceInput[];
};

export function createAssessmentDraftEntry(
  dimension: number,
  existing?: SavedDimension,
): AssessmentDraftEntry {
  return {
    dimension,
    score: existing?.score ?? null,
    rationale: existing?.rationale ?? '',
    coaching_note: existing?.coaching_note ?? '',
    turn_index: existing?.evidence[0]?.turn_index ?? 0,
    span: existing?.evidence[0]?.span ?? '',
    additional_evidence:
      existing?.evidence
        .slice(1)
        .map(({ turn_index, span }) => ({ turn_index, span })) ?? [],
  };
}

export function assessmentDraftEntryReady(entry: AssessmentDraftEntry) {
  return (
    entry.rationale.trim().length >= 3 &&
    (entry.score === null ||
      entry.span.trim().length >= 8 ||
      entry.additional_evidence.some((item) => item.span.trim().length >= 8))
  );
}

/** Retained quotes remain explicit inputs: only the server may validate them. */
export function buildAssessmentDimensions(entries: AssessmentDraftEntry[]) {
  return entries.map((entry) => {
    const seen = new Set<string>();
    const evidence = [
      ...(entry.span.trim()
        ? [{ turn_index: entry.turn_index, span: entry.span }]
        : []),
      ...entry.additional_evidence,
    ]
      .filter((item) => {
        const key = JSON.stringify([
          item.turn_index,
          normalizeQuote(item.span),
        ]);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(({ turn_index, span }) => ({ turn_index, span }));
    return {
      dimension: entry.dimension,
      score: entry.score,
      rationale: entry.rationale,
      coaching_note: entry.coaching_note,
      evidence,
    };
  });
}
