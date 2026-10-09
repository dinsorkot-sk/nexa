import { describe, expect, it } from 'vitest';
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
    const pkg = buildPackage(
      { moduleId: 'fleet', version: '1.2.0', dependencies: [{ moduleId: 'core', version: '1.0.0' }] },
      { module: { id: 'fleet' } as never },
    );
    expect(pkg.manifest).toMatchObject({ formatVersion: 1, moduleId: 'fleet', version: '1.2.0' });
    expect(pkg.manifest.dependencies).toEqual([{ moduleId: 'core', version: '1.0.0' }]);
    expect(typeof pkg.manifest.exportedAt).toBe('string');
  });
});
