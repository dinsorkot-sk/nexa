import 'dotenv/config';
import { resolve } from 'node:path';

export interface EngineConfig {
  /** null = in-memory databases (tests) */
  dataDir: string | null;
  tenants: ReadonlySet<string>;
  modules: string[];
  devAuth: boolean;
}

const list = (v: string | undefined, fallback: string): string[] =>
  (v ?? fallback).split(',').map((s) => s.trim()).filter(Boolean);

export function loadEngineConfig(env: NodeJS.ProcessEnv = process.env): EngineConfig {
  const dir = env.NEXA_DATA_DIR ?? './data';
  return {
    dataDir: dir === ':memory:' ? null : resolve(dir),
    tenants: new Set(list(env.NEXA_TENANTS, 'dev')),
    modules: list(env.NEXA_MODULES, 'base'),
    devAuth: env.NEXA_DEV_AUTH === '1' && env.NODE_ENV !== 'production',
  };
}
