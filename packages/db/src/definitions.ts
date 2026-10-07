import { and, eq, sql } from 'drizzle-orm';
import {
  EntityCreateInputSchema,
  EntityDefinitionSchema,
  EntityUpdateInputSchema,
  FieldCreateInputSchema,
  FieldDefinitionSchema,
  FieldUpdateInputSchema,
  RelationCreateInputSchema,
  RelationDefinitionSchema,
  RelationUpdateInputSchema,
  type EntityDefinition,
  type FieldDefinition,
  type RelationDefinition,
  type z,
} from '@nexa/meta';
import { validateModuleSchema } from './definition-integrity';
import type { DbHandle } from './client';
import type { TenantContext } from './tenancy';
import { auditLog, metadataDefinitions, modules, records } from './schema';

export type DefinitionKind = 'entity' | 'field' | 'relation';

export interface ModuleSchema {
  entities: EntityDefinition[];
  fields: FieldDefinition[];
  relations: RelationDefinition[];
}

export class DefinitionNotFoundError extends Error {
  constructor(what: string, id: string) {
    super(`${what} not found: ${id}`);
    this.name = 'DefinitionNotFoundError';
  }
}

export class DefinitionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DefinitionConflictError';
  }
}

const schemas: Record<DefinitionKind, z.ZodTypeAny> = {
  entity: EntityDefinitionSchema,
  field: FieldDefinitionSchema,
  relation: RelationDefinitionSchema,
};

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export function definitionRepository(handle: DbHandle, context: TenantContext) {
  const tenantId = context.tenantId;

  type Tx = Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0];

  const scope = (moduleId: string, kind: DefinitionKind) => and(
    eq(metadataDefinitions.tenantId, tenantId),
    eq(metadataDefinitions.moduleId, moduleId),
    eq(metadataDefinitions.kind, kind),
  );

  async function readAll<T>(db: Tx | DbHandle['db'], moduleId: string, kind: DefinitionKind): Promise<T[]> {
    const rows = await db.select({ definition: metadataDefinitions.definition })
      .from(metadataDefinitions)
      .where(scope(moduleId, kind));
    return rows.map((row) => schemas[kind].parse(row.definition) as T);
  }

  async function loadSchema(db: Tx | DbHandle['db'], moduleId: string): Promise<ModuleSchema> {
    return {
      entities: await readAll<EntityDefinition>(db, moduleId, 'entity'),
      fields: await readAll<FieldDefinition>(db, moduleId, 'field'),
      relations: await readAll<RelationDefinition>(db, moduleId, 'relation'),
    };
  }

  /** Runs `change` in a transaction with the module row locked, gated to draft/review modules. */
  async function mutate<R>(
    moduleId: string,
    action: string,
    actorId: string | undefined,
    change: (tx: Tx, current: ModuleSchema) => Promise<{ next: ModuleSchema; result: R; audit: Record<string, unknown>; entityId: string }>,
  ): Promise<R> {
    return handle.db.transaction(async (tx) => {
      const locked = await tx.execute(sql`
        SELECT definition->>'status' AS status FROM ${modules}
        WHERE ${modules.tenantId} = ${tenantId} AND ${modules.id} = ${moduleId} FOR UPDATE`);
      const row = (locked.rows as Array<{ status: string }>)[0];
      if (!row) throw new DefinitionNotFoundError('Module', moduleId);
      if (row.status !== 'draft' && row.status !== 'review') {
        throw new DefinitionConflictError(`Definitions cannot be edited while the module is ${row.status}`);
      }
      const current = await loadSchema(tx, moduleId);
      const { next, result, audit, entityId } = await change(tx, current);
      const issues = validateModuleSchema(next.entities, next.fields, next.relations);
      if (issues.length > 0) {
        throw new DefinitionConflictError(`Invalid module schema: ${issues.map((issue) => issue.message).join('; ')}`);
      }
      await tx.insert(auditLog).values({ tenantId, actorId, action, entityId, changes: { moduleId, ...audit } });
      return result;
    });
  }

  async function insertDefinition(tx: Tx, moduleId: string, kind: DefinitionKind, definition: { id: string }) {
    try {
      await tx.insert(metadataDefinitions).values({ tenantId, moduleId, kind, id: definition.id, definition });
    } catch (error) {
      if (isUniqueViolation(error)) throw new DefinitionConflictError(`${kind} already exists: ${definition.id}`);
      throw error;
    }
  }

  async function writeDefinition(tx: Tx, moduleId: string, kind: DefinitionKind, definition: { id: string }) {
    await tx.update(metadataDefinitions).set({ definition, updatedAt: new Date() })
      .where(and(scope(moduleId, kind), eq(metadataDefinitions.id, definition.id)));
  }

  async function removeDefinitions(tx: Tx, moduleId: string, kind: DefinitionKind, ids: string[]) {
    for (const id of ids) {
      await tx.delete(metadataDefinitions).where(and(scope(moduleId, kind), eq(metadataDefinitions.id, id)));
    }
  }

  async function getOne<T>(moduleId: string, kind: DefinitionKind, id: string): Promise<T | undefined> {
    const [row] = await handle.db.select({ definition: metadataDefinitions.definition })
      .from(metadataDefinitions)
      .where(and(scope(moduleId, kind), eq(metadataDefinitions.id, id)))
      .limit(1);
    return row ? (schemas[kind].parse(row.definition) as T) : undefined;
  }

  return {
    getModuleSchema: (moduleId: string) => loadSchema(handle.db, moduleId),

    listEntities: (moduleId: string) => readAll<EntityDefinition>(handle.db, moduleId, 'entity'),
    getEntity: (moduleId: string, id: string) => getOne<EntityDefinition>(moduleId, 'entity', id),

    async createEntity(moduleId: string, input: z.input<typeof EntityCreateInputSchema>, actorId?: string): Promise<EntityDefinition> {
      const parsed = EntityCreateInputSchema.parse(input);
      const now = new Date().toISOString();
      const entity = EntityDefinitionSchema.parse({ ...parsed, moduleId, createdAt: now, updatedAt: now });
      return mutate(moduleId, 'entity.created', actorId, async (tx, current) => {
        await insertDefinition(tx, moduleId, 'entity', entity);
        return {
          next: { ...current, entities: [...current.entities, entity] },
          result: entity,
          audit: { kind: 'entity', after: entity },
          entityId: entity.id,
        };
      });
    },

    async updateEntity(moduleId: string, id: string, patch: z.input<typeof EntityUpdateInputSchema>, actorId?: string): Promise<EntityDefinition> {
      const parsed = EntityUpdateInputSchema.parse(patch);
      return mutate(moduleId, 'entity.updated', actorId, async (tx, current) => {
        const before = current.entities.find((entity) => entity.id === id);
        if (!before) throw new DefinitionNotFoundError('Entity', id);
        const { icon, ...rest } = parsed;
        const after = EntityDefinitionSchema.parse({
          ...before,
          ...rest,
          ...(icon === undefined ? {} : { icon: icon ?? undefined }),
          updatedAt: new Date().toISOString(),
        });
        await writeDefinition(tx, moduleId, 'entity', after);
        return {
          next: { ...current, entities: current.entities.map((entity) => (entity.id === id ? after : entity)) },
          result: after,
          audit: { kind: 'entity', before, after },
          entityId: id,
        };
      });
    },

    /** Deletes an entity and its own fields; refused while relations, reference fields, or records depend on it. */
    async deleteEntity(moduleId: string, id: string, actorId?: string): Promise<void> {
      await mutate(moduleId, 'entity.deleted', actorId, async (tx, current) => {
        const before = current.entities.find((entity) => entity.id === id);
        if (!before) throw new DefinitionNotFoundError('Entity', id);
        const [existing] = await tx.select({ id: records.id }).from(records)
          .where(and(eq(records.tenantId, tenantId), eq(records.moduleId, moduleId), eq(records.entityId, id), sql`${records.deletedAt} IS NULL`)).limit(1);
        if (existing) throw new DefinitionConflictError(`Entity ${id} has records and cannot be deleted`);
        const ownedFields = current.fields.filter((field) => field.entityId === id);
        await removeDefinitions(tx, moduleId, 'field', ownedFields.map((field) => field.id));
        await removeDefinitions(tx, moduleId, 'entity', [id]);
        return {
          next: {
            ...current,
            entities: current.entities.filter((entity) => entity.id !== id),
            fields: current.fields.filter((field) => field.entityId !== id),
          },
          result: undefined,
          audit: { kind: 'entity', before, removedFields: ownedFields.map((field) => field.id) },
          entityId: id,
        };
      });
    },

    listFields: async (moduleId: string, entityId?: string) => {
      const all = await readAll<FieldDefinition>(handle.db, moduleId, 'field');
      return entityId ? all.filter((field) => field.entityId === entityId) : all;
    },
    getField: (moduleId: string, id: string) => getOne<FieldDefinition>(moduleId, 'field', id),

    async createField(moduleId: string, entityId: string, input: z.input<typeof FieldCreateInputSchema>, actorId?: string): Promise<FieldDefinition> {
      const parsed = FieldCreateInputSchema.parse(input);
      const field = FieldDefinitionSchema.parse({ ...parsed, entityId });
      return mutate(moduleId, 'field.created', actorId, async (tx, current) => {
        if (!current.entities.some((entity) => entity.id === entityId)) throw new DefinitionNotFoundError('Entity', entityId);
        await insertDefinition(tx, moduleId, 'field', field);
        return {
          next: { ...current, fields: [...current.fields, field] },
          result: field,
          audit: { kind: 'field', after: field },
          entityId: field.id,
        };
      });
    },

    async updateField(moduleId: string, id: string, patch: z.input<typeof FieldUpdateInputSchema>, actorId?: string): Promise<FieldDefinition> {
      const parsed = FieldUpdateInputSchema.parse(patch);
      return mutate(moduleId, 'field.updated', actorId, async (tx, current) => {
        const before = current.fields.find((field) => field.id === id);
        if (!before) throw new DefinitionNotFoundError('Field', id);
        const after = FieldDefinitionSchema.parse({ ...before, ...parsed });
        await writeDefinition(tx, moduleId, 'field', after);
        return {
          next: { ...current, fields: current.fields.map((field) => (field.id === id ? after : field)) },
          result: after,
          audit: { kind: 'field', before, after },
          entityId: id,
        };
      });
    },

    async deleteField(moduleId: string, id: string, actorId?: string): Promise<void> {
      await mutate(moduleId, 'field.deleted', actorId, async (tx, current) => {
        const before = current.fields.find((field) => field.id === id);
        if (!before) throw new DefinitionNotFoundError('Field', id);
        await removeDefinitions(tx, moduleId, 'field', [id]);
        return {
          next: { ...current, fields: current.fields.filter((field) => field.id !== id) },
          result: undefined,
          audit: { kind: 'field', before },
          entityId: id,
        };
      });
    },

    listRelations: (moduleId: string) => readAll<RelationDefinition>(handle.db, moduleId, 'relation'),
    getRelation: (moduleId: string, id: string) => getOne<RelationDefinition>(moduleId, 'relation', id),

    async createRelation(moduleId: string, input: z.input<typeof RelationCreateInputSchema>, actorId?: string): Promise<RelationDefinition> {
      const relation = RelationDefinitionSchema.parse(RelationCreateInputSchema.parse(input));
      return mutate(moduleId, 'relation.created', actorId, async (tx, current) => {
        await insertDefinition(tx, moduleId, 'relation', relation);
        return {
          next: { ...current, relations: [...current.relations, relation] },
          result: relation,
          audit: { kind: 'relation', after: relation },
          entityId: relation.id,
        };
      });
    },

    async updateRelation(moduleId: string, id: string, patch: z.input<typeof RelationUpdateInputSchema>, actorId?: string): Promise<RelationDefinition> {
      const parsed = RelationUpdateInputSchema.parse(patch);
      return mutate(moduleId, 'relation.updated', actorId, async (tx, current) => {
        const before = current.relations.find((relation) => relation.id === id);
        if (!before) throw new DefinitionNotFoundError('Relation', id);
        const { reverseName, ...rest } = parsed;
        const after = RelationDefinitionSchema.parse({
          ...before,
          ...rest,
          ...(reverseName === undefined ? {} : { reverseName: reverseName ?? undefined }),
        });
        await writeDefinition(tx, moduleId, 'relation', after);
        return {
          next: { ...current, relations: current.relations.map((relation) => (relation.id === id ? after : relation)) },
          result: after,
          audit: { kind: 'relation', before, after },
          entityId: id,
        };
      });
    },

    async deleteRelation(moduleId: string, id: string, actorId?: string): Promise<void> {
      await mutate(moduleId, 'relation.deleted', actorId, async (tx, current) => {
        const before = current.relations.find((relation) => relation.id === id);
        if (!before) throw new DefinitionNotFoundError('Relation', id);
        await removeDefinitions(tx, moduleId, 'relation', [id]);
        return {
          next: { ...current, relations: current.relations.filter((relation) => relation.id !== id) },
          result: undefined,
          audit: { kind: 'relation', before },
          entityId: id,
        };
      });
    },
  };
}
