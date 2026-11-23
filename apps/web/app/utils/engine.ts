// Types and pure helpers for rendering engine views (no Vue/Nuxt imports: unit-testable).

export type FieldType =
  | 'char' | 'text' | 'html' | 'integer' | 'float' | 'monetary' | 'boolean' | 'date' | 'datetime'
  | 'selection' | 'json' | 'binary' | 'many2one' | 'one2many' | 'many2many'

export interface FieldInfo {
  type: FieldType
  string: string
  required: boolean
  readonly: boolean
  help?: string
  selection?: [string, string][]
  comodel?: string
  relatedOrComputed?: boolean
}

export interface ViewNode {
  tag: string
  attrs?: Record<string, unknown>
  children?: ViewNode[]
}

export interface ResolvedView {
  xmlId: string | null
  model: string
  type: string
  arch: ViewNode
  fields: Record<string, FieldInfo>
}

export interface ActionInfo {
  xmlId: string
  type: string
  name: string
  model?: string
  viewTypes: string[]
  domain?: unknown[]
}

export interface MenuNode {
  xmlId: string
  name: string
  action?: string
  sequence: number
  children: MenuNode[]
}

export type RecordValues = Record<string, unknown>

/** Field names of the `field` nodes of an arch, in document order. */
export function archFieldNames(node: ViewNode, out: string[] = []): string[] {
  if (node.tag === 'field' && typeof node.attrs?.name === 'string' && !out.includes(node.attrs.name)) out.push(node.attrs.name)
  for (const c of node.children ?? []) archFieldNames(c, out)
  return out
}

/** Fields worth a text search box: char fields of the search view (or of the list). */
export function searchableFields(view: ResolvedView): string[] {
  return archFieldNames(view.arch).filter((f) => view.fields[f]?.type === 'char')
}

/** Odoo-style OR domain over several fields: ['|', a, '|', b, c]. */
export function textSearchDomain(fields: string[], text: string): unknown[] {
  const term = text.trim()
  if (!term || !fields.length) return []
  const leaves = fields.map((f) => [f, 'ilike', term])
  return [...Array(leaves.length - 1).fill('|'), ...leaves]
}

/** Empty values for a new record, per field type. */
export function emptyValue(f: FieldInfo): unknown {
  switch (f.type) {
    case 'boolean': return false
    case 'one2many':
    case 'many2many': return []
    default: return null
  }
}

/** Convert a form input value to what the API expects for that field type. */
export function toApiValue(f: FieldInfo, v: unknown): unknown {
  if (v === '' || v === undefined) return f.type === 'boolean' ? false : null
  switch (f.type) {
    case 'integer': {
      const n = typeof v === 'number' ? v : Number(v)
      return Number.isFinite(n) ? Math.trunc(n) : null
    }
    case 'float':
    case 'monetary': {
      const n = typeof v === 'number' ? v : Number(v)
      return Number.isFinite(n) ? n : null
    }
    case 'boolean': return Boolean(v)
    case 'many2one': return typeof v === 'number' ? v : v === null ? null : Number(v)
    case 'many2many': return Array.isArray(v) ? v.map(Number) : []
    case 'date': return typeof v === 'string' ? v.slice(0, 10) : v
    default: return v
  }
}

/** Only the fields that changed and may be written (no readonly/computed, no one2many in v1). */
export function changedValues(fields: Record<string, FieldInfo>, original: RecordValues, current: RecordValues): RecordValues {
  const out: RecordValues = {}
  for (const [name, f] of Object.entries(fields)) {
    if (f.readonly || f.relatedOrComputed || f.type === 'one2many') continue
    const next = toApiValue(f, current[name])
    if (JSON.stringify(next) !== JSON.stringify(original[name] ?? emptyValue(f))) out[name] = next
  }
  return out
}

/** Text for a value in lists and read-only displays. */
export function displayValue(f: FieldInfo | undefined, v: unknown, names: Map<number, string> = new Map(), locale = 'en'): string {
  if (v === null || v === undefined || v === false && f?.type !== 'boolean') return ''
  switch (f?.type) {
    case 'boolean': return v ? 'Yes' : 'No'
    case 'selection': return f.selection?.find(([k]) => k === v)?.[1] ?? String(v)
    case 'many2one': return names.get(v as number) ?? `#${String(v)}`
    case 'one2many':
    case 'many2many': {
      const ids = v as number[]
      return ids.length ? ids.map((id) => names.get(id) ?? `#${id}`).join(', ') : ''
    }
    case 'float':
    case 'monetary': return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(v as number)
    case 'integer': return new Intl.NumberFormat(locale).format(v as number)
    case 'datetime': return new Date(String(v)).toLocaleString(locale)
    case 'date': return new Date(String(v)).toLocaleDateString(locale)
    default: return String(v)
  }
}

/** Ids referenced by relational fields of the given rows, grouped by comodel. */
export function relationalIds(fields: Record<string, FieldInfo>, rows: RecordValues[]): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>()
  for (const [name, f] of Object.entries(fields)) {
    if (!f.comodel) continue
    const set = out.get(f.comodel) ?? new Set<number>()
    for (const r of rows) {
      const v = r[name]
      if (typeof v === 'number') set.add(v)
      else if (Array.isArray(v)) v.forEach((x) => typeof x === 'number' && set.add(x))
    }
    if (set.size) out.set(f.comodel, set)
  }
  return out
}

/** Required, writable fields still empty (checked before calling the API). */
export function missingRequired(fields: Record<string, FieldInfo>, values: RecordValues): string[] {
  return Object.entries(fields)
    .filter(([, f]) => f.required && !f.readonly && !f.relatedOrComputed && f.type !== 'boolean' && f.type !== 'one2many')
    .filter(([name]) => {
      const v = values[name]
      return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
    })
    .map(([name]) => name)
}

/**
 * The form field an engine error message refers to, if any: "... (login)" from database
 * constraints, or "Field 'Login' ..." / "Field 'res.users.login' ..." from validation.
 */
export function fieldFromError(fields: Record<string, FieldInfo>, message: string): string | null {
  const col = /\(([a-z0-9_]+)\)/.exec(message)?.[1]
  if (col && fields[col]) return col
  const quoted = /Field '([^']+)'/.exec(message)?.[1]
  if (!quoted) return null
  const tail = quoted.split('.').pop()!
  if (fields[tail]) return tail
  return Object.entries(fields).find(([, f]) => f.string === quoted)?.[0] ?? null
}
