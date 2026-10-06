import { migrate as migratePGlite } from 'drizzle-orm/pglite/migrator';
import { migrate as migratePostgres } from 'drizzle-orm/node-postgres/migrator';
import type { DbHandle } from './client';

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

function resolveMigrationsFolder(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  if (!moduleDir.includes('node_modules')) return resolve(moduleDir, '../migrations');
  return resolve(process.cwd(), 'packages/db/migrations');
}

export async function runMigrations(handle: DbHandle, folder = resolveMigrationsFolder()): Promise<void> {
  if (handle.driver === 'pglite') {
    await migratePGlite(handle.db, { migrationsFolder: folder });
    return;
  }
  await migratePostgres(handle.db, { migrationsFolder: folder });
}
