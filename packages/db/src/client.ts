import { sql } from 'drizzle-orm';
import { drizzle as drizzlePgLite } from 'drizzle-orm/pglite';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PGlite } from '@electric-sql/pglite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as schema from './schema';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const defaultPGliteDataDir = resolve(repositoryRoot, '.data/pglite');

function createPGlite(dataDir: string): PGlite {
  if (dataDir !== 'memory://') mkdirSync(dirname(dataDir), { recursive: true });
  return new PGlite(dataDir === 'memory://' ? undefined : dataDir);
}

export interface DbConfig {
  databaseUrl?: string;
  dataDir?: string;
}

export type DbHandle =
  | { driver: 'pg'; db: NodePgDatabase<typeof schema>; close: () => Promise<void> }
  | { driver: 'pglite'; db: PgliteDatabase<typeof schema>; close: () => Promise<void> };

export type NexaDb = DbHandle['db'];

export function createDb(config: DbConfig = {}): DbHandle {
  const databaseUrl = config.databaseUrl ?? process.env.DATABASE_URL;
  if (databaseUrl && !databaseUrl.startsWith('pglite://')) {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    return {
      driver: 'pg',
      db: drizzleNodePg(pool, { schema }),
      close: () => pool.end(),
    };
  }

  const dataDir = config.dataDir ?? getPGliteDataDir(databaseUrl);
  const client = createPGlite(dataDir);
  return {
    driver: 'pglite',
    db: drizzlePgLite(client, { schema }),
    close: () => client.close(),
  };
}

/** Round-trips a trivial query. Used by the readiness probe; throws when the database is unreachable. */
export async function pingDatabase(handle: DbHandle): Promise<boolean> {
  await handle.db.execute(sql`select 1`);
  return true;
}

export function createDbClient(config: DbConfig = {}): NexaDb {
  return createDb(config).db;
}

function getPGliteDataDir(databaseUrl?: string): string {
  if (!databaseUrl?.startsWith('pglite://')) return defaultPGliteDataDir;
  const path = databaseUrl.slice('pglite://'.length);
  return path.length > 0 ? path : './.data/pglite';
}
