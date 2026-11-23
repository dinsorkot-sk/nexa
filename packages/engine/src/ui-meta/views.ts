import {
  AccessError, EngineError, ValidationError,
  type ActionDef, type Context, type Domain, type Env, type FieldDef, type ResolvedModel, type ViewNode, type ViewPatch, type ViewType,
} from '../contracts/index.js';
import type { EnvImpl } from '../orm/env.js';
import { isColumn } from '../orm/registry.js';
import { checkModelAccess, hiddenFields, userSecurity } from '../security/access.js';
import { applyPatches, archFields, filterArch } from './arch.js';

/** Field metadata the generic UI needs to render and validate inputs. */
export interface FieldInfo {
  type: FieldDef['type'];
  string: string;
  required: boolean;
  readonly: boolean;
  help?: string;
  selection?: ReadonlyArray<readonly [string, string]>;
  comodel?: string;
  relatedOrComputed?: boolean;
}

export interface ResolvedView {
  xmlId: string | null;   // null = generated default
  model: string;
  type: ViewType;
  arch: ViewNode;
  fields: Record<string, FieldInfo>;
}

interface ViewRow {
  xml_id: string; model: string; type: ViewType; priority: number; arch: ViewNode | null;
  inherit_from: string | null; patches: ViewPatch[] | null; groups: string[];
}

async function groupCheck(env: Env): Promise<(groups: readonly string[]) => boolean> {
  const e = env as EnvImpl;
  if (e.su) return () => true;
  const sec = await userSecurity(e);
  return (groups) => !groups.length || groups.some((g) => sec.groups.has(g));
}

/**
 * The view the current user gets for (model, type): the primary view with the lowest priority
 * (or `xmlId`), extended by every applicable inheriting view (recursively, in priority order),
 * then filtered by node/field groups. Without a stored view a default one is generated.
 */
export async function getView(env: Env, model: string, type: ViewType, xmlId?: string): Promise<ResolvedView> {
  const e = env as EnvImpl;
  const meta = e.registry.get(model);
  await checkModelAccess(e, model, 'read');
  const can = await groupCheck(env);
  const rows = await e.db.query<ViewRow>({
    text: `SELECT xml_id, model, type, priority, arch, inherit_from, patches, groups FROM nx_view WHERE model = $1 AND type = $2 ORDER BY priority, id`,
    params: [model, type],
  });
  const primary = rows.filter((r) => r.arch && !r.inherit_from && can(r.groups) && (!xmlId || r.xml_id === xmlId));
  if (xmlId && !primary.length) throw new EngineError(`View '${xmlId}' not found for ${model}/${type}`);
  if (!primary.length) return finish(e, meta, type, null, defaultArch(meta, type), can);
  const root = primary[0];
  const arch = resolveArch(root, rows, can, false);
  return finish(e, meta, type, root.xml_id, arch, can);
}

/** Apply all inheriting views of `root` (depth-first, priority order). Exported for install-time validation. */
export function resolveArch(
  root: ViewRow, rows: readonly ViewRow[], can: (g: readonly string[]) => boolean = () => true, strict = true,
): ViewNode {
  const children = new Map<string, ViewRow[]>();
  for (const r of rows) if (r.inherit_from) (children.get(r.inherit_from) ?? children.set(r.inherit_from, []).get(r.inherit_from)!).push(r);
  let arch = root.arch!;
  const seen = new Set<string>([root.xml_id]);
  const visit = (id: string) => {
    for (const child of children.get(id) ?? []) {
      if (seen.has(child.xml_id)) throw new ValidationError(`View inheritance cycle at '${child.xml_id}'`);
      seen.add(child.xml_id);
      if (!can(child.groups)) continue;
      arch = applyPatches(arch, child.patches ?? [], child.xml_id, strict);
      visit(child.xml_id);
    }
  };
  visit(root.xml_id);
  return arch;
}

async function finish(
  e: EnvImpl, meta: ResolvedModel, type: ViewType, xmlId: string | null, raw: ViewNode,
  can: (g: readonly string[]) => boolean,
): Promise<ResolvedView> {
  const hidden = await hiddenFields(e, meta.name);
  const arch = filterArch(raw, (g) => can(g), hidden) ?? { tag: type };
  const fields: Record<string, FieldInfo> = {};
  for (const name of archFields(arch)) {
    const f = meta.fields.get(name);
    if (!f) throw new ValidationError(`View for '${meta.name}' references unknown field '${name}'`);
    fields[name] = {
      type: f.type, string: f.string ?? humanize(name), required: !!f.required,
      readonly: !!f.readonly || !!f.compute || !!f.related,
      ...(f.help ? { help: f.help } : {}), ...(f.selection ? { selection: f.selection } : {}),
      ...(f.comodel ? { comodel: f.comodel } : {}), ...(f.compute || f.related ? { relatedOrComputed: true } : {}),
    };
  }
  return { xmlId, model: meta.name, type, arch, fields };
}

const DEFAULT_SKIP = new Set(['id', 'create_uid', 'write_uid', 'create_date', 'write_date']);

