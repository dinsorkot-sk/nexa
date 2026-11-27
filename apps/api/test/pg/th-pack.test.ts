/** The Thai starter pack proof against real PostgreSQL (run with vitest.pg.config.ts); skipped otherwise. */
import { describe, inject, it } from 'vitest';
import { thPackSuite } from '../th-pack.suite';

const url = inject('pgUrl' as never) as string | null | undefined;

if (url) thPackSuite(url);
else {
  describe.skip('real PostgreSQL Thai starter pack (run with vitest.pg.config.ts)', () => {
    it('needs a PostgreSQL server', () => undefined);
  });
}
