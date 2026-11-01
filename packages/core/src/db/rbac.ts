import type { MetaPermission } from '@nexa/types';

export type RbacAction = 'create' | 'read' | 'update' | 'delete';

export function findPermission(perms: MetaPermission[], role: string): MetaPermission | undefined {
  return perms.find((p) => p.role === role);
}

export function canPerform(perm: MetaPermission | undefined, action: RbacAction): boolean {
  if (!perm) return false;
  switch (action) {
    case 'create': return perm.canCreate;
    case 'read': return perm.canRead;
    case 'update': return perm.canUpdate;
    case 'delete': return perm.canDelete;
  }
}

export function readableFields(perm: MetaPermission | undefined, allFields: string[]): string[] {
  if (!perm) return [];
  return allFields.filter((f) => perm.fieldRules[f]?.read !== false);
}

export function writableFields(perm: MetaPermission | undefined, allFields: string[]): string[] {
  if (!perm) return [];
  return allFields.filter((f) => perm.fieldRules[f]?.write !== false);
}