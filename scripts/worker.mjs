import { createDatabase } from '../server/database.ts';
import { processNextJob } from '../server/queue.ts';
// Run in a supervised process or invoke once from a scheduler. Never runs inside a client request.
let stopping = false;
process.on('SIGTERM', () => {
  stopping = true;
});
process.on('SIGINT', () => {
  stopping = true;
});
const once = process.argv.includes('--once');
do {
  let db;
  try {
    db = await createDatabase(process.env);
    const result = await processNextJob(db, process.env);
    console.log(
      JSON.stringify({ event: 'worker_tick', processed: result.processed }),
    );
  } catch {
    console.error(JSON.stringify({ event: 'worker_tick_failed' }));
    if (once) process.exitCode = 1;
  } finally {
    try {
      db?.close();
    } catch {
      /* No secrets in logs. */
    }
  }
  if (!once && !stopping)
    await new Promise((resolve) => setTimeout(resolve, 5000));
} while (!once && !stopping);
