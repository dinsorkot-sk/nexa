import type { Recordset } from '../contracts/index.js';
import type { EnvImpl } from '../orm/env.js';
import { assertSystem } from '../services/common.js';
import { compileLifecycle, markPolicyDirty, type LifecycleRow } from './lifecycle.js';

/**
 * Constraint of `ir.lifecycle`: system-only, and every saved row must compile strictly (model exists,
 * is concrete and not protected; state / writable / transition-only / engine / frozen-children fields
 * exist and are well-formed). Also drops the tenant's compiled policy index: it is rebuilt on the next
 * guarded operation (and not cached until this transaction has ended, see policyIndex).
 */
export async function checkLifecycleRecords(records: Recordset): Promise<void> {
  const env = records.env as EnvImpl;
  await assertSystem(env);
  const rows = await env.db.query<LifecycleRow>({
    text: `SELECT id, model, state_field, initial_state, locks, transition_only, engine_fields, active
      FROM ir_lifecycle WHERE id = ANY($1) ORDER BY id`,
    params: [[...records.ids]],
  });
  markPolicyDirty(env);
  for (const row of rows) compileLifecycle(env.registry, row, true);
}
