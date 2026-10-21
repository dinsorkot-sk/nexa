import { describe, expect, it } from 'vitest';
import type { PermissionDefinition } from '@nexa/meta';
import { hasModulePermission, hasPlatformPermission } from './index';

describe('hasPlatformPermission', () => {
  it('grants admin every platform permission', () => {
    for (const permission of ['module:read', 'module:write', 'definition:read', 'definition:write', 'record:read', 'record:write'] as const) {
      expect(hasPlatformPermission({ roleIds: ['admin'] }, permission)).toBe(true);
    }
  });

  it('grants member record access but not module or definition writes', () => {
    expect(hasPlatformPermission({ roleIds: ['member'] }, 'record:write')).toBe(true);
    expect(hasPlatformPermission({ roleIds: ['member'] }, 'record:read')).toBe(true);
    expect(hasPlatformPermission({ roleIds: ['member'] }, 'module:write')).toBe(false);
    expect(hasPlatformPermission({ roleIds: ['member'] }, 'definition:write')).toBe(false);
  });

  it('separates owner-only organization management from admin', () => {
    expect(hasPlatformPermission({ roleIds: ['owner'] }, 'org:manage')).toBe(true);
    expect(hasPlatformPermission({ roleIds: ['admin'] }, 'org:manage')).toBe(false);
    expect(hasPlatformPermission({ roleIds: ['admin'] }, 'member:manage')).toBe(true);
    expect(hasPlatformPermission({ roleIds: ['member'] }, 'member:manage')).toBe(false);
    expect(hasPlatformPermission({ roleIds: ['viewer'] }, 'member:manage')).toBe(false);
  });

  it('grants viewer read-only access and denies every write', () => {
    expect(hasPlatformPermission({ roleIds: ['viewer'] }, 'record:read')).toBe(true);
    expect(hasPlatformPermission({ roleIds: ['viewer'] }, 'report:read')).toBe(false);
    for (const permission of ['record:write', 'module:write', 'definition:write', 'report:read', 'report:manage', 'workflow:transition', 'action:execute', 'automation:manage'] as const) {
      expect(hasPlatformPermission({ roleIds: ['viewer'] }, permission)).toBe(false);
    }
  });

  it('no longer recognises the removed editor and administrator roles', () => {
    expect(hasPlatformPermission({ roleIds: ['editor'] }, 'record:read')).toBe(false);
    expect(hasPlatformPermission({ roleIds: ['administrator'] }, 'record:read')).toBe(false);
  });

  it('denies by default for unknown roles and empty principals', () => {
    expect(hasPlatformPermission({ roleIds: ['ghost'] }, 'record:read')).toBe(false);
    expect(hasPlatformPermission({ roleIds: [] }, 'record:read')).toBe(false);
  });
});

describe('hasModulePermission', () => {
  const definition = (overrides: Partial<PermissionDefinition> & Pick<PermissionDefinition, 'roleId' | 'actions'>): PermissionDefinition => ({
    id: 'member-vehicles',
    moduleId: 'fleet',
    resource: { type: 'entity', id: 'vehicle' },
    condition: {},
    ...overrides,
  });

  it('narrows a role to the actions the module lists for the resource', () => {
    const permissions = [definition({ roleId: 'member', actions: ['read'] })];
    expect(hasModulePermission(['member'], permissions, { resource: { type: 'entity', id: 'vehicle' }, action: 'read' })).toBe(true);
    expect(hasModulePermission(['member'], permissions, { resource: { type: 'entity', id: 'vehicle' }, action: 'create' })).toBe(false);
    expect(hasModulePermission(['member'], permissions, { resource: { type: 'entity', id: 'vehicle' }, action: 'update' })).toBe(false);
  });

  it('leaves a resource the module says nothing about alone', () => {
    const permissions = [definition({ roleId: 'member', actions: ['read'] })];
    expect(hasModulePermission(['member'], permissions, { resource: { type: 'entity', id: 'invoice' }, action: 'create' })).toBe(true);
  });

  it('lets a module cover the whole module with one definition', () => {
    const permissions = [definition({ roleId: 'member', actions: ['read'], resource: { type: 'module' } })];
    expect(hasModulePermission(['member'], permissions, { resource: { type: 'entity', id: 'invoice' }, action: 'read' })).toBe(true);
    expect(hasModulePermission(['member'], permissions, { resource: { type: 'entity', id: 'invoice' }, action: 'create' })).toBe(false);
  });

  it('ignores a definition that belongs to another role', () => {
    const permissions = [definition({ roleId: 'viewer', actions: ['read'] })];
    expect(hasModulePermission(['member'], permissions, { resource: { type: 'entity', id: 'vehicle' }, action: 'create' })).toBe(true);
  });

  it('unions the definitions of every role the principal holds', () => {
    const permissions = [
      definition({ roleId: 'member', actions: ['read'] }),
      definition({ id: 'admin-vehicles', roleId: 'admin', actions: ['read', 'update'] }),
    ];
    expect(hasModulePermission(['member', 'admin'], permissions, { resource: { type: 'entity', id: 'vehicle' }, action: 'update' })).toBe(true);
  });

  it('never widens what the platform allows', () => {
    const permissions = [definition({ roleId: 'viewer', actions: ['read', 'create', 'update', 'delete'] })];
    // The module is happy to let a viewer write, and the platform is not. Both gates have to pass, so the
    // platform's answer is the one that counts.
    expect(hasModulePermission(['viewer'], permissions, { resource: { type: 'entity', id: 'vehicle' }, action: 'create' })).toBe(true);
    expect(hasPlatformPermission({ roleIds: ['viewer'] }, 'record:write')).toBe(false);
  });

  it('behaves as before for a module without permission definitions', () => {
    expect(hasModulePermission(['member'], [], { resource: { type: 'entity', id: 'vehicle' }, action: 'create' })).toBe(true);
  });
});
