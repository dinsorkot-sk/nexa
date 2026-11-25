import { describe, expect, it } from 'vitest';
import { PgliteTenantManager } from '../../src/index.js';
import { PgDriver } from '../../src/driver/pg.js';
import { pgUrl } from './helpers.js';

// Guards the parity runs: the PGlite suites listed in vitest.pg.config.ts must really hit the server.
describe.skipIf(!pgUrl)('parity harness', () => {
  it('replaces PgliteTenantManager with a PostgreSQL-backed manager', async () => {
    const m = new PgliteTenantManager({});
    try {
      const h = await m.open('parity');
      expect(h.driver).toBeInstanceOf(PgDriver);
      const [r] = await h.driver.query<{ v: string }>({ text: `SELECT version() AS v`, params: [] });
      expect(r!.v).toMatch(/^PostgreSQL 17/);
      const [p] = await h.driver.query<{ n: number }>({ text: `SELECT count(DISTINCT pid)::int AS n FROM pg_stat_activity WHERE backend_type = 'client backend'`, params: [] });
      expect(p!.n).toBeGreaterThan(0);
    } finally {
      await m.closeAll();
    }
  });
});
