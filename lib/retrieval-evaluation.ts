import { rankRetrievedChunks, retrievalTokens } from './retrieval.ts';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected evaluation object.');
  return value as Record<string, unknown>;
}
function opaque(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(value)
  )
    throw new Error('Invalid opaque identifier.');
  return value;
}
/** Fully judged corpus; never infer that an unjudged passage is irrelevant. */
export function evaluateRetrievalDataset(value: unknown) {
  const input = object(value);
  if (input.schema_version !== 1)
    throw new Error('Unsupported retrieval dataset.');
  const metadata = object(input.metadata);
  const versions = {
    dataset_version: opaque(metadata.dataset_version),
    reference_version: opaque(metadata.reference_version),
  };
  if (
    !['independent_human', 'synthetic_engineering'].includes(
      String(metadata.reference_source),
    ) ||
    !['development', 'held_out'].includes(String(metadata.split))
  )
    throw new Error('Declare reference provenance and split.');
  if (
    !Array.isArray(input.chunks) ||
    !input.chunks.length ||
    input.chunks.length > 10000 ||
    !Array.isArray(input.queries) ||
    !input.queries.length ||
    input.queries.length > 1000
  )
    throw new Error('Provide bounded chunks and queries.');
  const ids = new Set<string>();
  const chunks = input.chunks
    .map((raw) => {
      const chunk = object(raw);
      const chunk_id = opaque(chunk.chunk_id);
      if (
        ids.has(chunk_id) ||
        typeof chunk.body !== 'string' ||
        !chunk.body.trim() ||
        chunk.body.length > 10000
      )
        throw new Error('Invalid or duplicate chunk.');
      ids.add(chunk_id);
      return { chunk_id, body: chunk.body };
    })
    .sort((a, b) =>
      a.chunk_id < b.chunk_id ? -1 : a.chunk_id > b.chunk_id ? 1 : 0,
    );
  const queryIds = new Set<string>();
  let answerable = 0,
    empty = 0,
    noAnswer = 0,
    falsePositive = 0,
    recall = 0,
    reciprocal = 0,
    ndcg = 0,
    precision = 0;
  for (const [index, raw] of input.queries.entries()) {
    try {
      const query = object(raw);
      const queryId = opaque(query.id);
      if (
        queryIds.has(queryId) ||
        typeof query.text !== 'string' ||
        !query.text.trim() ||
        query.text.length > 2000 ||
        !Array.isArray(query.judgments) ||
        query.judgments.length !== chunks.length
      )
        throw new Error();
      queryIds.add(queryId);
      const grades = new Map<string, number>();
      for (const rawGrade of query.judgments) {
        const judgment = object(rawGrade);
        const id = opaque(judgment.chunk_id);
        if (
          !ids.has(id) ||
          grades.has(id) ||
          typeof judgment.grade !== 'number' ||
          !Number.isInteger(judgment.grade) ||
          judgment.grade < 0 ||
          judgment.grade > 3
        )
          throw new Error();
        grades.set(id, judgment.grade);
      }
      const tokens = retrievalTokens(query.text);
      const candidates = chunks
        .filter((c) =>
          tokens.some((t) =>
            c.body
              .replace(/[A-Z]/g, (letter) => letter.toLowerCase())
              .includes(t),
          ),
        )
        .slice(0, 120);
      const results = rankRetrievedChunks(candidates, tokens);
      const relevant = [...grades.values()].filter((g) => g > 0).length;
      if (!results.length) empty++;
      if (!relevant) {
        noAnswer++;
        if (results.length) falsePositive++;
        continue;
      }
      answerable++;
      const retrievedGrades = results.map((r) => grades.get(r.chunk_id)!);
      const hits = retrievedGrades.filter((g) => g > 0).length;
      recall += hits / relevant;
      precision += hits / 5; // Missing slots are non-relevant, fixed production k.
      const first = retrievedGrades.findIndex((g) => g > 0);
      reciprocal += first < 0 ? 0 : 1 / (first + 1);
      const dcg = (values: number[]) =>
        values.reduce(
          (sum, grade, i) => sum + (2 ** grade - 1) / Math.log2(i + 2),
          0,
        );
      ndcg +=
        dcg(retrievedGrades) /
        dcg([...grades.values()].sort((a, b) => b - a).slice(0, 5));
    } catch {
      throw new Error(
        `Invalid retrieval query at index ${index}. Complete judgments are required.`,
      );
    }
  }
  return {
    report_schema_version: 1,
    evaluator_version: 'retrieval-offline/v1',
    metadata: {
      ...versions,
      reference_source: metadata.reference_source,
      split: metadata.split,
    },
    chunk_count: chunks.length,
    query_count: input.queries.length,
    answerable_queries: answerable,
    no_answer_queries: noAnswer,
    empty_result_queries: empty,
    false_positive_queries: falsePositive,
    recall_at_5: answerable ? recall / answerable : null,
    precision_at_5: answerable ? precision / answerable : null,
    mrr_at_5: answerable ? reciprocal / answerable : null,
    ndcg_at_5: answerable ? ndcg / answerable : null,
    no_answer_false_positive_rate: noAnswer ? falsePositive / noAnswer : null,
  };
}
