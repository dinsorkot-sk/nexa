import { and, eq } from 'drizzle-orm';
import type { ModulePackage } from '@nexa/meta';
import { ModulePackageSchema } from '@nexa/meta';
import type { DbHandle } from './client';
import type { TenantContext } from './tenancy';
import { auditLog, metadataDefinitions, modules } from './schema';
import { isUpgrade } from '../../engine/pkg/index';
import type { ModuleDefinition } from '@nexa/meta';
import { DefinitionConflictError } from './definitions';
import { validateModuleSchema } from './definition-integrity';

type DefinitionKind = 'entity' | 'field' | 'relation' | 'view' | 'form' | 'workflow' | 'action' | 'automation' | 'report' | 'dashboard';

const definitionGroups: Array<{ kind: DefinitionKind; key: keyof Omit<ModulePackage, 'manifest' | 'module'> }> = [
  { kind: 'entity', key: 'entities' },
  { kind: 'field', key: 'fields' },
  { kind: 'relation', key: 'relations' },
  { kind: 'view', key: 'views' },
  { kind: 'form', key: 'forms' },
  { kind: 'workflow', key: 'workflows' },
  { kind: 'action', key: 'actions' },
  { kind: 'automation', key: 'automations' },
  { kind: 'report', key: 'reports' },
  { kind: 'dashboard', key: 'dashboards' },
];

/**
 * Exports a module and all its definitions as a validated ModulePackage.
 * Definition writes are gated to draft/review modules, but exports of any
 * status are allowed so published modules can be distributed.
 */
