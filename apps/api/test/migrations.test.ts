import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { expect, test } from 'vitest';
import { appSettings } from '../src/db/schema';

test('migrations initialize SQLite and preserve data on a repeated run', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nexa-api-migrations-'));
  const client = createClient({ url: pathToFileURL(join(directory, 'test.db')).href });

  try {
    const db = drizzle(client);
    const config = { migrationsFolder: resolve('drizzle') };
    const setting = { key: 'theme', value: 'light' };

    await migrate(db, config);
    await db.insert(appSettings).values(setting);
    await migrate(db, config);

    expect(await db.select().from(appSettings)).toEqual([setting]);
  } finally {
    client.close();
    await rm(directory, { force: true, recursive: true });
  }
});
