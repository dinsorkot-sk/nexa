import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import * as schema from '../src/schema';

describe('@nexa/db client and schema', () => {
  it('connects to in-memory PGlite and executes query', async () => {
    const pglite = new PGlite(); // in-memory
    const db = drizzle(pglite, { schema });

    // Create table directly in memory test
    await db.execute(sql`
      CREATE TABLE nexa_system_settings (
        key text PRIMARY KEY,
        value text NOT NULL,
        updated_at timestamptz DEFAULT NOW() NOT NULL
      )
    `);

    // Insert record
    await db.insert(schema.systemSettings).values({
      key: 'version',
      value: '0.0.1',
    });

    // Query record
    const result = await db.select().from(schema.systemSettings);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('version');
    expect(result[0].value).toBe('0.0.1');

    await pglite.close();
  });
});
