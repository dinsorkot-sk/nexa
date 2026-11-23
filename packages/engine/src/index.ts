export * from './contracts/index.js';
export { PgliteDriver } from './driver/pglite.js';
export { ModelRegistry, resolveModels, isColumn, tableName } from './orm/registry.js';
export { EnvImpl, RecordCache } from './orm/env.js';
export { RecordsetImpl } from './orm/recordset.js';
export { compileDomain, compileOrder } from './domain/compile.js';
export { syncSchema, columnType } from './schema/sync.js';
export { PgliteTenantManager, type TenantManagerOptions } from './tenant/manager.js';
export { planMigration, applyMigration, indexName, quoteIdent, type MigrationOp, type MigrationPlan, type PlanOptions } from './schema/sync.js';
export { MetadataStore, ensureMetadataTables, loadCustomDefs, combinedSource, type CustomModelInput, type DestructiveOptions } from './metadata/store.js';
export { ensureSecurityTables, writeModuleSecurity, removeModuleSecurity } from './security/tables.js';
export { securityModels, ACCESS_MANAGER } from './security/models.js';
export { checkModelAccess, checkRecordRules, ruleDomain, combine as combineDomains, userSecurity } from './security/access.js';
export { SUPERUSER_ID } from './orm/env.js';
export * from './modules/index.js';
export { ensureUiTables, writeModuleUi, removeModuleUi } from './ui-meta/tables.js';
export { applyPatches, parseSelector, filterArch } from './ui-meta/arch.js';
export { getView, getAction, getMenus, defaultArch, validateViews, type ResolvedView, type FieldInfo, type MenuNode, type ResolvedAction } from './ui-meta/views.js';
export { baseModule } from './base/manifest.js';
export { contactsModule, salesLiteModule, demoModules } from './demo/index.js';
export {
  ensureServiceTables, SequenceService, SchedulerService, AutomationService, AuditService, AttachmentService,
  type SequenceOptions, type ScheduledJob, type ClaimedJob, type AutomationEvent, type AutomationRule,
  type AutomationHandler, type AuditEntry, type AttachmentInput, type Attachment,
} from './services/index.js';
