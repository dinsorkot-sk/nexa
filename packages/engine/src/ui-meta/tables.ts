import {
  ValidationError, type ActionDef, type MenuDef, type ResolvedModel, type SqlDriver, type ViewDef, type ViewNode,
} from '../contracts/index.js';
import { parseSelector } from './arch.js';

/**
 * UI metadata tables (Odoo ir.ui.view / ir.actions / ir.ui.menu), owned per module like security.
 * External ids are stored fully qualified ('module.name'); a bare id gets the module prefix.
 */
export async function ensureUiTables(db: SqlDriver): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query({
      text: `CREATE TABLE IF NOT EXISTS nx_view (
        id SERIAL PRIMARY KEY, module TEXT NOT NULL, xml_id TEXT NOT NULL UNIQUE, model TEXT NOT NULL,
        type TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 16, arch JSONB, inherit_from TEXT,
        patches JSONB, groups TEXT[] NOT NULL DEFAULT '{}')`,
      params: [],
    });
    await tx.query({ text: `CREATE INDEX IF NOT EXISTS nx_view_model_idx ON nx_view (model, type)`, params: [] });
    await tx.query({
      text: `CREATE TABLE IF NOT EXISTS nx_action (
        id SERIAL PRIMARY KEY, module TEXT NOT NULL, xml_id TEXT NOT NULL UNIQUE, type TEXT NOT NULL, name TEXT NOT NULL,
        model TEXT, view_types TEXT[], domain JSONB, context JSONB, code TEXT)`,
      params: [],
    });
    await tx.query({
      text: `CREATE TABLE IF NOT EXISTS nx_menu (
        id SERIAL PRIMARY KEY, module TEXT NOT NULL, xml_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        parent TEXT, action TEXT, sequence INTEGER NOT NULL DEFAULT 10, groups TEXT[] NOT NULL DEFAULT '{}')`,
      params: [],
    });
  });
}

const XMLID_RE = /^[a-z][a-z0-9_]*\.[a-z0-9_]+$/;
const BARE_RE = /^[a-z0-9_]+$/;
const VIEW_TYPES = new Set(['list', 'form', 'kanban', 'search', 'calendar', 'pivot', 'graph']);
const ACTION_TYPES = new Set(['window', 'server', 'url', 'report', 'client']);

export function qualify(module: string, xmlId: string): string {
  if (XMLID_RE.test(xmlId)) return xmlId;
  if (BARE_RE.test(xmlId)) return `${module}.${xmlId}`;
  throw new ValidationError(`Invalid external id '${xmlId}'`);
}

/** Ids a module DEFINES must be in its own namespace (refs to other modules stay allowed). */
export function qualifyOwn(module: string, xmlId: string): string {
  const q = qualify(module, xmlId);
  if (!q.startsWith(`${module}.`)) throw new ValidationError(`Module '${module}' cannot define '${xmlId}' in another module's namespace`);
  return q;
}

/** Check that every `field` node names a field of `model` (catches typos at install time). */
function checkArch(node: ViewNode, model: ResolvedModel, where: string): void {
  if (!node || typeof node.tag !== 'string') throw new ValidationError(`${where}: malformed view node`);
  checkGroupsAttr(node.attrs, where);
  if (node.tag === 'field') {
    const name = node.attrs?.name;
    if (typeof name !== 'string' || !model.fields.has(name)) {
      throw new ValidationError(`${where}: unknown field '${String(name)}' on '${model.name}'`);
    }
  }
  for (const c of node.children ?? []) checkArch(c, model, where);
}

