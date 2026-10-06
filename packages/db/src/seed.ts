import { systemSettings, tenants } from './schema';
import type { DbHandle } from './client';
import { SYSTEM_TENANT_ID } from './tenancy';

const baselineSettings = [
  { key: 'platform.name', value: 'Nexa' },
  { key: 'platform.schemaVersion', value: '1' },
];

export async function seedDatabase(handle: DbHandle): Promise<void> {
  await handle.db.transaction(async (tx) => {
    await tx.insert(tenants).values({
      id: SYSTEM_TENANT_ID,
      slug: 'system',
      name: 'System',
    }).onConflictDoNothing({ target: tenants.id });
    await tx.insert(systemSettings).values(baselineSettings).onConflictDoNothing({ target: systemSettings.key });
  });
}
