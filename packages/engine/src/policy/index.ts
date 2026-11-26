import { setRecordGuards } from '../orm/env.js';
import { policyGuards } from './guards.js';

// Installed once when the engine loads (config-models imports this module). The ORM has a single
// guard slot: later policy kinds (ADR 0004 P3 date locks) extend policyGuards instead of chaining.
setRecordGuards(policyGuards);

export { checkLifecycleRecords } from './models.js';
export {
  DateLockError, checkDateLockRecords, compileDateLock, dateLockAccess, dateLockModels,
  type DateLock, type DateLockOp, type DateLockRow,
} from './datelock.js';
export { LifecycleError, policyGuards } from './guards.js';
export {
  PolicyIndex, buildIndex, compileLifecycle, policyIndex,
  type LifecycleRow, type ModelEntry, type ModelPolicy, type ParentLink, type StateLock,
} from './lifecycle.js';
// Write tokens are deliberately not re-exported: import them from './token.js' inside the engine only.
