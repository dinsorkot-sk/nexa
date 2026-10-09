import type { EntityDefinition, FieldDefinition, RelationDefinition } from '@nexa/meta';
import type { ApiFetch } from '../utils/api-client';
import { createApiClient } from '../utils/api-client';
import { entityFields, type ModuleSchema } from '../utils/module-builder';

/** Normalized record as returned by the API (hidden fields redacted server-side). */
export interface RuntimeRecord {
  id: string;
  version: number;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface RuntimeActivityEntry {
  id: string;
  action: string;
  actorId: string | null;
  actorName: string;
  occurredAt: string;
  changes: Record<string, unknown>;
}

export interface RuntimeListResult {
  items: RuntimeRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface RecordQueryOptions {
  search?: string;
  /** Sort field id; sent as `fieldId:direction` per the API's query format. */
  sort?: string;
  direction?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/** Loads a module's full metadata schema for runtime rendering. */
export async function loadModuleSchema(
  fetchImpl: ApiFetch,
  baseUrl: string,
  moduleId: string,
): Promise<ModuleSchema> {
  const client = createApiClient(baseUrl, fetchImpl);
  const response = await client.modules[':moduleId'].schema.$get({ param: { moduleId } });
  const payload = await response.json() as Partial<ModuleSchema>;
  return {
    entities: payload.entities ?? [],
    fields: payload.fields ?? [],
    relations: payload.relations ?? [],
  };
}

export function fieldsForEntity(schema: ModuleSchema, entityId: string): FieldDefinition[] {
  return entityFields(schema, entityId);
}

export function entityForId(schema: ModuleSchema, entityId: string): EntityDefinition | undefined {
  return schema.entities.find((entity) => entity.id === entityId);
}

export function relationsForEntity(schema: ModuleSchema, entityId: string): RelationDefinition[] {
  return schema.relations.filter((relation) => relation.sourceEntityId === entityId || relation.targetEntityId === entityId);
}

/** Lists records with bounded query params matching the API's validated surface. */
export async function listRecords(
  fetchImpl: ApiFetch,
  baseUrl: string,
  moduleId: string,
  entityId: string,
  options: RecordQueryOptions = {},
): Promise<RuntimeListResult> {
  const client = createApiClient(baseUrl, fetchImpl);
  const query: Record<string, string | undefined> = {
    search: options.search || undefined,
    sort: options.sort ? `${options.sort}:${options.direction ?? 'asc'}` : undefined,
    limit: options.limit !== undefined ? String(options.limit) : undefined,
    offset: options.offset !== undefined ? String(options.offset) : undefined,
  };
  const response = await client.modules[':moduleId'].entities[':entityId'].records.$get({
    param: { moduleId, entityId },
    query,
  });
  const payload = await response.json() as Partial<RuntimeListResult>;
  return { items: payload.items ?? [], total: payload.total ?? 0, limit: payload.limit ?? 0, offset: payload.offset ?? 0 };
}

export async function createRecord(
  fetchImpl: ApiFetch,
  baseUrl: string,
  moduleId: string,
  entityId: string,
  data: Record<string, unknown>,
): Promise<Response> {
  const client = createApiClient(baseUrl, fetchImpl);
  return client.modules[':moduleId'].entities[':entityId'].records.$post({ param: { moduleId, entityId }, json: { data } });
}

export async function updateRecord(
  fetchImpl: ApiFetch,
  baseUrl: string,
  moduleId: string,
  entityId: string,
  recordId: string,
  data: Record<string, unknown>,
  version: number,
): Promise<Response> {
  const client = createApiClient(baseUrl, fetchImpl);
  return client.modules[':moduleId'].entities[':entityId'].records[':recordId'].$patch({
    param: { moduleId, entityId, recordId },
    json: { data, version },
  });
}

export async function deleteRecord(
  fetchImpl: ApiFetch,
  baseUrl: string,
  moduleId: string,
  entityId: string,
  recordId: string,
): Promise<Response> {
  const client = createApiClient(baseUrl, fetchImpl);
  return client.modules[':moduleId'].entities[':entityId'].records[':recordId'].$delete({ param: { moduleId, entityId, recordId } });
}

export async function getRecord(
  fetchImpl: ApiFetch,
  baseUrl: string,
  moduleId: string,
  entityId: string,
  recordId: string,
): Promise<RuntimeRecord | undefined> {
  const client = createApiClient(baseUrl, fetchImpl);
  const response = await client.modules[':moduleId'].entities[':entityId'].records[':recordId'].$get({
    param: { moduleId, entityId, recordId },
  });
  if (!response.ok) return undefined;
  return await response.json() as RuntimeRecord;
}

export async function loadActivity(
  fetchImpl: ApiFetch,
  baseUrl: string,
  moduleId: string,
  entityId: string,
  recordId: string,
): Promise<RuntimeActivityEntry[]> {
  const client = createApiClient(baseUrl, fetchImpl);
  const response = await client.modules[':moduleId'].entities[':entityId'].records[':recordId'].activity.$get({
    param: { moduleId, entityId, recordId },
  });
  const payload = await response.json() as { items?: RuntimeActivityEntry[] };
  return payload.items ?? [];
}

export async function listRelationLinks(
  fetchImpl: ApiFetch,
  baseUrl: string,
  moduleId: string,
  entityId: string,
  recordId: string,
  relationId: string,
): Promise<RuntimeRecord[]> {
  const client = createApiClient(baseUrl, fetchImpl);
  const response = await client.modules[':moduleId'].entities[':entityId'].records[':recordId'].relations[':relationId'].$get({
    param: { moduleId, entityId, recordId, relationId },
  });
  const payload = await response.json();
  return Array.isArray(payload) ? payload as RuntimeRecord[] : [];
}

export async function createRelationLink(
  fetchImpl: ApiFetch,
  baseUrl: string,
  moduleId: string,
  entityId: string,
  recordId: string,
  relationId: string,
  targetRecordId: string,
): Promise<Response> {
  const client = createApiClient(baseUrl, fetchImpl);
  return client.modules[':moduleId'].entities[':entityId'].records[':recordId'].relations[':relationId'][':targetRecordId'].$post({
    param: { moduleId, entityId, recordId, relationId, targetRecordId },
  });
}

export async function deleteRelationLink(
  fetchImpl: ApiFetch,
  baseUrl: string,
  moduleId: string,
  entityId: string,
  recordId: string,
  relationId: string,
  targetRecordId: string,
): Promise<Response> {
  const client = createApiClient(baseUrl, fetchImpl);
  return client.modules[':moduleId'].entities[':entityId'].records[':recordId'].relations[':relationId'][':targetRecordId'].$delete({
    param: { moduleId, entityId, recordId, relationId, targetRecordId },
  });
}
