import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    /** admin connection string of the embedded server, or null when it could not start */
    pgUrl: string | null;
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      srv.close(() => (addr && typeof addr === 'object' ? resolve(addr.port) : reject(new Error('no port'))));
    });
  });
}

/**
 * Starts one embedded PostgreSQL server per test run (random port, data dir in the OS temp folder) and
 * tears it down afterwards. NEXA_TEST_PG_URL points the suite at an existing server instead. If the
 * binaries cannot start, the suite is skipped with the reason printed.
 */
export default async function setup(project: TestProject): Promise<(() => Promise<void>) | void> {
  const external = process.env.NEXA_TEST_PG_URL;
  if (external) {
    project.provide('pgUrl', external);
    return;
  }
  const dir = await mkdtemp(join(tmpdir(), 'nexa-pg-'));
  const password = randomBytes(12).toString('hex');
  let pg: { initialise(): Promise<void>; start(): Promise<void>; stop(): Promise<void> } | undefined;
  try {
    const { default: EmbeddedPostgres } = await import('embedded-postgres');
    const port = await freePort();
    const server = new EmbeddedPostgres({
      databaseDir: join(dir, 'data'), port, user: 'postgres', password, persistent: false,
      authMethod: 'scram-sha-256',
      // tests open many tenant pools at once; the fsync-free settings only speed up a throwaway cluster
      postgresFlags: ['-c', 'max_connections=300', '-c', 'fsync=off', '-c', 'synchronous_commit=off', '-c', 'full_page_writes=off'],
      onLog: () => undefined,
      onError: () => undefined,
    });
    await server.initialise();
    await server.start();
    pg = server;
    project.provide('pgUrl', `postgres://postgres:${password}@127.0.0.1:${port}/postgres`);
    console.log(`[pg] embedded PostgreSQL started on port ${port}`);
  } catch (err) {
    console.warn(`[pg] SKIPPING real-PostgreSQL suite: embedded PostgreSQL could not start: ${(err as Error)?.message ?? String(err)}`);
    project.provide('pgUrl', null);
    await pg?.stop().catch(() => undefined);
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    return;
  }
  return async () => {
    await pg?.stop().catch((e: unknown) => console.warn(`[pg] stop failed: ${String(e)}`));
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined);
  };
}
