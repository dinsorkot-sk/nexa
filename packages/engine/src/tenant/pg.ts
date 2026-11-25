import { Client } from 'pg';
import { EngineError, type SqlDriver } from '../contracts/index.js';
import { PgDriver, type PgDriverOptions } from '../driver/pg.js';
import { BaseTenantManager, validTenant, type BaseTenantManagerOptions } from './manager.js';

export interface PgTenantManagerOptions extends BaseTenantManagerOptions {
  /**
   * Server connection string for administration (CREATE DATABASE, listing), e.g.
   * postgres://nexa:secret@db:5432/postgres. Tenant connections reuse it with the database replaced.
   * The role needs CREATEDB to create tenants on first open.
   */
  url: string;
  /** prefix of tenant database names (default `nexa_`): lowercase letters, digits, underscores */
  dbPrefix?: string;
  /** pool size per tenant database (default 10) */
  poolMax?: number;
  /** extra pool options for tenant drivers (ssl, timeouts) */
  pool?: PgDriverOptions['pool'];
}

const PREFIX_RE = /^[a-z_][a-z0-9_]{0,30}$/;
/** PostgreSQL silently truncates identifiers to NAMEDATALEN-1 bytes: refuse instead of colliding. */
const MAX_DB_NAME = 63;
const DB_NAME_RE = /^[a-z_][a-z0-9_-]*$/;

/**
 * Database-per-tenant on a PostgreSQL server: tenant `acme` lives in database `<prefix>acme`, created on
 * first open. Each open tenant has its own connection pool (PgDriver) and registry.
 */
export class PgTenantManager extends BaseTenantManager {
  private readonly prefix: string;

  constructor(protected override readonly opts: PgTenantManagerOptions) {
    super(opts);
    this.prefix = opts.dbPrefix ?? 'nexa_';
    if (!PREFIX_RE.test(this.prefix)) throw new EngineError(`Invalid tenant database prefix '${this.prefix}'`);
    new URL(opts.url); // fail fast on a malformed URL
  }

  /** Database name of a tenant (validated tenant name). */
  databaseName(tenant: string): string {
    if (!validTenant(tenant)) throw new EngineError(`Invalid tenant name '${tenant}'`);
    const name = this.prefix + tenant;
    if (Buffer.byteLength(name) > MAX_DB_NAME) throw new EngineError(`Tenant name '${tenant}' is too long for a database name`);
    return name;
  }

  async list(): Promise<string[]> {
    const rows = await this.admin((c) => c.query<{ datname: string }>(
      `SELECT datname FROM pg_database WHERE left(datname, length($1)) = $1 AND datallowconn ORDER BY datname`, [this.prefix]));
    return rows.rows.map((r) => r.datname.slice(this.prefix.length)).filter(validTenant);
  }

  protected async openDriver(tenant: string): Promise<SqlDriver> {
    const db = this.databaseName(tenant);
    await this.ensureDatabase(db);
    return PgDriver.open({
      connectionString: this.urlFor(db),
      ...(this.opts.poolMax !== undefined ? { max: this.opts.poolMax } : {}),
      ...(this.opts.pool ? { pool: this.opts.pool } : {}),
    });
  }

  private urlFor(db: string): string {
    const u = new URL(this.opts.url);
    u.pathname = `/${encodeURIComponent(db)}`;
    return u.toString();
  }

  private async ensureDatabase(db: string): Promise<void> {
    await this.admin(async (c) => {
      const found = await c.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [db]);
      if (found.rowCount) return;
      try {
        // CREATE DATABASE cannot take parameters; the name is validated (prefix + tenant: [a-z0-9_-]) and quoted
        if (!DB_NAME_RE.test(db)) throw new EngineError(`Invalid database name '${db}'`);
        await c.query(`CREATE DATABASE "${db}" ENCODING 'UTF8' TEMPLATE template0`);
      } catch (err) {
        const code = (err as { code?: string }).code;
        // a concurrent opener created it first (duplicate_database, or the pg_database unique index)
        if (code !== '42P04' && code !== '23505') throw err;
      }
    });
  }

  private async admin<T>(fn: (c: Client) => Promise<T>): Promise<T> {
    const c = new Client({ connectionString: this.opts.url });
    c.on('error', () => undefined);
    await c.connect();
    try {
      return await fn(c);
    } finally {
      await c.end().catch(() => undefined);
    }
  }
}
