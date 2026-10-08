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

  it('denies by default for unknown roles and empty principals', () => {
    expect(hasPlatformPermission({ roleIds: ['ghost'] }, 'record:read')).toBe(false);
    expect(hasPlatformPermission({ roleIds: [] }, 'record:read')).toBe(false);
  });
});
