import { createHash, randomBytes } from 'node:crypto';
import { beforeEach, inject, vi } from 'vitest';

/**
 * Parity runs: selected existing PGlite test files run unchanged against the real server. Their
 * `PgliteTenantManager` (imported from src/index) is replaced by a PgTenantManager on a unique database
 * prefix (stable per rootDir, so tests that reopen a tenant from the same "dir" see the same databases).
 */
const url = inject('pgUrl');

if (!url) {
  beforeEach((ctx) => ctx.skip());
} else {
  vi.mock('../../src/index.js', async (importOriginal) => {
    const orig = await importOriginal<typeof import('../../src/index.js')>();
    const { PgTenantManager } = await import('../../src/tenant/pg.js');
    const pgUrl = inject('pgUrl')!;
    class PgBackedTenantManager extends PgTenantManager {
      constructor(opts: import('../../src/tenant/manager.js').TenantManagerOptions) {
        const { rootDir, ...rest } = opts;
        const prefix = rootDir
          ? `d${createHash('sha1').update(rootDir).digest('hex').slice(0, 10)}_`
          : `m${randomBytes(5).toString('hex')}_`;
        super({ ...rest, url: pgUrl, dbPrefix: prefix, poolMax: 4 });
      }
    }
    return { ...orig, PgliteTenantManager: PgBackedTenantManager };
  });
}
