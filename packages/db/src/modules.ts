import { and, eq, sql } from 'drizzle-orm';
import {
  ModuleCreateInputSchema,
  ModuleDefinitionSchema,
  ModuleStatusSchema,
  ModuleUpdateInputSchema,
  transitionModuleStatus,
  type ModuleCreateInput,
  type ModuleDefinition,
  type ModuleStatus,
  type ModuleUpdateInput,
} from '@nexa/meta';
import type { DbHandle } from './client';
import type { TenantContext } from './tenancy';
import { auditLog, modules } from './schema';

export class ModuleNotFoundError extends Error {
  constructor(id: string) {
    super(`Module not found: ${id}`);
    this.name = 'ModuleNotFoundError';
  }
}

export class ModuleConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModuleConflictError';
  }
}

function parseDefinition(value: unknown): ModuleDefinition {
  return ModuleDefinitionSchema.parse(value);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export function moduleRepository(handle: DbHandle, context: TenantContext) {
  const tenantId = context.tenantId;

  async function get(id: string): Promise<ModuleDefinition | undefined> {
    const [row] = await handle.db.select({ definition: modules.definition })
      .from(modules)
      .where(and(eq(modules.tenantId, tenantId), eq(modules.id, id)))
      .limit(1);
    return row ? parseDefinition(row.definition) : undefined;
  }

  return {
    async list(status?: ModuleStatus): Promise<ModuleDefinition[]> {
      const validStatus = status === undefined ? undefined : ModuleStatusSchema.parse(status);
      const rows = await handle.db.select({ definition: modules.definition }).from(modules).where(
        validStatus
          ? and(eq(modules.tenantId, tenantId), sql`${modules.definition}->>'status' = ${validStatus}`)
          : eq(modules.tenantId, tenantId),
      );
      return rows.map((row) => parseDefinition(row.definition));
    },

    get,

    async create(input: ModuleCreateInput, actorId?: string): Promise<ModuleDefinition> {
      const parsed = ModuleCreateInputSchema.parse(input);
      const now = new Date().toISOString();
      const definition = ModuleDefinitionSchema.parse({
        ...parsed,
        tenantId,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      });
      try {
        return await handle.db.transaction(async (tx) => {
          const [row] = await tx.insert(modules).values({ tenantId, id: definition.id, definition }).returning();
          await tx.insert(auditLog).values({
            tenantId,
            actorId,
            action: 'module.created',
            entityId: definition.id,
            changes: { after: definition },
          });
          return parseDefinition(row.definition);
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw new ModuleConflictError(`Module already exists: ${definition.id}`);
        throw error;
      }
    },

    async update(id: string, patch: ModuleUpdateInput, actorId?: string): Promise<ModuleDefinition> {
      const parsedPatch = ModuleUpdateInputSchema.parse(patch);
      return handle.db.transaction(async (tx) => {
        const [row] = await tx.select({ definition: modules.definition }).from(modules)
          .where(and(eq(modules.tenantId, tenantId), eq(modules.id, id)))
          .limit(1);
        if (!row) throw new ModuleNotFoundError(id);
        const before = parseDefinition(row.definition);
        if (before.status !== 'draft' && before.status !== 'review') {
          throw new ModuleConflictError(`Module cannot be edited while ${before.status}`);
        }
        if (parsedPatch.dependencies?.some((dependency) => dependency.moduleId === id)) {
          throw new ModuleConflictError('A module cannot depend on itself');
        }
        const updated = parseDefinition({ ...before, ...parsedPatch, tenantId, updatedAt: new Date().toISOString() });
        const [updatedRow] = await tx.update(modules).set({ definition: updated, updatedAt: new Date() })
          .where(and(
            eq(modules.tenantId, tenantId),
            eq(modules.id, id),
            sql`${modules.definition} = ${JSON.stringify(before)}::jsonb`,
          ))
          .returning();
        if (!updatedRow) throw new ModuleConflictError('Module changed during update; retry the operation');
        await tx.insert(auditLog).values({
          tenantId,
          actorId,
          action: 'module.updated',
          entityId: id,
          changes: { before, after: updated },
        });
        return parseDefinition(updatedRow.definition);
      });
    },

    async transition(id: string, to: ModuleStatus, actorId?: string): Promise<ModuleDefinition> {
      const targetStatus = ModuleStatusSchema.parse(to);
      return handle.db.transaction(async (tx) => {
        const [row] = await tx.select({ definition: modules.definition }).from(modules)
          .where(and(eq(modules.tenantId, tenantId), eq(modules.id, id)))
          .limit(1);
        if (!row) throw new ModuleNotFoundError(id);
        const before = parseDefinition(row.definition);
        let status: ModuleStatus;
        try {
          status = transitionModuleStatus(before.status, targetStatus);
        } catch (error) {
          throw new ModuleConflictError(error instanceof Error ? error.message : String(error));
        }
        const updated = parseDefinition({ ...before, status, tenantId, updatedAt: new Date().toISOString() });
        const [updatedRow] = await tx.update(modules).set({ definition: updated, updatedAt: new Date() })
          .where(and(
            eq(modules.tenantId, tenantId),
            eq(modules.id, id),
            sql`${modules.definition} = ${JSON.stringify(before)}::jsonb`,
          ))
          .returning();
        if (!updatedRow) throw new ModuleConflictError('Module changed during transition; retry the operation');
        await tx.insert(auditLog).values({
          tenantId,
          actorId,
          action: 'module.status_changed',
          entityId: id,
          changes: { before: { status: before.status }, after: { status } },
        });
        return parseDefinition(updatedRow.definition);
      });
    },
  };
}
