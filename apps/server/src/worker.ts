import { createDb } from '@nexa/db';
import { runWorkerLoop } from '../hono/worker';
import { startScheduler } from '../hono/scheduler';

/** Separate process that drains the outbox and enqueues the schedules that came due. Run alongside the API; never imports the HTTP app. */
const db = createDb();
const controller = new AbortController();

async function shutdown(signal: string) {
  if (controller.signal.aborted) return;
  console.info(`${signal} received, stopping worker`);
  controller.abort();
  // Give the current job time to finish, then release the database.
  setTimeout(async () => {
    await db.close();
    console.info('Worker stopped');
    process.exit(0);
  }, 1_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

console.info('Nexa outbox worker started');
startScheduler(db, controller.signal);
runWorkerLoop(db, {}, controller.signal).catch((error) => {
  console.error('Worker crashed:', error);
  process.exit(1);
});
