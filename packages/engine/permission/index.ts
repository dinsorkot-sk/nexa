import type { PermissionDefinition, PermissionResource, Principal } from '@nexa/meta';

export const platformPermissions = [
  'module:read', 'module:write',
  'definition:read', 'definition:write',
  'record:read', 'record:write',
  'workflow:transition', 'action:execute', 'automation:manage', 'report:read', 'report:manage',
  'member:manage', 'org:manage',
] as const;
export type PlatformPermission = typeof platformPermissions[number];

/** Owner-only: organization settings. Admin receives everything else. */
const ownerOnlyPermissions: readonly PlatformPermission[] = ['org:manage'];
const adminPermissions = platformPermissions.filter((permission) => !ownerOnlyPermissions.includes(permission));

const rolePermissions: Readonly<Record<string, readonly PlatformPermission[]>> = {
  owner: platformPermissions,
  admin: adminPermissions,
  member: ['module:read', 'definition:read', 'record:read', 'record:write', 'workflow:transition', 'action:execute', 'automation:manage', 'report:read', 'report:manage'],
  viewer: ['module:read', 'definition:read', 'record:read'],
};

/** Default-deny platform permission check for the first RBAC release. */
export function hasPlatformPermission(principal: Pick<Principal, 'roleIds'>, permission: PlatformPermission): boolean {
  return principal.roleIds.some((roleId) => rolePermissions[roleId]?.includes(permission) ?? false);
}

/** A request that a module's own permission definitions are matched against. */
export interface ModulePermissionRequest {
  /** What the request touches. */
  resource: PermissionResource;
  /** What the request does to it. */
  action: string;
}

/**
 * Whether a role may do the action to the resource inside a module that carries these permission definitions.
 *
 * The platform's role matrix is the ceiling: a module can narrow what a role may do, never widen it, so a
 * definition only ever removes an action the platform already allows. A module that says nothing about the
 * resource leaves the platform's answer alone, which is what keeps a module without permission definitions
 * behaving exactly as it did before.
 *
 * The condition on a definition is not evaluated. It is a per-record condition, and a list request has no
 * record to weigh it against.
 */
export function hasModulePermission(
  roleIds: readonly string[],
  permissions: readonly PermissionDefinition[],
  request: ModulePermissionRequest,
): boolean {
  const covering = permissions.filter((permission) => {
    if (!roleIds.includes(permission.roleId)) return false;
    const resource = permission.resource;
    if (resource.type === 'module') return true;
    if (resource.type !== request.resource.type) return false;
    return resource.id === undefined || resource.id === request.resource.id;
  });
  if (covering.length === 0) return true;
  return covering.some((permission) => permission.actions.includes(request.action));
}
