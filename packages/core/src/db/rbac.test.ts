import { describe, it, expect } from 'vitest';
import type { MetaPermission } from '@nexa/types';
import { canPerform, readableFields, writableFields, findPermission } from './rbac';

const perm: MetaPermission = {
  id: '1', entityId: 'e1', role: 'admin',
  canCreate: true, canRead: true, canUpdate: true, canDelete: false,
  fieldRules: { name: { read: true, write: true }, secret: { read: false, write: false } },
  rowFilter: null, createdAt: '',
};

describe('rbac', () => {
  it('canPerform checks action flags', () => {
    expect(canPerform(perm, 'delete')).toBe(false);
    expect(canPerform(perm, 'create')).toBe(true);
    expect(canPerform(undefined, 'read')).toBe(false);
  });

  it('readableFields filters by fieldRules', () => {
    expect(readableFields(perm, ['name', 'secret'])).toEqual(['name']);
  });

  it('writableFields filters by fieldRules', () => {
    expect(writableFields(perm, ['name', 'secret'])).toEqual(['name']);
  });

  it('findPermission by role', () => {
    expect(findPermission([perm], 'admin')?.id).toBe('1');
    expect(findPermission([perm], 'viewer')).toBeUndefined();
  });
});