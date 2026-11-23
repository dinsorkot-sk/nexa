export { contactsModule } from './contacts.js';
export { salesLiteModule } from './sales-lite.js';

/** Optional demonstration modules in dependency order. */
import { contactsModule } from './contacts.js';
import { salesLiteModule } from './sales-lite.js';
export const demoModules = [contactsModule, salesLiteModule] as const;
