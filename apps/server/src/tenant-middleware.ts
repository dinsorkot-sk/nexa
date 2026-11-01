import type { Context, Next } from 'hono';
import { runWithTenant, setTenantOnRequest } from '@nexa/core/db';
import type { Tenant } from '@nexa/types';

export type TenantResolver = (slug: string) => Promise<Tenant | null>;

export function tenantMiddleware(resolve: TenantResolver) {
  return async (c: Context, next: Next) => {
    const header = c.req.header('x-tenant-slug');
    let slug: string | null = null;
    if (header) slug = header;
    else {
      const host = c.req.header('host') ?? '';
      const first = host.split(':')[0].split('.')[0];
      if (first && first !== 'localhost' && first !== '127') slug = first;
    }
    if (!slug) {
      return c.json({ error: 'tenant not resolved' }, 400);
    }
    const tenant = await resolve(slug);
    if (!tenant) {
      return c.json({ error: 'tenant not resolved' }, 400);
    }
    if (tenant.status !== 'active') {
      return c.json({ error: 'tenant not active' }, 403);
    }
    const ctx = setTenantOnRequest(tenant);
    await runWithTenant(ctx, () => next());
  };
}