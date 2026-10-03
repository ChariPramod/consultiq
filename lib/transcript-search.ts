import type { Turn } from './product.ts';
/** Literal Unicode-aware case-insensitive search. Offsets refer to original text. */
export function transcriptMatches(
  text: string,
  query: string,
): { start: number; end: number }[] {
  const needle = query.trim();
  if (!needle || needle.length > 200) return [];
  const pattern = new RegExp(
    needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    'giu',
  );
  return [...text.matchAll(pattern)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}
export function matchingTurns(
  turns: Turn[],
  query: string,
  role: 'all' | Turn['role'],
) {
  if (!query.trim()) return [];
  return turns.flatMap((turn, index) =>
    (role === 'all' || role === turn.role) &&
    transcriptMatches(turn.text, query).length
      ? [index]
      : [],
  );
}
