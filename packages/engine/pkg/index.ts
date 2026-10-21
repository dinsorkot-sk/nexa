import type { EntityDefinition, FieldDefinition, ModuleDefinition, ModulePackage } from '../../meta/src/index';
import { MetadataTemplateSchema } from '../../meta/src/index';

/** Compares two semantic versions; returns negative when a < b, positive when a > b, 0 when equal. */
export function compareVersions(a: string, b: string): number {
  const parse = (version: string) => version.split('.').map((part) => Number.parseInt(part, 10));
  const [aMajor, aMinor, aPatch] = parse(a);
  const [bMajor, bMinor, bPatch] = parse(b);
  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return aPatch - bPatch;
}

export function isUpgrade(currentVersion: string, incomingVersion: string): boolean {
  return compareVersions(incomingVersion, currentVersion) > 0;
}

/**
 * The content of a package. The definition arrays are optional: the ones left
 * out are empty, so a caller that only has entities and fields does not have
 * to name the other ten.
 */
export type PackageContent = Omit<ModulePackage, 'manifest' | DefinitionArray> & Partial<Pick<ModulePackage, DefinitionArray>>;

type DefinitionArray = 'entities' | 'fields' | 'relations' | 'views' | 'forms' | 'workflows' | 'actions' | 'automations' | 'reports' | 'dashboards' | 'permissions';

const emptyDefinitionArrays: Record<DefinitionArray, []> = {
  entities: [], fields: [], relations: [], views: [], forms: [], workflows: [], actions: [], automations: [], reports: [], dashboards: [], permissions: [],
};

/** Builds the package payload from a module and its definitions; caller validates with ModulePackageSchema. */
export function buildPackage(manifest: { moduleId: string; version: string; dependencies: ModuleDefinition['dependencies'] }, pkg: PackageContent): ModulePackage {
  return {
    manifest: {
      formatVersion: 1,
      moduleId: manifest.moduleId,
      version: manifest.version,
      dependencies: manifest.dependencies.map((dependency) => ({ moduleId: dependency.moduleId, version: dependency.version })),
      exportedAt: new Date().toISOString(),
    },
    ...emptyDefinitionArrays,
    ...pkg,
  };
}

/** What a template is converted into a package with: the identity the tenant chose, and who owns it. */
export interface TemplatePackageContext {
  /** The module id the module is created under. It wins over the template's own. */
  moduleId: string;
  /** The module name. Defaults to the template's. */
  name?: string;
  tenantId: string;
  owner: ModuleDefinition['owner'];
  /** The instant the module is created at, as an ISO timestamp. */
  now: string;
}

/**
 * Converts a metadata template into a module package.
 *
 * The template carries the content and the context carries the identity. The
 * fields are flattened into the package's field list, and their ids are
 * namespaced with the entity they belong to: a definition id is unique per
 * module, not per entity, and the inventory template has a field called
 * "name" on two of its entities.
 *
 * The template is parsed here, so a malformed template is refused before it
 * can become a half-built module.
 */
export function templateToPackage(template: unknown, context: TemplatePackageContext): ModulePackage {
  const parsed = MetadataTemplateSchema.parse(template);
  const fields: FieldDefinition[] = [];
  const entities: EntityDefinition[] = parsed.entities.map((entity) => {
    for (const field of entity.fields) {
      fields.push({
        id: `${entity.id}.${field.id}`,
        entityId: entity.id,
        name: field.name,
        label: field.label,
        type: field.type,
        options: field.options,
        position: field.position,
      });
    }
    return {
      id: entity.id,
      moduleId: context.moduleId,
      name: entity.name,
      label: entity.label,
      pluralLabel: entity.pluralLabel,
      description: entity.description,
      ...(entity.icon === undefined ? {} : { icon: entity.icon }),
      settings: entity.settings,
    };
  });
  const module: ModuleDefinition = {
    id: context.moduleId,
    tenantId: context.tenantId,
    owner: context.owner,
    name: context.name ?? parsed.name,
    description: parsed.description,
    version: parsed.version,
    status: 'draft',
    settings: {},
    dependencies: [],
    createdAt: context.now,
    updatedAt: context.now,
  };
  return buildPackage(
    { moduleId: module.id, version: module.version, dependencies: module.dependencies },
    { module, entities, fields, relations: parsed.relations },
  );
}
