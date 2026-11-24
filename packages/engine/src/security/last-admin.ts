import { ValidationError, type Registry, type SqlDriver } from '../contracts/index.js';

const adminStateModels = new Set(['res.users', 'res.groups']);

/**
 * Prevents concurrent changes from removing every active Settings administrator.
 * The lock is tenant-local and held by the current transaction through commit.
 */
export async function beginAdminStateChange(
  db: SqlDriver,
  registry: Registry,
  model: string,
  fields: Iterable<string>,
  deleting = false,
): Promise<number | null> {
  const changed = new Set(fields);
  const affectsDirectAdmin = adminStateModels.has(model) && (deleting || (model === 'res.users'
    ? changed.has('active') || changed.has('group_ids')
    : changed.has('code') || changed.has('implied_ids')));
  const adminRelations = new Set([
    registry.models.get('res.users')?.fields.get('group_ids')?.relationTable,
    registry.models.get('res.groups')?.fields.get('implied_ids')?.relationTable,
  ].filter((table): table is string => !!table));
  const relationMutation = [...changed].some((fieldName) => {
    const field = registry.models.get(model)?.fields.get(fieldName);
    return field?.type === 'many2many' && !!field.relationTable && adminRelations.has(field.relationTable);
  });
  const cascadeIntoAdmin = deleting && cascadeCanReachSecurityModel(registry, model);
  const affectsAdmins = affectsDirectAdmin || relationMutation || cascadeIntoAdmin;
  if (!affectsAdmins) return null;

  return lockAndCountAdmins(db);
}

/** Find direct and transitive FK ancestors whose deletion can cascade into a security record. */
function cascadeCanReachSecurityModel(registry: Registry, deletedModel: string): boolean {
  const cascadeAncestors = new Set(['res.users', 'res.groups']);
  let changed = true;
  while (changed) {
    changed = false;
    for (const protectedModel of [...cascadeAncestors]) {
      for (const field of registry.models.get(protectedModel)?.fields.values() ?? []) {
        if (field.type !== 'many2one' || field.ondelete !== 'cascade' || !field.comodel || cascadeAncestors.has(field.comodel)) continue;
        cascadeAncestors.add(field.comodel);
        changed = true;
      }
    }
  }
  return cascadeAncestors.has(deletedModel);
}

/** Call after the protected mutation, before its transaction commits. */
export async function assertAdminRemains(db: SqlDriver, previousCount: number | null): Promise<void> {
  if (previousCount === null || previousCount === 0) return;
  if (await countSettingsAdmins(db) === 0) {
    throw new ValidationError('The last active Settings administrator cannot be removed');
  }
}

/** Module uninstall can bypass ORM deletion by dropping a security table directly. */
export async function assertSecurityTablesMayBeDropped(
  db: SqlDriver, tables: readonly string[], columns: readonly string[] = [],
): Promise<void> {
  const protectedTables = new Set(['res_users', 'res_groups', 'res_groups_users_rel', 'res_groups_implied_rel']);
  const protectedColumns = new Set(['res_users.active', 'res_users.group_ids', 'res_groups.code', 'res_groups.implied_ids']);
  if (!tables.some((table) => protectedTables.has(table)) && !columns.some((column) => protectedColumns.has(column))) return;
  const previousCount = await lockAndCountAdmins(db);
  if (previousCount !== null && previousCount > 0) {
    throw new ValidationError('Cannot uninstall security tables while active Settings administrators exist');
  }
}

async function lockAndCountAdmins(db: SqlDriver): Promise<number | null> {
  const [tables] = await db.query<{ users: string | null; groups: string | null; memberships: string | null; implied: string | null }>({
    text: `SELECT to_regclass('res_users')::text AS users,
                  to_regclass('res_groups')::text AS groups,
                  to_regclass('res_groups_users_rel')::text AS memberships,
                  to_regclass('res_groups_implied_rel')::text AS implied`,
    params: [],
  });
  if (!tables?.users || !tables.groups || !tables.memberships || !tables.implied) return null;
  await db.query({
    text: 'LOCK TABLE "res_users", "res_groups", "res_groups_users_rel", "res_groups_implied_rel" IN SHARE ROW EXCLUSIVE MODE',
    params: [],
  });
  return countSettingsAdmins(db);
}

async function countSettingsAdmins(db: SqlDriver): Promise<number> {
  const [row] = await db.query<{ count: number }>({
    text: `WITH RECURSIVE groups_that_imply_roles(id, role_code) AS (
             SELECT id, code FROM res_groups WHERE code IN ('base.group_system', 'base.group_erp_manager')
             UNION
             SELECT rel.gid, implied.role_code FROM res_groups_implied_rel rel
               JOIN groups_that_imply_roles implied ON implied.id = rel.hid
           ), protected_users AS (
             SELECT users.id
           FROM res_users users
           JOIN res_groups_users_rel memberships ON memberships.uid = users.id
           JOIN groups_that_imply_roles role ON role.id = memberships.gid
           WHERE users.id > 1 AND users.active IS TRUE
           GROUP BY users.id
           HAVING COUNT(DISTINCT role.role_code) = 2
           ) SELECT COUNT(*)::int AS count FROM protected_users`,
    params: [],
  });
  return row.count;
}
