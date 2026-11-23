export { ModuleCatalog, MODULE_NAME_RE, compareVersions, parseVersion } from './catalog.js';
export {
  ModuleService, ensureModuleTables, installedModuleDefs,
  type ModuleInfo, type ModuleState, type ModuleWarning, type UninstallOptions, type UpgradeResult,
} from './service.js';
export { withDriverLock } from './lock.js';
