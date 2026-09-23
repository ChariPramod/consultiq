import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gateAssessmentRelease } from '../lib/evaluation-gate.ts';
import { evaluateRetrievalDataset } from '../lib/retrieval-evaluation.ts';
import { retrievalTokens, rankRetrievedChunks } from '../lib/retrieval.ts';
const policy = {
  schema_version: 1,
  purpose: 'engineering',
  minimum_cases: 1,
  minimum_mutually_scored_per_dimension: 1,
  maximum_mean_absolute_error: 0,
  minimum_reference_score_recall: 1,
  maximum_unsupported_scoring_rate: 0,
  maximum_mae_regression: 0,
  maximum_recall_regression: 0,
};
async function assessment() {
  const input = JSON.parse(
    await readFile('fixtures/evaluation/synthetic-engineering.json', 'utf8'),
  );
  input.cases = [input.cases[0]];
  for (const item of input.cases) {
    item.reference = Array.from({ length: 8 }, (_, dimension) => ({
      dimension,
      score: 3,
    }));
    item.prediction = item.reference.map((r) => ({
      ...r,
      rationale: 'Engineering only.',
      coaching_note: '',
      evidence: [{ turn_index: 0, span: item.turns[0].text }],
    }));
  }
  return input;
}
function retrieval() {
  return {
    schema_version: 1,
    metadata: {
      dataset_version: 'test-v1',
      reference_version: 'test-v1',
      reference_source: 'synthetic_engineering',
      split: 'development',
    },
    chunks: [
      { chunk_id: 'a', body: 'budget planning' },
      { chunk_id: 'b', body: 'scheduling visits' },
    ],
    queries: [
      {
        id: 'private-query',
        text: 'budget',
        judgments: [
          { chunk_id: 'a', grade: 3 },
          { chunk_id: 'b', grade: 0 },
        ],
      },
    ],
  };
}
test('gate recomputes baseline and candidate, checks each dimension and rejects missing denominators', async () => {
  const baseline = await assessment();
  assert.equal(gateAssessmentRelease(baseline, baseline, policy).passed, true);
  const candidate = structuredClone(baseline);
  candidate.cases[0].prediction[0].score = 5;
  const result = gateAssessmentRelease(candidate, baseline, policy);
  assert.equal(result.passed, false);
  assert.ok(result.reasons.includes('dimension_0_error_regression'));
  candidate.cases[0].prediction[0].score = null;
  const missing = gateAssessmentRelease(candidate, baseline, policy);
  assert.ok(
    missing.reasons.includes('dimension_0_missing_numeric_denominator'),
  );
  assert.ok(missing.reasons.includes('dimension_0_recall_regression'));
});
test('gate rejects silently changed reference data, rubric, split, duplicate cases and invalid thresholds', async () => {
  const baseline = await assessment();
  for (const mutate of [
    (d) => {
      d.cases[0].reference[0].score = 4;
    },
    (d) => {
      d.cases[0].turns[1].text += ' Extra text.';
    },
    (d) => {
      d.metadata.rubric_version = 'different';
    },
    (d) => {
      d.metadata.split = 'held_out';
    },
  ]) {
    const candidate = structuredClone(baseline);
    mutate(candidate);
    assert.equal(
      gateAssessmentRelease(candidate, baseline, policy).passed,
      false,
    );
  }
  for (const patch of [
    { minimum_cases: 0 },
    { maximum_mae_regression: NaN },
    { extra: 1 },
    { minimum_reference_score_recall: 2 },
  ])
    assert.throws(() =>
      gateAssessmentRelease(baseline, baseline, { ...policy, ...patch }),
    );
  const release = gateAssessmentRelease(baseline, baseline, {
    ...policy,
    purpose: 'release',
  });
  assert.ok(
    release.reasons.includes(
      'release_requires_independent_held_out_references',
    ),
  );
});
test('candidate model and prompt may differ while frozen references remain identical', async () => {
  const baseline = await assessment();
  const candidate = structuredClone(baseline);
  candidate.metadata.prompt_version = 'new';
  candidate.metadata.model_version = 'new';
  assert.equal(gateAssessmentRelease(candidate, baseline, policy).passed, true);
  assert.equal(
    JSON.stringify(gateAssessmentRelease(candidate, baseline, policy)).includes(
      candidate.cases[0].turns[0].text,
    ),
    false,
  );
});
test('retrieval measures graded ranking and no-answer false positives without leaking text', () => {
  const input = retrieval();
  const report = evaluateRetrievalDataset(input);
  assert.equal(report.recall_at_5, 1);
  assert.equal(report.precision_at_5, 0.2);
  assert.equal(report.ndcg_at_5, 1);
  assert.equal(report.mrr_at_5, 1);
  assert.equal(report.no_answer_false_positive_rate, null);
  input.queries[0].judgments[0].grade = 0;
  const negative = evaluateRetrievalDataset(input);
  assert.equal(negative.recall_at_5, null);
  assert.equal(negative.no_answer_false_positive_rate, 1);
  assert.equal(JSON.stringify(report).includes('private-query'), false);
  assert.equal(JSON.stringify(report).includes('budget'), false);
});
test('retrieval requires complete unique judgments; tokenless answerable queries count as misses', () => {
  for (const mutate of [
    (d) => d.queries[0].judgments.pop(),
    (d) => {
      d.queries[0].judgments[1].chunk_id = 'a';
    },
    (d) => {
      d.queries[0].judgments[0].grade = 4;
    },
    (d) => d.queries.push(structuredClone(d.queries[0])),
  ]) {
    const input = retrieval();
    mutate(input);
    assert.throws(() => evaluateRetrievalDataset(input));
  }
  const input = retrieval();
  input.queries[0].text = 'the and';
  const report = evaluateRetrievalDataset(input);
  assert.equal(report.recall_at_5, 0);
  assert.equal(report.ndcg_at_5, 0);
  assert.equal(report.empty_result_queries, 1);
  assert.deepEqual(retrievalTokens('the budget BUDGET for visits'), [
    'budget',
    'visits',
  ]);
});
test('retrieval reproduces production candidate cap and stable tie ranking', () => {
  const input = retrieval();
  input.chunks = Array.from({ length: 121 }, (_, i) => ({
    chunk_id: `c${String(i).padStart(3, '0')}`,
    body: 'budget',
  }));
  input.queries[0].judgments = input.chunks.map((c, i) => ({
    chunk_id: c.chunk_id,
    grade: i === 120 ? 3 : 0,
  }));
  assert.equal(evaluateRetrievalDataset(input).recall_at_5, 0);
  assert.deepEqual(
    rankRetrievedChunks([...input.chunks].reverse(), ['budget']).map(
      (c) => c.chunk_id,
    ),
    ['c000', 'c001', 'c002', 'c003', 'c004'],
  );
});
test('gate CLI writes failed decisions with exit 2; invalid inputs and overwrites exit 1', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'consultiq-gate-'));
  try {
    const data = await assessment();
    const paths = ['candidate', 'baseline', 'policy', 'output'].map((p) =>
      join(dir, `${p}.json`),
    );
    await writeFile(paths[0], JSON.stringify(data));
    await writeFile(paths[1], JSON.stringify(data));
    await writeFile(
      paths[2],
      JSON.stringify({ ...policy, minimum_cases: 100 }),
    );
    const run = () =>
      spawnSync(
        process.execPath,
        ['--experimental-strip-types', 'scripts/evaluate-gate.mjs', ...paths],
        { encoding: 'utf8' },
      );
    assert.equal(run().status, 2);
    const result = JSON.parse(await readFile(paths[3], 'utf8'));
    assert.equal(result.passed, false);
    assert.equal(result.input_sha256.length, 3);
    assert.equal(run().status, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('retrieval candidate matching mirrors SQLite ASCII lower for Unicode text', () => {
  const input = retrieval();
  input.chunks[0].body = 'Kelvin';
  input.queries[0].text = 'kelvin';
  // SQLite lower() does not fold the Kelvin symbol; candidate filtering must agree.
  assert.equal(evaluateRetrievalDataset(input).recall_at_5, 0);
});

test('frozen case identity uses canonical declared fields, not object key insertion order', async () => {
  const baseline = await assessment();
  const candidate = structuredClone(baseline);
  candidate.cases[0].turns = candidate.cases[0].turns.map((t) => ({
    text: t.text,
    role: t.role,
  }));
  candidate.cases[0].reference = candidate.cases[0].reference
    .map((r) => ({ score: r.score, dimension: r.dimension }))
    .reverse();
  assert.equal(gateAssessmentRelease(candidate, baseline, policy).passed, true);
});

test('an all-abstaining pair cannot pass even a permissive numeric release policy', async () => {
  const input = await assessment();
  input.metadata.reference_source = 'independent_human';
  input.metadata.split = 'held_out';
  for (const d of input.cases[0].prediction) d.score = null;
  for (const d of input.cases[0].reference) d.score = null;
  const result = gateAssessmentRelease(input, input, {
    ...policy,
    purpose: 'release',
    maximum_mean_absolute_error: 4,
    maximum_mae_regression: 4,
    minimum_reference_score_recall: 0,
    maximum_recall_regression: 1,
    maximum_unsupported_scoring_rate: 1,
  });
  assert.equal(result.passed, false);
  assert.ok(
    result.reasons.includes('dimension_7_missing_reference_denominator'),
  );
  assert.ok(result.reasons.includes('dimension_0_insufficient_numeric_pairs'));
});
