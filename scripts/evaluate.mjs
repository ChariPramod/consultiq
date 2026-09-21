import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { evaluateAssessmentDataset } from '../lib/evaluation.ts';

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2)
    throw new Error(
      'Usage: node --experimental-strip-types scripts/evaluate.mjs INPUT.json OUTPUT.json',
    );
  const [inputPath, outputPath] = args;
  const inputStat = await stat(inputPath);
  if (!inputStat.isFile() || inputStat.size > 25 * 1024 * 1024)
    throw new Error('Input must be a JSON file no larger than 25 MiB.');
  const bytes = await readFile(inputPath);
  let input;
  try {
    input = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('Input is not valid JSON.');
  }
  const report = {
    ...evaluateAssessmentDataset(input),
    input_sha256: createHash('sha256').update(bytes).digest('hex'),
  };
  // Refuse overwrite, including accidental replacement of the input dataset.
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
  process.stdout.write(
    'Evaluation report written. No provider calls were made.\n',
  );
}
main().catch((error) => {
  const message =
    error && typeof error === 'object' && 'code' in error
      ? 'Could not read the input or create a new output file. Check paths and permissions.'
      : error instanceof Error
        ? error.message
        : 'Evaluation failed.';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
