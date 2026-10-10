import { describe, expect, it } from 'vitest';
import { hasPlatformPermission } from './index';

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
