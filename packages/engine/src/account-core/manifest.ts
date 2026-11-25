import type { AccessRule, ModuleManifest } from '../contracts/index.js';
import { taxModels } from './tax.js';

const readOnly = { read: true, write: false, create: false, unlink: false };
const full = { read: true, write: true, create: true, unlink: true };

export const accountCoreAccess: AccessRule[] = [
  { model: 'account.tax', group: 'base.group_user', perms: readOnly },
  { model: 'account.tax', group: 'base.group_system', perms: full },
];

/** Minimal optional account foundation, deliberately independent of any jurisdiction defaults. */
export const accountCoreModule: ModuleManifest = {
  name: 'account_core', version: '1.0.0', summary: 'Core accounting primitives and tax configuration',
  depends: ['base'], models: taxModels, access: accountCoreAccess,
};
