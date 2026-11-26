import { ModuleCatalog, PgliteTenantManager, baseModule } from '../src/index.js';
import { accountingProofSuite } from './accounting-nocode-suite.js';

accountingProofSuite(async () => {
  const manager = new PgliteTenantManager({ catalog: new ModuleCatalog([baseModule]) });
  const h = await manager.create('accounting-proof', ['base']);
  return { h, close: () => manager.closeAll() };
});
