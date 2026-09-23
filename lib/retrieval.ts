/** Shared production lexical retrieval policy. Candidates must already be workspace-scoped. */
export function retrievalTokens(query: string): string[] {
  const stop = new Set([
    'the',
    'and',
    'for',
    'with',
    'this',
    'that',
    'what',
    'how',
    'can',
    'should',
    'our',
    'about',
    'from',
    'have',
    'into',
    'when',
    'would',
    'could',
  ]);
  return [...new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])]
    .filter((token) => !stop.has(token))
    .slice(0, 12);
}
export function rankRetrievedChunks<
  T extends { chunk_id: string; body: string },
>(rows: T[], tokens: string[]) {
  return rows
    .map((row) => ({
      ...row,
      relevance: tokens.filter((token) =>
        row.body.toLowerCase().includes(token),
      ).length,
    }))
    .filter((row) => row.relevance > 0)
    .sort(
      (a, b) =>
        b.relevance - a.relevance || a.chunk_id.localeCompare(b.chunk_id),
    )
    .slice(0, 5);
}
