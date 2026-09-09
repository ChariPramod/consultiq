export type EvidenceInput = { turn_index: number; span: string };
export type VerifiedEvidence = EvidenceInput & { validated: true };
export const normalizeQuote = (value: string) =>
  value
    .normalize('NFC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
export function validateEvidence(
  turns: { text: string }[],
  evidence: EvidenceInput[],
) {
  const valid: VerifiedEvidence[] = [];
  const rejected: { turn_index: number; reason: string }[] = [];
  for (const item of evidence) {
    const turn =
      Number.isInteger(item.turn_index) && item.turn_index >= 0
        ? turns[item.turn_index]
        : undefined;
    const span = typeof item.span === 'string' ? normalizeQuote(item.span) : '';
    const reason = !turn
      ? 'turn_not_found'
      : span.length < 8
        ? 'quote_too_short'
        : !normalizeQuote(turn.text).includes(span)
          ? 'quote_not_found'
          : null;
    if (reason) rejected.push({ turn_index: item.turn_index, reason });
    else
      valid.push({
        turn_index: item.turn_index,
        span: item.span.trim(),
        validated: true,
      });
  }
  return { valid, rejected };
}
