import type { FieldSpec } from '@nexa/types';
import { fixtureModules, fixtureVehicleEntity, fixtureDriverEntity, fixtureMaintenanceEntity, fixtureFuelEntity } from '../data/fixtures';

export interface EntityMeta {
  id: string;
  module: string;
  name: string;
  label: string;
  tableName: string;
  displayField: string;
  statusField?: string;
  fields: FieldSpec[];
  recordCount: number;
}

export interface ModuleMeta {
  id: string;
  key: string;
  name: string;
  icon: string;
  description: string;
  version: string;
  status: 'draft' | 'review' | 'published' | 'enabled' | 'disabled' | 'archived';
  entities: EntityMeta[];
}

/**
 * Foundation metadata comes from fixtures (design phase UI-0..UI-3).
 * Phase 5 replaces this with GET /api/metadata (modules → entities → fields → views)
 * cached with ETag.
 */
export function useMetadata() {
  const modules = useState<ModuleMeta[]>('metadata:modules', () => fixtureModules());

  function moduleByKey(key: string) {
    return modules.value.find((m) => m.key === key) ?? null;
  }

  function entity(moduleKey: string, entityName: string) {
    const mod = moduleByKey(moduleKey);
    return mod?.entities.find((e) => e.name === entityName) ?? null;
  }

  const allEntities = computed(() => modules.value.flatMap((m) => m.entities));

  function recordLabel(entityName: string, id: string): string {
    const entity = allEntities.value.find((e) => e.name === entityName);
    const rec = entity?.records.find((r) => r.id === id);
    if (!rec || !entity) return id;
    return String(rec[entity.displayField] ?? rec.code ?? id);
  }

  function recordIds(entityName: string, query: string, limit = 10) {
    const entity = allEntities.value.find((e) => e.name === entityName);
    if (!entity) return [];
    const q = query.trim().toLowerCase();
    return entity.records
      .filter((r) => !q || String(r[entity.displayField] ?? r.code ?? '').toLowerCase().includes(q))
      .slice(0, limit)
      .map((r) => ({ id: r.id, label: String(r[entity.displayField] ?? r.code ?? r.id) }));
  }

  return {
    modules: readonly(modules),
    moduleByKey,
    entity,
    recordLabel,
    recordIds,
    vehicle: fixtureVehicleEntity(),
    driver: fixtureDriverEntity(),
    maintenance: fixtureMaintenanceEntity(),
    fuel: fixtureFuelEntity(),
  };
}
