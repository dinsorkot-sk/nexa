import type { ModuleDefinition, ModuleOverride, MigrationJob, JobStatus } from '@nexa/types';

export interface ModuleRegistryStore {
  list(tenantId: string): Promise<{ name: string; version: string }[]>;
  upsert(tenantId: string, name: string, version: string): Promise<void>;
}

/** Merge a view override onto a base view (shallow merge config). */
export function mergeViewOverride(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  return { ...base, ...override, config: { ...(base.config as Record<string, unknown> ?? {}), ...(override.config as Record<string, unknown> ?? {}) } };
}

/** Check if a module needs upgrade. */
export function needsUpgrade(installed: string | undefined, available: string): boolean {
  if (!installed) return true;
  return installed !== available;
}

/** Job runner: runs a task per tenant, isolating failures. */
export class JobRunner {
  private jobs: MigrationJob[] = [];

  async runAcrossTenants<T>(
    tenants: string[],
    task: (tenantId: string) => Promise<T>,
  ): Promise<MigrationJob[]> {
    const results: MigrationJob[] = [];
    for (const tenantId of tenants) {
      const job: MigrationJob = {
        id: `${Date.now()}-${tenantId}`,
        tenantId,
        moduleId: 'migration',
        fromVersion: '',
        toVersion: '',
        status: 'running',
        startedAt: new Date().toISOString(),
        finishedAt: null,
        error: null,
      };
      try {
        await task(tenantId);
        job.status = 'completed';
      } catch (err) {
        job.status = 'failed';
        job.error = err instanceof Error ? err.message : String(err);
      }
      job.finishedAt = new Date().toISOString();
      results.push(job);
    }
    this.jobs.push(...results);
    return results;
  }

  getJobs(): MigrationJob[] {
    return this.jobs;
  }

  getStatus(tenantId: string): JobStatus {
    const job = this.jobs.filter((j) => j.tenantId === tenantId).pop();
    return job?.status ?? 'pending';
  }
}

export type { ModuleDefinition, ModuleOverride, MigrationJob, JobStatus };