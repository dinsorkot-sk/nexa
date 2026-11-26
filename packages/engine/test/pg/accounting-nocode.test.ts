import { describe } from 'vitest';
import { ModuleCatalog, baseModule } from '../../src/index.js';
import { accountingProofSuite } from '../accounting-nocode-suite.js';
import { pgManager, pgUrl } from './helpers.js';

describe.skipIf(!pgUrl)('real PostgreSQL no-code accounting proof', () => {
  accountingProofSuite(async () => {
    const manager = pgManager({ catalog: new ModuleCatalog([baseModule]) });
    const h = await manager.create('accounting-proof', ['base']);
    return { h, close: () => manager.closeAll() };
  });
});
