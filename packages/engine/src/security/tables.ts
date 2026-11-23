import { ValidationError, type AccessOperation, type AccessRule, type RecordRule, type SqlDriver } from '../contracts/index.js';

/**
 * Engine-owned security tables (Odoo ir.model.access / ir.rule equivalents).
 * Rows are owned by the module that declared them, so install/upgrade/uninstall can replace them.
 */
export async function ensureSecurityTables(db: SqlDriver): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query({
      text: `CREATE TABLE IF NOT EXISTS nx_access (
        id SERIAL PRIMARY KEY, module TEXT NOT NULL, model TEXT NOT NULL, group_code TEXT,
        perm_read BOOLEAN NOT NULL DEFAULT false, perm_write BOOLEAN NOT NULL DEFAULT false,
        perm_create BOOLEAN NOT NULL DEFAULT false, perm_unlink BOOLEAN NOT NULL DEFAULT false)`,
      params: [],
    });
    await tx.query({ text: `CREATE INDEX IF NOT EXISTS nx_access_model_idx ON nx_access (model)`, params: [] });
    await tx.query({
      text: `CREATE TABLE IF NOT EXISTS nx_rule (
        id SERIAL PRIMARY KEY, module TEXT NOT NULL, name TEXT NOT NULL, model TEXT NOT NULL,
        groups TEXT[] NOT NULL DEFAULT '{}', domain JSONB NOT NULL,
        perm_read BOOLEAN NOT NULL DEFAULT true, perm_write BOOLEAN NOT NULL DEFAULT true,
        perm_create BOOLEAN NOT NULL DEFAULT true, perm_unlink BOOLEAN NOT NULL DEFAULT true,
        UNIQUE (module, name))`,
      params: [],
    });
    await tx.query({ text: `CREATE INDEX IF NOT EXISTS nx_rule_model_idx ON nx_rule (model)`, params: [] });
  });
}

const OPS: AccessOperation[] = ['read', 'write', 'create', 'unlink'];

/** Replace all access rows and record rules owned by `module` (install / upgrade). */
export async function writeModuleSecurity(
  db: SqlDriver, module: string, access: readonly AccessRule[], rules: readonly RecordRule[],
): Promise<void> {
  for (const r of rules) {
    if (typeof r.domain === 'string') {
      throw new ValidationError(`Record rule '${module}.${r.name}': expression domains need the sandbox (D4); use a JSON domain`);
    }
  }
  await db.transaction(async (tx) => {
    await removeModuleSecurity(tx, module);
    for (const a of access) {
      await tx.query({
        text: `INSERT INTO nx_access (module, model, group_code, perm_read, perm_write, perm_create, perm_unlink)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        params: [module, a.model, a.group, ...OPS.map((op) => !!a.perms[op])],
      });
    }
    for (const r of rules) {
      await tx.query({
        text: `INSERT INTO nx_rule (module, name, model, groups, domain, perm_read, perm_write, perm_create, perm_unlink)
               VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)`,
        params: [module, r.name, r.model, r.groups, JSON.stringify(r.domain), ...OPS.map((op) => !!r.perms[op])],
      });
    }
  });
}

/** Remove everything `module` declared (uninstall). */
export async function removeModuleSecurity(db: SqlDriver, module: string): Promise<void> {
  await db.query({ text: `DELETE FROM nx_access WHERE module = $1`, params: [module] });
  await db.query({ text: `DELETE FROM nx_rule WHERE module = $1`, params: [module] });
}