export function packageRepository(handle: DbHandle, context: TenantContext) {
  const tenantId = context.tenantId;

  return {
    async exportPackage(moduleId: string): Promise<ModulePackage> {
      const [moduleRow] = await handle.db.select({ definition: modules.definition })
        .from(modules).where(and(eq(modules.tenantId, tenantId), eq(modules.id, moduleId))).limit(1);
      if (!moduleRow) throw new Error(`Module not found: ${moduleId}`);
      const module = moduleRow.definition as ModulePackage['module'];
      const rows = await handle.db.select({ kind: metadataDefinitions.kind, definition: metadataDefinitions.definition })
        .from(metadataDefinitions)
        .where(and(eq(metadataDefinitions.tenantId, tenantId), eq(metadataDefinitions.moduleId, moduleId)));
      const payload: Record<string, unknown> = { module };
      for (const group of definitionGroups) {
        payload[group.key] = rows.filter((row) => row.kind === group.kind).map((row) => row.definition);
      }
      return ModulePackageSchema.parse({
        manifest: {
          formatVersion: 1,
          moduleId: module.id,
          version: module.version,
          dependencies: (module as unknown as { dependencies?: Array<{ moduleId: string; version: string }> }).dependencies ?? [],
          exportedAt: new Date().toISOString(),
        },
        ...payload,
      });
    },

    /** Imports a package: creates the module (draft) and all definitions in one transaction. */
    async importPackage(pkg: ModulePackage, actorId?: string): Promise<ModulePackage> {
      const parsed = ModulePackageSchema.parse(pkg);
      return handle.db.transaction(async (tx) => {
        const existing = await tx.select({ id: modules.id }).from(modules)
          .where(and(eq(modules.tenantId, tenantId), eq(modules.id, parsed.manifest.moduleId))).limit(1);
        if (existing.length > 0) throw new DefinitionConflictError(`Module already exists: ${parsed.manifest.moduleId}`);
        const now = new Date();
        await tx.insert(modules).values({
          tenantId,
          id: parsed.module.id,
          definition: { ...parsed.module, status: 'draft', createdAt: now.toISOString(), updatedAt: now.toISOString() },
          createdAt: now,
          updatedAt: now,
        });
        const rows: Array<{ kind: DefinitionKind; id: string; definition: Record<string, unknown> }> = [];
        for (const group of definitionGroups) {
          for (const definition of parsed[group.key]) {
            const def = definition as unknown as { id: string };
            rows.push({ kind: group.kind, id: def.id, definition: definition as unknown as Record<string, unknown> });
          }
        }
        // Validate integrity over the full set before writing anything.
        const byKind = (kind: DefinitionKind) => rows.filter((row) => row.kind === kind).map((row) => row.definition) as never[];
        const issues = validateModuleSchema(byKind('entity'), byKind('field'), byKind('relation'), byKind('workflow'), byKind('action'), byKind('automation'), byKind('report'), byKind('dashboard'), byKind('view'), byKind('form'));
        if (issues.length > 0) {
          throw new DefinitionConflictError(`Invalid package schema: ${issues.map((issue) => issue.message).join('; ')}`);
        }
        for (const row of rows) {
          await tx.insert(metadataDefinitions).values({ tenantId, moduleId: parsed.manifest.moduleId, kind: row.kind, id: row.id, definition: row.definition });
        }
        await tx.insert(auditLog).values({ tenantId, actorId, action: 'module.imported', entityId: parsed.module.id, changes: { moduleId: parsed.module.id, version: parsed.manifest.version } });
        return parsed;
      });
    },

    /**
     * Upgrades an existing module with a package whose version is strictly greater.
     * Replaces all definitions in one transaction (draft/review only, matching
     * the definition editing rule) and bumps the module version.
     */
    async upgradePackage(pkg: ModulePackage, actorId?: string): Promise<ModuleDefinition> {
      const parsed = ModulePackageSchema.parse(pkg);
      return handle.db.transaction(async (tx) => {
        const [moduleRow] = await tx.select({ definition: modules.definition })
          .from(modules).where(and(eq(modules.tenantId, tenantId), eq(modules.id, parsed.manifest.moduleId))).for('update').limit(1);
        if (!moduleRow) throw new Error(`Module not found: ${parsed.manifest.moduleId}`);
        const current = moduleRow.definition as ModuleDefinition;
        if (!isUpgrade(current.version, parsed.manifest.version)) {
          throw new DefinitionConflictError(`Incoming version ${parsed.manifest.version} must be greater than current ${current.version}`);
        }
        if (current.status !== 'draft' && current.status !== 'review') {
          throw new DefinitionConflictError(`Definitions cannot be replaced while the module is ${current.status}`);
        }
        const rows: Array<{ kind: DefinitionKind; id: string; definition: Record<string, unknown> }> = [];
        for (const group of definitionGroups) {
          for (const definition of parsed[group.key]) {
            const def = definition as unknown as { id: string };
            rows.push({ kind: group.kind, id: def.id, definition: definition as unknown as Record<string, unknown> });
          }
        }
        const byKind = (kind: DefinitionKind) => rows.filter((row) => row.kind === kind).map((row) => row.definition) as never[];
        const issues = validateModuleSchema(byKind('entity'), byKind('field'), byKind('relation'), byKind('workflow'), byKind('action'), byKind('automation'), byKind('report'), byKind('dashboard'), byKind('view'), byKind('form'));
        if (issues.length > 0) {
          throw new DefinitionConflictError(`Invalid package schema: ${issues.map((issue) => issue.message).join('; ')}`);
        }
        await tx.delete(metadataDefinitions).where(and(eq(metadataDefinitions.tenantId, tenantId), eq(metadataDefinitions.moduleId, parsed.manifest.moduleId)));
        for (const row of rows) {
          await tx.insert(metadataDefinitions).values({ tenantId, moduleId: parsed.manifest.moduleId, kind: row.kind, id: row.id, definition: row.definition });
        }
        const now = new Date().toISOString();
        const updated = { ...current, ...parsed.module, status: current.status, version: parsed.manifest.version, createdAt: current.createdAt as unknown as string, updatedAt: now } as unknown as ModuleDefinition;
        await tx.update(modules).set({ definition: updated as unknown as Record<string, unknown>, updatedAt: new Date() })
          .where(and(eq(modules.tenantId, tenantId), eq(modules.id, parsed.manifest.moduleId)));
        await tx.insert(auditLog).values({ tenantId, actorId, action: 'module.upgraded', entityId: parsed.module.id, changes: { from: current.version, to: parsed.manifest.version } });
        return updated;
      });
    },
  };
}
