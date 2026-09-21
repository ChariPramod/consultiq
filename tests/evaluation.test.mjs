import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { evaluateAssessmentDataset } from '../lib/evaluation.ts';

// Engineering values test arithmetic and validation, never domain rubric quality.
function dataset() {
  return {
    schema_version: 1,
    metadata: {
      dataset_version: 'engineering-v1',
      rubric_version: 'not-a-domain-rubric',
      prompt_version: 'test-v1',
      model_version: 'stub',
      reference_version: 'test-v1',
      reference_source: 'synthetic_engineering',
      split: 'development',
    },
    cases: [
      {
        id: 'case-1',
        turns: [
          {
            role: 'Coordinator',
            text: 'This is an engineering test sentence.',
          },
          {
            role: 'Patient',
            text: 'This is a synthetic response for testing.',
          },
        ],
        prediction: Array.from({ length: 8 }, (_, dimension) => ({
          dimension,
          score: null,
          rationale: 'Engineering test only.',
          coaching_note: '',
          evidence: [],
        })),
        reference: Array.from({ length: 8 }, (_, dimension) => ({
          dimension,
          score: null,
        })),
      },
    ],
  };
}
function score(input, dimension, predicted, reference) {
  input.cases[0].prediction[dimension].score = predicted;
  input.cases[0].prediction[dimension].evidence = [
    { turn_index: 0, span: 'engineering test sentence' },
  ];
  input.cases[0].reference[dimension].score = reference;
}
test('numeric agreement excludes abstentions and reports support disagreement separately', () => {
  const input = dataset();
  score(input, 0, 3, 5);
  score(input, 1, 4, 4);
  score(input, 2, 2, null);
  score(input, 3, null, 3);
  const { overall } = evaluateAssessmentDataset(input);
  assert.equal(overall.mean_absolute_error, 1);
  assert.equal(overall.exact_numeric_match_rate, 0.5);
  assert.equal(overall.mutually_scored, 2);
  assert.equal(overall.prediction_coverage, 3 / 8);
  assert.equal(overall.prediction_abstained_reference_scored, 1);
  assert.equal(overall.prediction_scored_reference_abstained, 1);
  assert.equal(overall.both_abstained, 4);
});
test('no mutually scored dimensions means null numeric metrics, never perfect agreement', () => {
  const { overall } = evaluateAssessmentDataset(dataset());
  assert.equal(overall.mean_absolute_error, null);
  assert.equal(overall.exact_numeric_match_rate, null);
  assert.equal(overall.exact_numeric_matches, 0);
  assert.equal(overall.both_abstained, 8);
});
test('evaluates deployed quote validation, counting a forged quote as abstention', () => {
  const input = dataset();
  score(input, 0, 5, 5);
  input.cases[0].prediction[0].evidence[0].span =
    'A fabricated quote that is absent.';
  const report = evaluateAssessmentDataset(input);
  assert.equal(report.rejected_evidence_spans, 1);
  assert.equal(report.numeric_predictions_suppressed, 1);
  assert.equal(report.overall.prediction_abstained_reference_scored, 1);
  assert.equal(report.overall.mean_absolute_error, null);
});
test('malformed predictions, references, duplicate cases and turns fail closed', () => {
  for (const mutate of [
    (input) => {
      input.cases[0].prediction[0].score = 6;
    },
    (input) => {
      input.cases[0].reference[0].score = 0;
    },
    (input) => {
      input.cases[0].reference[1].dimension = 0;
    },
    (input) => {
      input.cases.push(structuredClone(input.cases[0]));
    },
    (input) => {
      input.cases[0].turns[0].role = 'Unknown';
    },
    (input) => {
      input.cases[0].turns[0].text = '\nPatient: Injected turn';
    },
  ]) {
    const input = dataset();
    mutate(input);
    assert.throws(
      () => evaluateAssessmentDataset(input),
      /Invalid evaluation case/,
    );
  }
  assert.throws(
    () => evaluateAssessmentDataset({ ...dataset(), cases: [] }),
    /non-empty/,
  );
});
test('report is deterministic aggregate output without case identifiers or raw content', () => {
  const input = dataset();
  input.cases[0].id = 'private-case-identity';
  input.cases[0].prediction[0].coaching_note = 'Private coaching content';
  const report = evaluateAssessmentDataset(input);
  assert.deepEqual(report, evaluateAssessmentDataset(structuredClone(input)));
  const output = JSON.stringify(report);
  for (const text of [
    'private-case-identity',
    'Private coaching content',
    input.cases[0].turns[0].text,
    'Engineering test only.',
  ])
    assert.equal(output.includes(text), false);
});
test('CLI writes a hash-bound report, refuses overwrite and suppresses malformed input content', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'consultiq-evaluation-'));
  try {
    const input = join(dir, 'input.json');
    const output = join(dir, 'report.json');
    await writeFile(input, JSON.stringify(dataset()));
    const run = () =>
      spawnSync(
        process.execPath,
        ['--experimental-strip-types', 'scripts/evaluate.mjs', input, output],
        { encoding: 'utf8' },
      );
    assert.equal(run().status, 0);
    const report = JSON.parse(await readFile(output, 'utf8'));
    assert.match(report.input_sha256, /^[a-f0-9]{64}$/);
    assert.equal(run().status, 1);
    await writeFile(input, 'PRIVATE_INVALID_JSON');
    const invalid = run();
    assert.equal(invalid.status, 1);
    assert.equal(invalid.stderr.includes('PRIVATE_INVALID_JSON'), false);
    assert.equal(
      JSON.parse(await readFile(output, 'utf8')).input_sha256,
      report.input_sha256,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