/** Generated view when a model has none (No-Code models work immediately). */
export function defaultArch(meta: ResolvedModel, type: ViewType): ViewNode {
  const all = [...meta.fields.values()].filter((f) => !DEFAULT_SKIP.has(f.name) && f.type !== 'binary');
  const field = (name: string): ViewNode => ({ tag: 'field', attrs: { name } });
  switch (type) {
    case 'list':
      return { tag: 'list', children: all.filter((f) => isColumn(f) && f.type !== 'text' && f.type !== 'html' && f.type !== 'json').slice(0, 8).map((f) => field(f.name)) };
    case 'search':
      return { tag: 'search', children: all.filter((f) => f.type === 'char' || f.type === 'many2one' || f.type === 'selection').slice(0, 6).map((f) => field(f.name)) };
    case 'form': {
      const simple = all.filter((f) => f.type !== 'one2many' && f.type !== 'many2many' && f.type !== 'json');
      const x2m = all.filter((f) => f.type === 'one2many' || f.type === 'many2many');
      return {
        tag: 'form',
        children: [
          { tag: 'sheet', children: [
            { tag: 'group', children: simple.map((f) => field(f.name)) },
            ...x2m.map((f) => ({ tag: 'group', attrs: { string: f.string ?? humanize(f.name) }, children: [field(f.name)] })),
          ] },
        ],
      };
    }
    case 'kanban':
      return { tag: 'kanban', children: all.filter((f) => isColumn(f)).slice(0, 4).map((f) => field(f.name)) };
    default:
      throw new EngineError(`No default '${type}' view; define one for '${meta.name}'`);
  }
}

function humanize(name: string): string {
  const s = name.replace(/^x_/, '').replace(/_ids?$/, '').replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------- actions ----------

export interface ResolvedAction extends Omit<ActionDef, 'code'> {
  xmlId: string;
}

export async function getAction(env: Env, xmlId: string): Promise<ResolvedAction> {
  const e = env as EnvImpl;
  const [r] = await e.db.query<{ xml_id: string; type: ActionDef['type']; name: string; model: string | null; view_types: ViewType[] | null; domain: Domain | null; context: Context | null }>({
    text: `SELECT xml_id, type, name, model, view_types, domain, context FROM nx_action WHERE xml_id = $1`, params: [xmlId],
  });
  if (!r) throw new EngineError(`Action '${xmlId}' not found`);
  if (r.model) await checkModelAccess(e, r.model, 'read');
  return {
    xmlId: r.xml_id, type: r.type, name: r.name,
    ...(r.model ? { model: r.model } : {}), viewTypes: r.view_types ?? ['list', 'form'],
    ...(r.domain ? { domain: r.domain } : {}), ...(r.context ? { context: r.context } : {}),
  };
}

// ---------- menus ----------

export interface MenuNode {
  xmlId: string;
  name: string;
  action?: string;
  sequence: number;
  children: MenuNode[];
}

/**
 * Menu tree for the current user (Odoo load_menus): menus restricted to other groups are dropped,
 * menus whose action model the user cannot read are dropped, and so are parents left empty.
 */
export async function getMenus(env: Env): Promise<MenuNode[]> {
  const e = env as EnvImpl;
  const can = await groupCheck(env);
  const rows = await e.db.query<{ xml_id: string; name: string; parent: string | null; action: string | null; sequence: number; groups: string[] }>({
    text: `SELECT xml_id, name, parent, action, sequence, groups FROM nx_menu ORDER BY sequence, id`, params: [],
  });
  const actions = new Map((await e.db.query<{ xml_id: string; model: string | null }>({
    text: `SELECT xml_id, model FROM nx_action`, params: [],
  })).map((a) => [a.xml_id, a.model]));
  const readable = async (model: string | null | undefined) => {
    if (!model) return true;
    try {
      await checkModelAccess(e, model, 'read');
      return true;
    } catch (err) {
      if (err instanceof AccessError) return false;
      throw err;
    }
  };
  const byParent = new Map<string | null, typeof rows>();
  for (const r of rows) (byParent.get(r.parent) ?? byParent.set(r.parent, []).get(r.parent)!).push(r);
  const build = async (parent: string | null, depth: number): Promise<MenuNode[]> => {
    if (depth > 16) throw new ValidationError('Menu tree too deep (cycle?)');
    const out: MenuNode[] = [];
    for (const r of byParent.get(parent) ?? []) {
      if (!can(r.groups)) continue;
      if (r.action && (!actions.has(r.action) || !(await readable(actions.get(r.action))))) continue;
      const children = await build(r.xml_id, depth + 1);
      if (!r.action && !children.length) continue;
      out.push({ xmlId: r.xml_id, name: r.name, ...(r.action ? { action: r.action } : {}), sequence: r.sequence, children });
    }
    return out;
  };
  return build(null, 0);
}

/** Install-time check: every inheriting view resolves against its parent chain. */
export async function validateViews(env: Env): Promise<void> {
  const e = env as EnvImpl;
  const rows = await e.db.query<ViewRow>({
    text: `SELECT xml_id, model, type, priority, arch, inherit_from, patches, groups FROM nx_view ORDER BY priority, id`, params: [],
  });
  const byId = new Map(rows.map((r) => [r.xml_id, r]));
  for (const r of rows) {
    if (r.inherit_from && !byId.has(r.inherit_from)) throw new ValidationError(`View '${r.xml_id}' inherits unknown view '${r.inherit_from}'`);
    if (r.inherit_from) {
      const parent = byId.get(r.inherit_from)!;
      if (parent.model !== r.model || parent.type !== r.type) {
        throw new ValidationError(`View '${r.xml_id}' must have the same model/type as '${r.inherit_from}'`);
      }
    }
  }
  for (const r of rows) {
    if (!r.arch || r.inherit_from) continue;
    const arch = resolveArch(r, rows.filter((x) => x.model === r.model && x.type === r.type));
    // patches may rename/insert fields: the resolved arch must only name existing fields
    const meta = e.registry.models.get(r.model);
    if (!meta) throw new ValidationError(`View '${r.xml_id}' is for unknown model '${r.model}'`);
    for (const name of archFields(arch)) {
      if (!meta.fields.has(name)) throw new ValidationError(`View '${r.xml_id}' (resolved) references unknown field '${name}'`);
    }
  }
}
