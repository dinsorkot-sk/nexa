import { serve } from '@hono/node-server';
import { createDb } from '@nexa/db';
import { createApp } from '../hono/app';

const port = Number(process.env.PORT ?? 3001);
const db = createDb();
const app = createApp({ db });

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.info(`Nexa API listening on http://localhost:${info.port}/v1`);
});

/** Stops accepting connections, lets in-flight requests finish, then releases the database. */
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`${signal} received, shutting down`);
  const forced = setTimeout(() => {
    console.error('Shutdown timed out; forcing exit');
    process.exit(1);
  }, 10_000);
  forced.unref();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
  console.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
