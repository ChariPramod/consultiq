import { evaluateRetrievalDataset } from '../lib/retrieval-evaluation.ts';
import { runEvaluation } from './evaluation-io.mjs';
await runEvaluation(
  2,
  async ([input]) => evaluateRetrievalDataset(input),
  'INPUT.json OUTPUT.json',
);
