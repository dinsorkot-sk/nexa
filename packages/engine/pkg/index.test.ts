import { describe, expect, it } from 'vitest';
import type { ModuleDefinition } from '@nexa/meta';
import { buildPackage, compareVersions, isUpgrade } from './index';

describe('version and package helpers', () => {
  it('compares semantic versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
  });

  it('detects upgrades strictly', () => {
    expect(isUpgrade('1.0.0', '1.0.1')).toBe(true);
    expect(isUpgrade('1.0.1', '1.0.0')).toBe(false);
    expect(isUpgrade('1.0.0', '1.0.0')).toBe(false);
  });

  it('builds a package with a v1 manifest and export timestamp', () => {
    const module: ModuleDefinition = {
      id: 'fleet',
      tenantId: 'tenant-1',
      owner: { id: 'user-1', type: 'user' },
      name: 'fleet',
      description: '',
      version: '1.2.0',
      status: 'draft',
      settings: {},
      dependencies: [{ moduleId: 'core', version: '1.0.0' }],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const pkg = buildPackage(
      { moduleId: 'fleet', version: '1.2.0', dependencies: [{ moduleId: 'core', version: '1.0.0' }] },
      {
        module,
        entities: [], fields: [], relations: [], views: [], forms: [],
        workflows: [], actions: [], automations: [], reports: [], dashboards: [],
      },
    );
    expect(pkg.manifest).toMatchObject({ formatVersion: 1, moduleId: 'fleet', version: '1.2.0' });
    expect(pkg.manifest.dependencies).toEqual([{ moduleId: 'core', version: '1.0.0' }]);
    expect(typeof pkg.manifest.exportedAt).toBe('string');
  });
});
