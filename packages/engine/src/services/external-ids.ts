import { ValidationError, type Env } from '../contracts/index.js';
import { assertSystem, tenantDriver } from './common.js';

const MODULE_RE = /^[a-z][a-z0-9_]{0,99}$/;
const NAME_RE = /^[a-z0-9][a-z0-9_.-]{0,199}$/;

export interface ExternalIdRow { model: string; resId: number; noupdate: boolean }

/**
 * External ids (`module.name` → record) for administrator tooling such as starter packs. Settings
 * administrators only; reads and writes run in the caller's current transaction.
 */
export class ExternalIdService {
  constructor(private readonly env: Env) {}

  async lookup(module: string, name: string): Promise<ExternalIdRow | undefined> {
    await assertSystem(this.env);
    check(module, name);
    const [row] = await tenantDriver(this.env).query<{ model: string; res_id: number; noupdate: boolean }>({
      text: `SELECT model, res_id, noupdate FROM nx_model_data WHERE module = $1 AND name = $2`, params: [module, name],
    });
    return row ? { model: row.model, resId: Number(row.res_id), noupdate: row.noupdate } : undefined;
  }

  /** Point `module.name` at a record (insert or repoint). Only `pack_*` namespaces: module data stays with its module. */
  async bind(module: string, name: string, model: string, resId: number, noupdate = false): Promise<void> {
    await assertSystem(this.env);
    check(module, name);
    if (!module.startsWith('pack_')) throw new ValidationError(`External ids of '${module}' are managed by its module`);
    if (!Number.isSafeInteger(resId) || resId <= 0) throw new ValidationError('External id target must be a record id');
    await tenantDriver(this.env).query({
      text: `INSERT INTO nx_model_data (module, name, model, res_id, noupdate) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (module, name) DO UPDATE SET model = EXCLUDED.model, res_id = EXCLUDED.res_id, noupdate = EXCLUDED.noupdate`,
      params: [module, name, model, resId, noupdate],
    });
  }
}

function check(module: string, name: string): void {
  if (!MODULE_RE.test(module) || !NAME_RE.test(name)) throw new ValidationError(`Invalid external id '${module}.${name}'`);
}
