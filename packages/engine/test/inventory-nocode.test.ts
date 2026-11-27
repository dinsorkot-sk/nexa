import { ModuleCatalog, PgliteTenantManager, baseModule } from '../src/index.js';
import { inventoryProofSuite } from './inventory-nocode-suite.js';

inventoryProofSuite(async () => {
  const manager = new PgliteTenantManager({ catalog: new ModuleCatalog([baseModule]) });
  const h = await manager.create('inventory-proof', ['base']);
  return { h, close: () => manager.closeAll() };
});
