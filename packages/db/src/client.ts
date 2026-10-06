import { drizzle as drizzlePgLite } from 'drizzle-orm/pglite';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import * as schema from './schema';

export type NexaDb = ReturnType<typeof createDbClient>;

export interface DbConfig {
  databaseUrl?: string;
  dataDir?: string;
}

export function createDbClient(config: DbConfig = {}) {
  const databaseUrl = config.databaseUrl || process.env.DATABASE_URL;

  if (databaseUrl && !databaseUrl.startsWith('pglite://')) {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    return drizzleNodePg(pool, { schema });
  }

  // Use PGlite
  const dataDir = config.dataDir || (process.env.DATABASE_URL?.replace('pglite://', '') ?? './.data/pglite');
  const client = new PGlite(dataDir);
  return drizzlePgLite(client, { schema });
}
