import { prepareAssessment } from './assessment.ts';
import { DIMENSIONS, parseTurns } from './product.ts';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an object.');
  return value as Record<string, unknown>;
}
function identifier(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(value)
  )
    throw new Error('Use an opaque version identifier.');
  return value;
}
function references(value: unknown): (number | null)[] {
  if (!Array.isArray(value) || value.length !== DIMENSIONS.length)
    throw new Error('Provide every reference dimension.');
  const scores: (number | null)[] = Array(DIMENSIONS.length).fill(null);
  const seen = new Set<number>();
  for (const raw of value) {
    const entry = record(raw);
    const dimension = entry.dimension;
    const score = entry.score;
    if (
      typeof dimension !== 'number' ||
      !Number.isInteger(dimension) ||
      dimension < 0 ||
      dimension >= DIMENSIONS.length ||
      seen.has(dimension)
    )
      throw new Error('Invalid reference dimension.');
    if (
      score !== null &&
      (typeof score !== 'number' ||
        !Number.isInteger(score) ||
        score < 1 ||
        score > 5)
    )
      throw new Error('Invalid reference score.');
    seen.add(dimension);
    scores[dimension] = score as number | null;
  }
  return scores;
}
function counters() {
  return {
    total: 0,
    prediction_scored: 0,
    reference_scored: 0,
    mutually_scored: 0,
    prediction_abstained_reference_scored: 0,
    prediction_scored_reference_abstained: 0,
    both_abstained: 0,
    exact_numeric_matches: 0,
    absolute_error_sum: 0,
  };
}
type Counts = ReturnType<typeof counters>;
function count(
  counts: Counts,
  prediction: number | null,
  reference: number | null,
) {
  counts.total++;
  if (prediction !== null) counts.prediction_scored++;
  if (reference !== null) counts.reference_scored++;
  if (prediction !== null && reference !== null) {
    counts.mutually_scored++;
    counts.absolute_error_sum += Math.abs(prediction - reference);
    if (prediction === reference) counts.exact_numeric_matches++;
  } else if (prediction === null && reference !== null)
    counts.prediction_abstained_reference_scored++;
  else if (prediction !== null) counts.prediction_scored_reference_abstained++;
  else counts.both_abstained++;
}
function metrics(counts: Counts) {
  return {
    ...counts,
    prediction_coverage: counts.total
      ? counts.prediction_scored / counts.total
      : null,
    reference_coverage: counts.total
      ? counts.reference_scored / counts.total
      : null,
    mean_absolute_error: counts.mutually_scored
      ? counts.absolute_error_sum / counts.mutually_scored
      : null,
    exact_numeric_match_rate: counts.mutually_scored
      ? counts.exact_numeric_matches / counts.mutually_scored
      : null,
  };
}

/** Offline only: never reads a workspace or invokes a provider. */
export function evaluateAssessmentDataset(value: unknown) {
  const dataset = record(value);
  if (dataset.schema_version !== 1)
    throw new Error('Unsupported evaluation schema version.');
  const metadata = record(dataset.metadata);
  const versions = {
    dataset_version: identifier(metadata.dataset_version),
    rubric_version: identifier(metadata.rubric_version),
    prompt_version: identifier(metadata.prompt_version),
    model_version: identifier(metadata.model_version),
    reference_version: identifier(metadata.reference_version),
  };
  if (
    metadata.reference_source !== 'independent_human' &&
    metadata.reference_source !== 'synthetic_engineering'
  )
    throw new Error('Declare the reference source.');
  if (metadata.split !== 'development' && metadata.split !== 'held_out')
    throw new Error('Declare development or held_out split.');
  if (
    !Array.isArray(dataset.cases) ||
    dataset.cases.length < 1 ||
    dataset.cases.length > 10000
  )
    throw new Error('Provide a bounded, non-empty case list.');
  const overall = counters();
  const dimensions = DIMENSIONS.map(() => counters());
  const ids = new Set<string>();
  let rejectedEvidenceSpans = 0;
  let numericPredictionsSuppressed = 0;
  for (const [index, raw] of dataset.cases.entries()) {
    try {
      const item = record(raw);
      const id = identifier(item.id);
      if (ids.has(id)) throw new Error('Duplicate case.');
      ids.add(id);
      if (!Array.isArray(item.turns) || item.turns.length > 1000)
        throw new Error('Invalid turns.');
      const transcript = item.turns
        .map((rawTurn) => {
          const turn = record(rawTurn);
          if (
            (turn.role !== 'Coordinator' && turn.role !== 'Patient') ||
            typeof turn.text !== 'string' ||
            /[\r\n]/.test(turn.text)
          )
            throw new Error('Invalid turn.');
          return `${turn.role}: ${turn.text}`;
        })
        .join('\n');
      const turns = parseTurns(transcript);
      const reference = references(item.reference);
      const prepared = prepareAssessment(turns, item.prediction);
      rejectedEvidenceSpans += prepared.rejections.length;
      const prediction = item.prediction as {
        dimension: number;
        score: number | null;
      }[];
      numericPredictionsSuppressed += prediction.filter(
        (p) =>
          p.score !== null && prepared.dimensions[p.dimension].score === null,
      ).length;
      for (const assessment of prepared.dimensions) {
        count(overall, assessment.score, reference[assessment.dimension]);
        count(
          dimensions[assessment.dimension],
          assessment.score,
          reference[assessment.dimension],
        );
      }
    } catch {
      // Error messages never echo record identifiers, transcripts or model output.
      throw new Error(
        `Invalid evaluation case at index ${index}. Check the documented contract.`,
      );
    }
  }
  return {
    report_schema_version: 1,
    evaluator_version: 'assessment-offline/v1',
    metadata: {
      ...versions,
      reference_source: metadata.reference_source,
      split: metadata.split,
    },
    case_count: dataset.cases.length,
    rejected_evidence_spans: rejectedEvidenceSpans,
    numeric_predictions_suppressed: numericPredictionsSuppressed,
    overall: metrics(overall),
    dimensions: dimensions.map((counts, dimension) => ({
      dimension,
      ...metrics(counts),
    })),
  };
}
