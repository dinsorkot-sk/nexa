import 'dotenv/config';
import { resolve } from 'node:path';

export interface EngineConfig {
  /** database backend: embedded PGlite (one data dir per tenant) or a PostgreSQL server (one database per tenant) */
  db: 'pglite' | 'postgres';
  /** PostgreSQL admin connection string (db = 'postgres' only); tenant databases are created through it */
  pgUrl: string | null;
  /** null = in-memory databases (tests); PGlite only */
  dataDir: string | null;
  tenants: ReadonlySet<string>;
  modules: string[];
  devAuth: boolean;
  portalModels: ReadonlySet<string>;
}

const list = (v: string | undefined, fallback: string): string[] =>
  (v ?? fallback).split(',').map((s) => s.trim()).filter(Boolean);

export function loadEngineConfig(env: NodeJS.ProcessEnv = process.env): EngineConfig {
  const dir = env.NEXA_DATA_DIR ?? './data';
  const db = env.NEXA_DB?.trim() || 'pglite';
  if (db !== 'pglite' && db !== 'postgres') throw new Error(`NEXA_DB must be 'pglite' or 'postgres', got '${db}'`);
  let pgUrl: string | null = null;
  if (db === 'postgres') {
    const raw = env.NEXA_PG_URL?.trim();
    if (!raw) throw new Error('NEXA_PG_URL is required when NEXA_DB=postgres');
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new Error('NEXA_PG_URL is not a valid URL');
    }
    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') throw new Error('NEXA_PG_URL must start with postgres:// or postgresql://');
    pgUrl = raw;
  }
  return {
    db,
    pgUrl,
    dataDir: dir === ':memory:' ? null : resolve(dir),
    tenants: new Set(list(env.NEXA_TENANTS, 'dev')),
    modules: list(env.NEXA_MODULES, 'base'),
    devAuth: env.NEXA_DEV_AUTH === '1' && env.NODE_ENV !== 'production',
    portalModels: new Set(list(env.NEXA_PORTAL_MODELS, '')),
  };
}
