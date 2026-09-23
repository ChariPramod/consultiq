import { gateAssessmentRelease } from '../lib/evaluation-gate.ts';
import { runEvaluation } from './evaluation-io.mjs';
await runEvaluation(
  4,
  async ([candidate, baseline, policy]) =>
    gateAssessmentRelease(candidate, baseline, policy),
  'CANDIDATE.json BASELINE.json POLICY.json OUTPUT.json',
);
