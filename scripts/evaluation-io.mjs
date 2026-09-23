import { readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
export async function runEvaluation(argumentCount, evaluate, usage) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== argumentCount) throw new Error(`Usage: ${usage}`);
    const values = [];
    const hashes = [];
    for (const path of args.slice(0, -1)) {
      const info = await stat(path);
      if (!info.isFile() || info.size > 25 * 1024 * 1024)
        throw new Error('Input must be a JSON file no larger than 25 MiB.');
      const bytes = await readFile(path);
      try {
        values.push(JSON.parse(bytes.toString('utf8')));
      } catch {
        throw new Error('Input is not valid JSON.');
      }
      hashes.push(createHash('sha256').update(bytes).digest('hex'));
    }
    const report = { ...(await evaluate(values)), input_sha256: hashes };
    await writeFile(args.at(-1), `${JSON.stringify(report, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
    process.stdout.write(
      'Aggregate evaluation report written. No provider calls made.\n',
    );
    if (report.passed === false) process.exitCode = 2;
  } catch (error) {
    process.stderr.write(
      error && typeof error === 'object' && 'code' in error
        ? 'Could not read input or create a new output file.\n'
        : error instanceof Error
          ? `${error.message}\n`
          : 'Evaluation failed.\n',
    );
    process.exitCode = 1;
  }
}
