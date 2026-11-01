import { AsyncLocalStorage } from 'async_hooks';
import type { Tenant } from '@nexa/types';

export interface TenantContext {
  tenant: Tenant;
  namespace: string;
}

const storage = new AsyncLocalStorage<TenantContext>();

export function runWithTenant<T>(ctx: TenantContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}

export function requireTenantContext(): TenantContext {
  const ctx = storage.getStore();
  if (!ctx) throw new Error('No tenant context in current async scope');
  return ctx;
}

export function setTenantOnRequest(tenant: Tenant): TenantContext {
  return { tenant, namespace: tenant.schemaName };
}