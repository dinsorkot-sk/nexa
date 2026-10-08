import type { Principal } from '@nexa/meta';

export const platformPermissions = [
  'module:read', 'module:write',
  'definition:read', 'definition:write',
  'record:read', 'record:write',
] as const;
export type PlatformPermission = typeof platformPermissions[number];

const rolePermissions: Readonly<Record<string, readonly PlatformPermission[]>> = {
  admin: platformPermissions,
  administrator: platformPermissions,
  owner: platformPermissions,
  editor: ['module:read', 'module:write', 'definition:read', 'definition:write', 'record:read', 'record:write'],
  member: ['module:read', 'definition:read', 'record:read', 'record:write'],
  viewer: ['module:read', 'definition:read', 'record:read'],
};

/** Default-deny platform permission check for the first RBAC release. */
export function hasPlatformPermission(principal: Pick<Principal, 'roleIds'>, permission: PlatformPermission): boolean {
  return principal.roleIds.some((roleId) => rolePermissions[roleId]?.includes(permission) ?? false);
}
