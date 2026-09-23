import { createHash } from 'node:crypto';
import { evaluateAssessmentDataset } from './evaluation.ts';

export type AssessmentGatePolicy = {
  schema_version: 1;
  purpose: 'engineering' | 'release';
  minimum_cases: number;
  minimum_mutually_scored_per_dimension: number;
  maximum_mean_absolute_error: number;
  minimum_reference_score_recall: number;
  maximum_unsupported_scoring_rate: number;
  maximum_mae_regression: number;
  maximum_recall_regression: number;
};
function policyValue(value: unknown): AssessmentGatePolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid gate policy.');
  const p = value as AssessmentGatePolicy;
  const fields = [
    'schema_version',
    'purpose',
    'minimum_cases',
    'minimum_mutually_scored_per_dimension',
    'maximum_mean_absolute_error',
    'minimum_reference_score_recall',
    'maximum_unsupported_scoring_rate',
    'maximum_mae_regression',
    'maximum_recall_regression',
  ];
  if (
    Object.keys(p).length !== fields.length ||
    Object.keys(p).some((key) => !fields.includes(key)) ||
    p.schema_version !== 1 ||
    !['engineering', 'release'].includes(p.purpose)
  )
    throw new Error('Invalid gate policy.');
  for (const key of fields.slice(2) as (keyof AssessmentGatePolicy)[]) {
    const n = p[key];
    const max =
      key.includes('mae') || key === 'maximum_mean_absolute_error'
        ? 4
        : key.startsWith('minimum_') && !key.includes('recall')
          ? 100000
          : 1;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > max)
      throw new Error('Invalid gate threshold.');
  }
  if (
    !Number.isInteger(p.minimum_cases) ||
    p.minimum_cases < 1 ||
    !Number.isInteger(p.minimum_mutually_scored_per_dimension) ||
    p.minimum_mutually_scored_per_dimension < 1
  )
    throw new Error('Positive integer sample minima required.');
  return p;
}
// Inputs are validated before fingerprinting. Exclude predictions and candidate model/prompt metadata.
function fingerprint(value: unknown) {
  const input = value as {
    cases: {
      id: string;
      turns: { role: string; text: string }[];
      reference: { dimension: number; score: number | null }[];
    }[];
  };
  const frozen = input.cases
    .map((c) => ({
      id: c.id,
      turns: c.turns.map((turn) => ({ role: turn.role, text: turn.text })),
      reference: c.reference
        .map((reference) => ({
          dimension: reference.dimension,
          score: reference.score,
        }))
        .sort((a, b) => a.dimension - b.dimension),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return createHash('sha256').update(JSON.stringify(frozen)).digest('hex');
}
/** Recompute from raw datasets; never trust hand-edited aggregate baseline reports. */
export function gateAssessmentRelease(
  candidate: unknown,
  baseline: unknown,
  policy: unknown,
) {
  const p = policyValue(policy);
  const current = evaluateAssessmentDataset(candidate);
  const previous = evaluateAssessmentDataset(baseline);
  const reasons: string[] = [];
  for (const key of [
    'dataset_version',
    'reference_version',
    'rubric_version',
    'reference_source',
    'split',
  ] as const)
    if (current.metadata[key] !== previous.metadata[key])
      reasons.push(`incompatible_${key}`);
  const frozenHash = fingerprint(candidate);
  if (frozenHash !== fingerprint(baseline))
    reasons.push('incompatible_cases_or_references');
  if (
    p.purpose === 'release' &&
    (current.metadata.reference_source !== 'independent_human' ||
      current.metadata.split !== 'held_out')
  )
    reasons.push('release_requires_independent_held_out_references');
  if (current.case_count < p.minimum_cases) reasons.push('insufficient_cases');
  for (const [i, metric] of current.dimensions.entries()) {
    const old = previous.dimensions[i];
    const prefix = `dimension_${i}_`;
    if (
      metric.mutually_scored < p.minimum_mutually_scored_per_dimension ||
      old.mutually_scored < p.minimum_mutually_scored_per_dimension
    )
      reasons.push(prefix + 'insufficient_numeric_pairs');
    if (metric.mean_absolute_error === null || old.mean_absolute_error === null)
      reasons.push(prefix + 'missing_numeric_denominator');
    else {
      if (metric.mean_absolute_error > p.maximum_mean_absolute_error)
        reasons.push(prefix + 'absolute_error');
      if (
        metric.mean_absolute_error - old.mean_absolute_error >
        p.maximum_mae_regression
      )
        reasons.push(prefix + 'error_regression');
    }
    const recall = metric.reference_scored
      ? metric.mutually_scored / metric.reference_scored
      : null;
    const oldRecall = old.reference_scored
      ? old.mutually_scored / old.reference_scored
      : null;
    if (recall === null || oldRecall === null)
      reasons.push(prefix + 'missing_reference_denominator');
    else {
      if (recall < p.minimum_reference_score_recall)
        reasons.push(prefix + 'reference_score_recall');
      if (oldRecall - recall > p.maximum_recall_regression)
        reasons.push(prefix + 'recall_regression');
    }
    // Rate per opportunity includes numeric predictions where reference abstains.
    if (
      metric.prediction_scored_reference_abstained / metric.total >
      p.maximum_unsupported_scoring_rate
    )
      reasons.push(prefix + 'unsupported_scoring');
  }
  return {
    report_schema_version: 1,
    evaluator_version: 'assessment-gate/v1',
    passed: reasons.length === 0,
    purpose: p.purpose,
    frozen_cases_sha256: frozenHash,
    policy: p,
    reasons,
    candidate: current,
    baseline: previous,
  };
}
