import type { Principal } from '@nexa/meta';

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
