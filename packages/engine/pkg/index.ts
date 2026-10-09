import type { ModuleDefinition, ModulePackage } from '../../meta/src/index';

/** Compares two semantic versions; returns negative when a < b, positive when a > b, 0 when equal. */
export function compareVersions(a: string, b: string): number {
  const parse = (version: string) => version.split('.').map((part) => Number.parseInt(part, 10));
  const [aMajor, aMinor, aPatch] = parse(a);
  const [bMajor, bMinor, bPatch] = parse(b);
  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return aPatch - bPatch;
}

export function isUpgrade(currentVersion: string, incomingVersion: string): boolean {
  return compareVersions(incomingVersion, currentVersion) > 0;
}

/** Builds the package payload from a module and its definitions; caller validates with ModulePackageSchema. */
export function buildPackage(manifest: { moduleId: string; version: string; dependencies: ModuleDefinition['dependencies'] }, pkg: Omit<ModulePackage, 'manifest'>): ModulePackage {
  return {
    manifest: {
      formatVersion: 1,
      moduleId: manifest.moduleId,
      version: manifest.version,
      dependencies: manifest.dependencies.map((dependency) => ({ moduleId: dependency.moduleId, version: dependency.version })),
      exportedAt: new Date().toISOString(),
    },
    ...pkg,
  };
}
