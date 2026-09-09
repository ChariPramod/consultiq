import { validateEvidence, type EvidenceInput } from './evidence.ts';
export function prepareAssessment(turns: { text: string }[], input: unknown) {
  if (!Array.isArray(input) || input.length !== 8)
    throw new Error('Provide an assessment for every rubric dimension.');
  const seen = new Set<number>();
  const rejections: {
    dimension: number;
    turn_index: number;
    reason: string;
  }[] = [];
  const dimensions = input
    .map((raw: unknown) => {
      if (!raw || typeof raw !== 'object')
        throw new Error('Invalid dimension assessment.');
      const item = raw as Record<string, unknown>;
      if (
        typeof item.dimension !== 'number' ||
        !Number.isInteger(item.dimension) ||
        item.dimension < 0 ||
        item.dimension > 7 ||
        seen.has(item.dimension)
      )
        throw new Error('Invalid or duplicate rubric dimension.');
      seen.add(item.dimension);
      if (
        item.score !== null &&
        (typeof item.score !== 'number' ||
          !Number.isInteger(item.score) ||
          item.score < 1 ||
          item.score > 5)
      )
        throw new Error(
          'Scores must be whole numbers from one to five, or null.',
        );
      if (
        typeof item.rationale !== 'string' ||
        item.rationale.trim().length < 3 ||
        item.rationale.length > 2000
      )
        throw new Error('Each dimension needs a rationale.');
      if (
        typeof item.coaching_note !== 'string' ||
        item.coaching_note.length > 2000
      )
        throw new Error('Invalid coaching note.');
      if (!Array.isArray(item.evidence) || item.evidence.length > 8)
        throw new Error('Provide a bounded evidence list.');
      for (const e of item.evidence)
        if (
          !e ||
          typeof e !== 'object' ||
          typeof e.turn_index !== 'number' ||
          typeof e.span !== 'string' ||
          e.span.length > 6000
        )
          throw new Error('Invalid evidence span.');
      const result = validateEvidence(turns, item.evidence as EvidenceInput[]);
      for (const rejected of result.rejected)
        rejections.push({ dimension: item.dimension, ...rejected });
      const supported = result.valid.length > 0 && item.score !== null;
      return {
        dimension: item.dimension,
        score: supported ? (item.score as number) : null,
        rationale: item.rationale.trim(),
        coaching_note: item.coaching_note.trim(),
        evidence: result.valid,
        unsupported: !supported,
      };
    })
    .sort((a, b) => a.dimension - b.dimension);
  const supported = dimensions.filter((d) => d.score !== null);
  return {
    dimensions,
    rejections,
    supported_count: supported.length,
    average: supported.length
      ? supported.reduce((s, d) => s + d.score!, 0) / supported.length
      : null,
  };
}
export type AssessmentContent = ReturnType<typeof prepareAssessment>;