/** Replace the views, actions and menus owned by `module` (install / upgrade). */
export async function writeModuleUi(
  db: SqlDriver, module: string, models: ReadonlyMap<string, ResolvedModel>,
  views: readonly ViewDef[], actions: readonly ActionDef[], menus: readonly MenuDef[],
): Promise<void> {
  for (const v of views) {
    const where = `View '${v.xmlId}'`;
    const m = models.get(v.model);
    if (!m) throw new ValidationError(`${where}: unknown model '${v.model}'`);
    if (!VIEW_TYPES.has(v.type)) throw new ValidationError(`${where}: unknown type '${v.type}'`);
    if (!!v.arch === !!v.inherit) throw new ValidationError(`${where}: needs exactly one of arch or inherit`);
    if (v.arch) checkArch(v.arch, m, where);
    for (const p of v.inherit?.patches ?? []) {
      parseSelector(p.target);
      checkGroupsAttr(p.attrs, where);
      if (p.node) checkArch(p.node, m, where);
    }
  }
  for (const a of actions) {
    if (!ACTION_TYPES.has(a.type)) throw new ValidationError(`Action '${a.xmlId}': unknown type '${a.type}'`);
    if (a.type === 'window' && (!a.model || !models.has(a.model))) {
      throw new ValidationError(`Action '${a.xmlId}': window actions need a known model`);
    }
    if (a.code !== undefined) {
      // stored only; executed exclusively by ServerActionService in the QuickJS sandbox as the caller
      if (a.type !== 'server') throw new ValidationError(`Action '${a.xmlId}': only server actions carry code`);
      if (typeof a.code !== 'string' || !a.code.trim() || a.code.length > 50_000) {
        throw new ValidationError(`Action '${a.xmlId}': server code must contain 1 to 50000 characters`);
      }
      if (a.model !== undefined && !models.has(a.model)) throw new ValidationError(`Action '${a.xmlId}': unknown model '${a.model}'`);
    }
  }
  await db.transaction(async (tx) => {
    await removeModuleUi(tx, module);
    for (const v of views) {
      await tx.query({
        text: `INSERT INTO nx_view (module, xml_id, model, type, priority, arch, inherit_from, patches, groups)
               VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9)`,
        params: [
          module, qualifyOwn(module, v.xmlId), v.model, v.type, v.priority ?? 16,
          v.arch ? JSON.stringify(v.arch) : null,
          v.inherit ? qualify(module, v.inherit.from) : null,
          v.inherit ? JSON.stringify(v.inherit.patches) : null, v.groups ?? [],
        ],
      });
    }
    for (const a of actions) {
      await tx.query({
        text: `INSERT INTO nx_action (module, xml_id, type, name, model, view_types, domain, context, code)
               VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)`,
        params: [
          module, qualifyOwn(module, a.xmlId), a.type, a.name, a.model ?? null, a.viewTypes ?? null,
          a.domain ? JSON.stringify(a.domain) : null, a.context ? JSON.stringify(a.context) : null, a.code ?? null,
        ],
      });
    }
    for (const m of menus) {
      await tx.query({
        text: `INSERT INTO nx_menu (module, xml_id, name, parent, action, sequence, groups) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        params: [
          module, qualifyOwn(module, m.xmlId), m.name, m.parent ? qualify(module, m.parent) : null,
          m.action ? qualify(module, m.action) : null, m.sequence ?? 10, m.groups ?? [],
        ],
      });
    }
  });
}

export async function removeModuleUi(db: SqlDriver, module: string): Promise<void> {
  for (const t of ['nx_view', 'nx_action', 'nx_menu']) {
    await db.query({ text: `DELETE FROM ${t} WHERE module = $1`, params: [module] });
  }
}

/** `attrs.groups` must be a list of qualified group codes (a string would silently not be enforced). */
export function checkGroupsAttr(attrs: Record<string, unknown> | undefined, where: string): void {
  if (!attrs || !('groups' in attrs)) return;
  const g = attrs.groups;
  if (!Array.isArray(g) || !g.every((x) => typeof x === 'string' && XMLID_RE.test(x))) {
    throw new ValidationError(`${where}: attrs.groups must be an array of group codes like ['base.group_user']`);
  }
}
