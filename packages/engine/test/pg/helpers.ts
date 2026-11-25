import { randomBytes } from 'node:crypto';
import { inject } from 'vitest';
import { PgTenantManager, type PgTenantManagerOptions } from '../../src/tenant/pg.js';
import { PgDriver } from '../../src/driver/pg.js';

/** Admin URL of the test server, or null when the real-PostgreSQL suite is skipped. */
export const pgUrl: string | null = inject('pgUrl');

/** Unique database-name prefix, so test files sharing one server never collide. */
export function uniquePrefix(): string {
  return `t${randomBytes(5).toString('hex')}_`;
}

export function pgManager(opts: Omit<PgTenantManagerOptions, 'url'> = {}): PgTenantManager {
  if (!pgUrl) throw new Error('PostgreSQL test server is not available');
  return new PgTenantManager({ url: pgUrl, dbPrefix: uniquePrefix(), poolMax: 6, ...opts });
}

/** A second, independent pool on the same tenant database (another "process"). */
export function secondDriver(manager: PgTenantManager, tenant: string): Promise<PgDriver> {
  const u = new URL(pgUrl!);
  u.pathname = `/${manager.databaseName(tenant)}`;
  return PgDriver.open({ connectionString: u.toString(), max: 4 });
}

/** Resolves after `ms`. */
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 'pending' if the promise has not settled within `ms`, else its outcome. */
export async function settledWithin<T>(p: Promise<T>, ms: number): Promise<'pending' | { ok: true; value: T } | { ok: false; error: unknown }> {
  const marker = Symbol('pending');
  const r = await Promise.race([
    p.then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error })),
    sleep(ms).then(() => marker),
  ]);
  return r === marker ? 'pending' : r as { ok: true; value: T } | { ok: false; error: unknown };
}

/** A manually opened gate. */
export function gate(): { wait: Promise<void>; open: () => void } {
  let open!: () => void;
  const wait = new Promise<void>((r) => (open = r));
  return { wait, open };
}
