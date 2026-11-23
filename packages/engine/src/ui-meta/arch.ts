import { ValidationError, type ViewNode, type ViewPatch } from '../contracts/index.js';

/**
 * View inheritance with JSON patches (ADR 0001 §10) instead of Odoo's XPath.
 * Selector: `tag` optionally followed by `[attr=value]` filters, e.g. `field[name=partner_id]`,
 * `group[name=main]`, `page[string=Lines]`. The first match in document order is patched.
 */
export interface Selector {
  tag: string;
  attrs: [string, string][];
}

const SEL_RE = /^([a-z_][a-z0-9_]*)((?:\[[a-z_][a-z0-9_]*=[^\]]+\])*)$/;
const ATTR_RE = /\[([a-z_][a-z0-9_]*)=([^\]]+)\]/g;

export function parseSelector(s: string): Selector {
  const m = typeof s === 'string' ? SEL_RE.exec(s.trim()) : null;
  if (!m) throw new ValidationError(`Invalid view selector '${String(s)}'`);
  const attrs: [string, string][] = [];
  for (const a of m[2].matchAll(ATTR_RE)) attrs.push([a[1], a[2].replace(/^['"]|['"]$/g, '')]);
  return { tag: m[1], attrs };
}

function matches(n: ViewNode, sel: Selector): boolean {
  return n.tag === sel.tag && sel.attrs.every(([k, v]) => String(n.attrs?.[k]) === v);
}

/** Locate the first node matching `sel`: returns the parent's children array and index (root: parent null). */
function find(root: ViewNode, sel: Selector): { parent: ViewNode | null; index: number; node: ViewNode } | null {
  if (matches(root, sel)) return { parent: null, index: -1, node: root };
  const stack: ViewNode[] = [root];
  while (stack.length) {
    const p = stack.shift()!;
    const kids = p.children ?? [];
    for (let i = 0; i < kids.length; i++) {
      if (matches(kids[i], sel)) return { parent: p, index: i, node: kids[i] };
    }
    stack.push(...kids);
  }
  return null;
}

export function clone<T>(v: T): T {
  return structuredClone(v);
}

/** Apply patches to a copy of `arch`; throws when a target does not exist (like Odoo's failing xpath). */
export function applyPatches(arch: ViewNode, patches: readonly ViewPatch[], source: string, strict = true): ViewNode {
  let root = clone(arch);
  for (const p of patches) {
    const hit = find(root, parseSelector(p.target));
    if (!hit) {
      // runtime (non-strict): the target may come from a group-restricted view this user does not get
      if (!strict) continue;
      throw new ValidationError(`View '${source}': target '${p.target}' not found`);
    }
    const node = p.node ? clone(p.node) : undefined;
    switch (p.position) {
      case 'inside':
        if (!node) throw new ValidationError(`View '${source}': 'inside' needs a node`);
        (hit.node.children ??= []).push(node);
        break;
      case 'before':
      case 'after':
        if (!node) throw new ValidationError(`View '${source}': '${p.position}' needs a node`);
        if (!hit.parent) throw new ValidationError(`View '${source}': cannot insert next to the root`);
        hit.parent.children!.splice(hit.index + (p.position === 'after' ? 1 : 0), 0, node);
        break;
      case 'replace':
        if (!hit.parent) {
          if (!node) throw new ValidationError(`View '${source}': cannot remove the root`);
          root = node;
        } else if (node) hit.parent.children![hit.index] = node;
        else hit.parent.children!.splice(hit.index, 1);
        break;
      case 'attributes':
        hit.node.attrs = { ...hit.node.attrs, ...p.attrs };
        for (const [k, v] of Object.entries(p.attrs ?? {})) if (v === null) delete hit.node.attrs[k];
        break;
      default:
        throw new ValidationError(`View '${source}': unknown position '${String(p.position)}'`);
    }
  }
  return root;
}

/** Remove nodes the user may not see: `attrs.groups` (list of codes) and fields in `hiddenFields`. */
export function filterArch(node: ViewNode, can: (groups: string[]) => boolean, hiddenFields: ReadonlySet<string>): ViewNode | null {
  const g = node.attrs?.groups;
  // fail closed: a malformed groups value hides the node instead of showing it to everyone
  if (g !== undefined && (!Array.isArray(g) || (g.length && !can(g as string[])))) return null;
  if (node.tag === 'field' && hiddenFields.has(String(node.attrs?.name))) return null;
  const out: ViewNode = { tag: node.tag };
  if (node.attrs) {
    const attrs = { ...node.attrs };
    delete attrs.groups;
    out.attrs = attrs;
  }
  if (node.children) out.children = node.children.map((c) => filterArch(c, can, hiddenFields)).filter((c): c is ViewNode => !!c);
  return out;
}

/** Field names referenced by `field` nodes. */
export function archFields(node: ViewNode, acc = new Set<string>()): Set<string> {
  if (node.tag === 'field' && typeof node.attrs?.name === 'string') acc.add(node.attrs.name);
  for (const c of node.children ?? []) archFields(c, acc);
  return acc;
}
