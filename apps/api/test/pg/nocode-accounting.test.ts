/**
 * The T3a/T3b HTTP accounting proof against a real PostgreSQL server (one database per tenant).
 * Run with `npx vitest run -c vitest.pg.config.ts`, which starts embedded PostgreSQL (or uses
 * NEXA_TEST_PG_URL). In the default PGlite run there is no server, so this file only reports a skip.
 */
import { describe, inject, it } from 'vitest';
import { accountingProofSuite } from '../nocode-accounting.suite';

const url = inject('pgUrl' as never) as string | null | undefined;

if (url) accountingProofSuite(url);
else {
  describe.skip('real PostgreSQL HTTP accounting proof (run with vitest.pg.config.ts)', () => {
    it('needs a PostgreSQL server', () => undefined);
  });
}
