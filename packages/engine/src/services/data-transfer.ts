import {
  AccessError, EngineError, ValidationError,
  type Context, type Domain, type Env, type FieldDef, type ResolvedModel, type SqlDriver, type X2ManyCommand,
} from '../contracts/index.js';
import type { EnvImpl } from '../orm/env.js';
import { hiddenFields } from '../security/access.js';
import { positiveInt, requireModel, tenantDriver } from './common.js';

/**
 * Data import/export (concepts of Odoo's export_data / load / ir.exports; no Odoo code).
 * Everything runs in the caller's Env: ACL, record rules, field groups, required fields and
 * constraints apply exactly as for direct ORM calls. External ids live in nx_model_data.
 */

type Field = FieldDef & { name: string; model: string };
export type Cell = string | number | boolean | null;

export const DATA_TRANSFER_LIMITS = {
  maxRows: 10_000,
  maxColumns: 200,
  maxCellChars: 100_000,
  maxImportChars: 10 * 1024 * 1024,
  maxExportRecords: 10_000,
  maxExportRows: 50_000,
  maxErrors: 100,
  maxPathDepth: 5,
} as const;

const IMPORT_MODULE = '__import__';
const EXPORT_MODULE = '__export__';
const MAGIC = new Set(['id', 'create_date', 'write_date', 'create_uid', 'write_uid', 'parent_path']);
const XMLID = /^(?:([A-Za-z0-9_]{1,64})\.)?([A-Za-z0-9_][A-Za-z0-9_.-]{0,199})$/;

const impl = (env: Env): EnvImpl => env as EnvImpl;

/** Bump when the DDL below changes; existing tenants re-run the idempotent statements. */
const SCHEMA_VERSION = 2;
/** Advisory lock key serializing first-run DDL across concurrent callers. */
const SETUP_LOCK = 7_302_023;

async function schemaVersion(driver: SqlDriver): Promise<number> {
  const [probe] = await driver.query<{ v: string | null }>({
    text: `SELECT obj_description(to_regclass('nx_data_transfer_ready'), 'pg_class') AS v`, params: [],
  });
  return Number(probe?.v ?? 0);
}

/** Idempotent DDL for import/export persistence (external ids, export templates, saved filters). */
export async function ensureDataTransferTables(env: Env): Promise<void> {
  if (await schemaVersion(tenantDriver(env)) >= SCHEMA_VERSION) return;
  await tenantDriver(env).transaction(async (tx) => {
    await tx.query({ text: `SELECT pg_advisory_xact_lock($1)`, params: [SETUP_LOCK] });
    if (await schemaVersion(tx) >= SCHEMA_VERSION) return;
    await createTables(tx);
  });
}

async function createTables(driver: SqlDriver): Promise<void> {
  await driver.query({ text: `
    CREATE TABLE IF NOT EXISTS nx_model_data (
      id SERIAL PRIMARY KEY, module TEXT NOT NULL, name TEXT NOT NULL, model TEXT NOT NULL,
      res_id INTEGER NOT NULL, noupdate BOOLEAN NOT NULL DEFAULT false, UNIQUE (module, name))`, params: [] });
  await driver.query({ text: `CREATE INDEX IF NOT EXISTS nx_model_data_res_idx ON nx_model_data(model, res_id)`, params: [] });
  await driver.query({ text: `
    CREATE TABLE IF NOT EXISTS nx_export_template (
      id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, model TEXT NOT NULL, user_id BIGINT NOT NULL,
      fields JSONB NOT NULL, create_date TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (user_id, model, name))`, params: [] });
  await driver.query({ text: `
    CREATE TABLE IF NOT EXISTS nx_filter (
      id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, model TEXT NOT NULL, user_id BIGINT,
      domain JSONB NOT NULL DEFAULT '[]'::jsonb, context JSONB NOT NULL DEFAULT '{}'::jsonb, sort TEXT,
      is_default BOOLEAN NOT NULL DEFAULT false, create_uid BIGINT NOT NULL,
      create_date TIMESTAMPTZ NOT NULL DEFAULT now(), write_date TIMESTAMPTZ NOT NULL DEFAULT now())`, params: [] });
  await driver.query({ text: `CREATE INDEX IF NOT EXISTS nx_filter_model_idx ON nx_filter(model, user_id)`, params: [] });
  // at most one default per (model, owner); shared filters use owner 0
  await driver.query({ text: `UPDATE nx_filter f SET is_default = false WHERE is_default AND EXISTS (SELECT 1 FROM nx_filter o
    WHERE o.is_default AND o.model = f.model AND COALESCE(o.user_id, 0) = COALESCE(f.user_id, 0) AND o.id > f.id)`, params: [] });
  await driver.query({ text: `CREATE UNIQUE INDEX IF NOT EXISTS nx_filter_default_uniq ON nx_filter(model, COALESCE(user_id, 0)) WHERE is_default`, params: [] });
  await driver.query({ text: `CREATE TABLE IF NOT EXISTS nx_data_transfer_ready (version INTEGER PRIMARY KEY)`, params: [] });
  await driver.query({ text: `INSERT INTO nx_data_transfer_ready(version) VALUES ($1) ON CONFLICT DO NOTHING`, params: [SCHEMA_VERSION] });
  await driver.query({ text: `COMMENT ON TABLE nx_data_transfer_ready IS '${SCHEMA_VERSION}'`, params: [] });
}

export function modelMeta(env: Env, model: string): ResolvedModel {
  requireModel(model);
  const meta = impl(env).registry.models.get(model);
  if (!meta || !meta.table) throw new ValidationError(`Unknown model '${model}'`);
  return meta;
}

const isX2many = (f: Field) => f.type === 'one2many' || f.type === 'many2many';
const isRelational = (f: Field) => f.type === 'many2one' || isX2many(f);

// ---------------------------------------------------------------- external ids

function parseXmlId(raw: string): { module: string; name: string } {
  const m = XMLID.exec(raw.trim());
  if (!m) throw new ValidationError(`Invalid external id '${raw.slice(0, 80)}'`);
  return { module: m[1] ?? IMPORT_MODULE, name: m[2]! };
}

async function lookupXmlId(db: SqlDriver, raw: string): Promise<{ id: number; model: string; res_id: number } | undefined> {
  const { module, name } = parseXmlId(raw);
  const [row] = await db.query<{ id: number; model: string; res_id: number }>({
    text: `SELECT id, model, res_id FROM nx_model_data WHERE module = $1 AND name = $2`, params: [module, name],
  });
  return row;
}

/** Records visible to the caller (ACL + record rules), archived included. */
async function visibleIds(env: Env, model: string, ids: number[]): Promise<Set<number>> {
  if (!ids.length) return new Set();
  const found = await env.withContext({ activeTest: false }).model(model).search([['id', 'in', ids]]);
  return new Set(found.ids);
}

async function exportXmlIds(env: Env, model: string, ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!ids.length) return out;
  const db = tenantDriver(env);
  const rows = await db.query<{ module: string; name: string; res_id: number }>({
    text: `SELECT module, name, res_id FROM nx_model_data WHERE model = $1 AND res_id = ANY($2) ORDER BY id`, params: [model, ids],
  });
  for (const r of rows) if (!out.has(Number(r.res_id))) out.set(Number(r.res_id), `${r.module}.${r.name}`);
  for (const id of ids) {
    if (out.has(id)) continue;
    const name = `${model.replace(/\./g, '_')}_${id}`;
    await db.query({
      text: `INSERT INTO nx_model_data(module, name, model, res_id, noupdate) VALUES ($1,$2,$3,$4,true) ON CONFLICT (module, name) DO NOTHING`,
      params: [EXPORT_MODULE, name, model, id],
    });
    out.set(id, `${EXPORT_MODULE}.${name}`);
  }
  return out;
}

// ---------------------------------------------------------------- export

export interface ExportOptions {
  ids?: number[];
  domain?: Domain;
  order?: string;
  limit?: number;
}
export interface ExportResult { header: string[]; rows: Cell[][] }

interface PathNode { col: number; rest: string[] }

function formatScalar(f: Field | undefined, v: unknown): Cell {
  if (v === null || v === undefined) return f?.type === 'boolean' ? false : null;
  if (v instanceof Date) {
    if (f?.type === 'date') return v.toISOString().slice(0, 10);
    return v.toISOString().replace('T', ' ').slice(0, 19);
  }
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'bigint') return Number(v);
  return JSON.stringify(v);
}

/**
 * Builds Odoo-style export rows: one row per record, x2many sub-paths produce extra rows below the
 * record (the first sub-record shares the record's row).
 */
export class DataExportService {
  private readonly maxRows: number;
  constructor(private readonly env: Env, limits: { maxExportRows?: number } = {}) {
    this.maxRows = Math.min(positiveInt(limits.maxExportRows ?? DATA_TRANSFER_LIMITS.maxExportRows, 'export row limit'), DATA_TRANSFER_LIMITS.maxExportRows);
  }

  async exportData(model: string, fieldPaths: string[], options: ExportOptions = {}): Promise<ExportResult> {
    modelMeta(this.env, model);
    if (!Array.isArray(fieldPaths) || !fieldPaths.length) throw new ValidationError('Export needs at least one field');
    if (fieldPaths.length > DATA_TRANSFER_LIMITS.maxColumns) throw new ValidationError('Too many export fields');
    const paths = fieldPaths.map((p) => splitPath(p));
    for (const p of paths) await this.validatePath(model, p);
    const limit = Math.min(options.limit ?? DATA_TRANSFER_LIMITS.maxExportRecords, DATA_TRANSFER_LIMITS.maxExportRecords);
    positiveInt(limit, 'export limit');
    let ids: number[];
    if (options.ids) {
      if (options.domain) throw new ValidationError('Export takes either ids or a domain');
      if (options.ids.length > limit) throw new ValidationError(`At most ${limit} records can be exported at once`);
      for (const id of options.ids) positiveInt(id, 'record id');
      ids = [...new Set(options.ids)];
      // read() enforces record rules on the explicit ids and fails on invisible ones
      await this.env.model(model).browse(ids).read(['id']);
    } else {
      ids = [...(await this.env.model(model).search(options.domain ?? [], { limit, ...(options.order ? { order: options.order } : {}) })).ids];
    }
    return this.env.transaction(async () => {
      await ensureDataTransferTables(this.env);
      const blocks = await this.blocks(model, ids, paths.map((rest, col) => ({ col, rest })), paths.length);
      const rows: Cell[][] = [];
      for (const id of ids) {
        for (const row of blocks.get(id) ?? []) {
          rows.push(row);
          if (rows.length > this.maxRows) throw new ValidationError('Export produces too many rows');
        }
      }
      return { header: fieldPaths.map((p) => p.trim()), rows };
    });
  }

  /** Validates a path against the schema and the caller's field groups. */
  async validatePath(model: string, path: string[]): Promise<void> {
    let meta = modelMeta(this.env, model);
    for (let i = 0; i < path.length; i++) {
      const seg = path[i]!;
      const last = i === path.length - 1;
      if (seg === 'id' || seg === '.id') {
        if (!last) throw new ValidationError(`Invalid field path '${path.join('/')}'`);
        return;
      }
      if (seg === 'display_name' && !meta.fields.has(seg)) {
        if (!last) throw new ValidationError(`Invalid field path '${path.join('/')}'`);
        return;
      }
      const f = meta.fields.get(seg) as Field | undefined;
      if (!f) throw new ValidationError(`Unknown field '${meta.name}.${seg}'`);
      if ((await hiddenFields(impl(this.env), meta.name)).has(seg)) throw new AccessError(`Field '${meta.name}.${seg}' is restricted`);
      if (!last) {
        if (!isRelational(f) || !f.comodel) throw new ValidationError(`Field '${meta.name}.${seg}' has no sub-fields`);
        meta = modelMeta(this.env, f.comodel);
      }
    }
  }

  private async blocks(model: string, ids: number[], nodes: PathNode[], width: number): Promise<Map<number, Cell[][]>> {
    const result = new Map<number, Cell[][]>();
    if (!ids.length) return result;
    const meta = modelMeta(this.env, model);
    const firsts = [...new Set(nodes.map((n) => n.rest[0]!).filter((s) => s !== 'id' && s !== '.id'))];
    // every level stops as soon as it would exceed the row cap (sub-records each yield at least one row)
    if (ids.length > this.maxRows) throw new ValidationError('Export produces too many rows');
    let produced = 0;
    const records = await this.env.withContext({ activeTest: false }).model(model).browse(ids).read(firsts);
    const byId = new Map(records.map((r) => [r.id as number, r]));
    const wantsXml = nodes.some((n) => n.rest.length === 1 && n.rest[0] === 'id');
    const xmlIds = wantsXml ? await exportXmlIds(this.env, model, ids) : new Map<number, string>();

    // relational groups: field -> sub nodes / leaf nodes
    const groups = new Map<string, PathNode[]>();
    for (const n of nodes) {
      if (n.rest.length > 1) {
        const list = groups.get(n.rest[0]!) ?? [];
        list.push({ col: n.col, rest: n.rest.slice(1) });
        groups.set(n.rest[0]!, list);
      }
    }
    // leaf display for relational fields without sub path: names of visible targets
    const names = new Map<string, Map<number, string>>();
    for (const n of nodes) {
      if (n.rest.length !== 1) continue;
      const f = meta.fields.get(n.rest[0]!) as Field | undefined;
      if (!f || !isRelational(f) || names.has(f.name)) continue;
      const target = new Set<number>();
      for (const r of records) for (const id of relIds(r[f.name])) target.add(id);
      names.set(f.name, await this.displayNames(f.comodel!, [...target]));
    }
    const sub = new Map<string, Map<number, Cell[][]>>();
    const subVisible = new Map<string, Set<number>>();
    for (const [fname, subNodes] of groups) {
      const f = meta.fields.get(fname) as Field;
      const target = new Set<number>();
      for (const r of records) for (const id of relIds(r[fname])) target.add(id);
      const visible = await visibleIds(this.env, f.comodel!, [...target]);
      subVisible.set(fname, visible);
      sub.set(fname, await this.blocks(f.comodel!, [...visible], subNodes, width));
    }

    for (const id of ids) {
      const rec = byId.get(id);
      if (!rec) continue;
      const current: Cell[] = new Array<Cell>(width).fill(null);
      const extra: Cell[][] = [];
      for (const n of nodes) {
        if (n.rest.length !== 1) continue;
        const seg = n.rest[0]!;
        if (seg === 'id') { current[n.col] = xmlIds.get(id) ?? null; continue; }
        if (seg === '.id') { current[n.col] = id; continue; }
        const f = meta.fields.get(seg) as Field | undefined;
        if (f && isRelational(f)) {
          const labels = names.get(seg)!;
          const ids2 = relIds(rec[seg]).filter((x) => labels.has(x));
          current[n.col] = ids2.length ? joinList(ids2.map((x) => labels.get(x)!)) : null;
        } else current[n.col] = formatScalar(f, rec[seg]);
      }
      for (const [fname] of groups) {
        const blocks = sub.get(fname)!;
        const visible = subVisible.get(fname)!;
        let first = true;
        for (const target of relIds(rec[fname])) {
          if (!visible.has(target)) continue;
          const lines = blocks.get(target) ?? [];
          if (!lines.length) continue;
          if (first) {
            lines[0]!.forEach((v, j) => { if (v !== null) current[j] = v; });
            extra.push(...lines.slice(1));
            first = false;
          } else extra.push(...lines);
        }
      }
      produced += 1 + extra.length;
      if (produced > this.maxRows) throw new ValidationError('Export produces too many rows');
      result.set(id, [current, ...extra]);
    }
    return result;
  }

  private async displayNames(model: string, ids: number[]): Promise<Map<number, string>> {
    const visible = await visibleIds(this.env, model, ids);
    if (!visible.size) return new Map();
    const rows = await this.env.withContext({ activeTest: false }).model(model).browse([...visible]).read(['display_name']);
    return new Map(rows.map((r) => [r.id as number, String(r.display_name ?? r.id)]));
  }
}

function relIds(v: unknown): number[] {
  if (typeof v === 'number') return [v];
  if (Array.isArray(v)) return v.filter((x): x is number => typeof x === 'number');
  return [];
}

function splitPath(raw: string): string[] {
  if (typeof raw !== 'string') throw new ValidationError('Field paths must be text');
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 300) throw new ValidationError('Invalid field path');
  const parts = trimmed.split('/').map((s) => s.trim());
  if (parts.length > DATA_TRANSFER_LIMITS.maxPathDepth || parts.some((s) => !s)) throw new ValidationError(`Invalid field path '${trimmed.slice(0, 80)}'`);
  return parts;
}

// ---------------------------------------------------------------- CSV

function csvCell(v: Cell): string {
  if (v === null) return '';
  const s = typeof v === 'boolean' ? (v ? 'True' : 'False') : String(v);
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180 serialization (CRLF line ends). */
export function toCsv(header: readonly string[], rows: readonly (readonly Cell[])[]): string {
  return [header, ...rows].map((r) => r.map((c) => csvCell(c)).join(',')).join('\r\n') + '\r\n';
}

/** Bounded RFC 4180 parser; first record is the header. */
export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  if (typeof text !== 'string') throw new ValidationError('CSV must be text');
  if (text.length > DATA_TRANSFER_LIMITS.maxImportChars) throw new ValidationError('CSV is too large');
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let i = 0;
  const pushRow = () => {
    row.push(cell);
    cell = '';
    if (!(row.length === 1 && row[0] === '')) records.push(row);
    row = [];
    if (records.length > DATA_TRANSFER_LIMITS.maxRows + 1) throw new ValidationError(`At most ${DATA_TRANSFER_LIMITS.maxRows} rows can be imported`);
  };
  while (i < src.length) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      cell += ch; i++; continue;
    }
    if (ch === '"' && cell === '') { quoted = true; i++; continue; }
    if (ch === ',') { row.push(cell); cell = ''; i++; continue; }
    if (ch === '\r' || ch === '\n') {
      pushRow();
      i += ch === '\r' && src[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    cell += ch; i++;
  }
  if (quoted) throw new ValidationError('CSV has an unterminated quoted value');
  if (cell !== '' || row.length) pushRow();
  const [header, ...rows] = records;
  if (!header) throw new ValidationError('CSV has no header');
  return { header, rows };
}

// ---------------------------------------------------------------- import

export interface ImportError { row: number; field: string | null; message: string }
export interface ImportOptions { dryRun?: boolean; context?: Partial<Context> }
export interface ImportResult {
  ok: boolean;
  dryRun: boolean;
  /** Ids of the top-level records (empty when rolled back). */
  ids: number[];
  created: number;
  updated: number;
  errors: ImportError[];
}

interface Column {
  index: number;
  header: string;
  /** null for the record identity columns */
  field: Field | null;
  /** 'xmlid' / 'dbid' for identity or relational references, 'value' otherwise */
  mode: 'value' | 'xmlid' | 'dbid';
}

interface Level {
  meta: ResolvedModel;
  keys: Column[];
  children: Map<string, { field: Field; level: Level }>;
}

class ImportAbort extends Error {}
class RollbackSignal extends Error {}

function isEmpty(c: Cell | undefined): boolean {
  return c === null || c === undefined || (typeof c === 'string' && c.trim() === '');
}

export class DataImportService {
  private errors: ImportError[] = [];
  private readonly refCache = new Map<string, number>();

  constructor(private readonly env: Env) {}

  async load(model: string, header: string[], rows: Cell[][], options: ImportOptions = {}): Promise<ImportResult> {
    modelMeta(this.env, model);
    validateMatrix(header, rows);
    const env = options.context ? this.env.withContext(options.context) : this.env;
    const level = await this.resolveHeader(env, model, header);
    const dryRun = !!options.dryRun;
    this.errors = [];
    this.refCache.clear();
    const stats = { created: 0, updated: 0, ids: [] as number[] };
    try {
      await env.transaction(async (tx) => {
        await ensureDataTransferTables(tx);
        for (const block of splitBlocks(level, rows.map((_, i) => i), rows)) {
          const id = await this.importRecord(tx, level, block, rows, null, stats);
          if (id !== null) stats.ids.push(id);
        }
        if (this.errors.length || dryRun) throw new RollbackSignal();
      });
    } catch (error) {
      if (!(error instanceof RollbackSignal) && !(error instanceof ImportAbort)) throw error;
    }
    const ok = this.errors.length === 0;
    return { ok, dryRun, ids: ok && !dryRun ? stats.ids : [], created: stats.created, updated: stats.updated, errors: this.errors };
  }

  private fail(row: number, field: string | null, message: string): void {
    this.errors.push({ row: row + 1, field, message });
    if (this.errors.length >= DATA_TRANSFER_LIMITS.maxErrors) {
      this.errors.push({ row: row + 1, field: null, message: 'Too many errors; import stopped' });
      throw new ImportAbort();
    }
  }

  private async resolveHeader(env: Env, model: string, header: string[]): Promise<Level> {
    const root: Level = { meta: modelMeta(env, model), keys: [], children: new Map() };
    const seen = new Set<string>();
    for (let index = 0; index < header.length; index++) {
      const raw = header[index]!;
      const path = splitPath(raw);
      let level = root;
      for (let i = 0; i < path.length; i++) {
        const seg = path[i]!;
        const last = i === path.length - 1;
        if ((seg === 'id' || seg === '.id') && last) {
          level.keys.push({ index, header: raw, field: null, mode: seg === 'id' ? 'xmlid' : 'dbid' });
          break;
        }
        const f = await resolveField(env, level.meta, seg);
        if (f.type === 'one2many' && !last) {
          if (!f.inverseName) throw new ValidationError(`Field '${level.meta.name}.${f.name}' cannot be imported`);
          let child = level.children.get(f.name);
          if (!child) {
            child = { field: f, level: { meta: modelMeta(env, f.comodel!), keys: [], children: new Map() } };
            level.children.set(f.name, child);
          }
          level = child.level;
          continue;
        }
        const tail = path.slice(i + 1);
        if (tail.length > 1 || (tail.length === 1 && (!isRelational(f) || (tail[0] !== 'id' && tail[0] !== '.id')))) {
          throw new ValidationError(`Column '${raw}' is not importable`);
        }
        if (f.type === 'one2many') throw new ValidationError(`Column '${raw}': one2many fields need sub-columns`);
        level.keys.push({ index, header: raw, field: f, mode: tail[0] === 'id' ? 'xmlid' : tail[0] === '.id' ? 'dbid' : 'value' });
        break;
      }
      const key = path.join('/');
      if (seen.has(key)) throw new ValidationError(`Column '${raw}' appears twice`);
      seen.add(key);
    }
    const check = (lvl: Level) => {
      const target = lvl.keys.filter((k) => k.field === null);
      if (target.length > 1) throw new ValidationError(`Model '${lvl.meta.name}' has more than one identity column`);
      for (const k of lvl.keys) {
        if (k.field && lvl.keys.some((o) => o !== k && o.field?.name === k.field!.name)) {
          throw new ValidationError(`Field '${k.field.name}' is mapped by more than one column`);
        }
      }
      for (const c of lvl.children.values()) {
        if (lvl.keys.some((k) => k.field?.name === c.field.name)) throw new ValidationError(`Field '${c.field.name}' is mapped by more than one column`);
        check(c.level);
      }
    };
    check(root);
    if (!root.keys.length) throw new ValidationError('The header needs at least one top-level column');
    return root;
  }

  private async importRecord(
    env: Env, level: Level, block: number[], rows: Cell[][], parent: { field: string; id: number } | null,
    stats: { created: number; updated: number },
  ): Promise<number | null> {
    const first = block[0]!;
    const row = rows[first]!;
    const model = level.meta.name;
    const vals: Record<string, unknown> = {};
    let bad = false;
    let identity: { kind: 'xmlid'; raw: string } | { kind: 'dbid'; id: number } | null = null;
    let existing: number | null = null;
    for (const col of level.keys) {
      const cell = row[col.index];
      try {
        if (col.field === null) {
          if (isEmpty(cell)) continue;
          if (col.mode === 'xmlid') {
            identity = { kind: 'xmlid', raw: String(cell).trim() };
            const ref = await lookupXmlId(tenantDriver(env), identity.raw);
            if (ref && ref.model !== model) throw new ValidationError(`External id '${identity.raw}' belongs to model '${ref.model}'`);
            if (ref && await rowExists(env, level.meta, ref.res_id)) {
              if (!(await visibleIds(env, model, [ref.res_id])).has(ref.res_id)) throw new AccessError(`Record '${identity.raw}' is not accessible`);
              existing = ref.res_id;
            } else {
              // no live target: a new record may only be bound in the import/export namespaces;
              // stale module-owned rows stay untouched (the module installer owns them)
              const { module } = parseXmlId(identity.raw);
              if (module !== IMPORT_MODULE && module !== EXPORT_MODULE) {
                throw new ValidationError(`External id '${identity.raw}' does not exist (new ids must not use a module namespace)`);
              }
              if (ref) await tenantDriver(env).query({ text: `DELETE FROM nx_model_data WHERE id = $1`, params: [ref.id] });
            }
          } else {
            const id = toInteger(cell);
            if (id <= 0) throw new ValidationError('Invalid database id');
            if (!(await visibleIds(env, model, [id])).has(id)) throw new ValidationError(`Record ${id} does not exist or is not accessible`);
            identity = { kind: 'dbid', id };
            existing = id;
          }
          continue;
        }
        const value = await this.convert(env, col, cell);
        if (value !== undefined) vals[col.field.name] = value;
      } catch (error) {
        if (!(error instanceof EngineError)) throw error;
        this.fail(first, col.header, error.message);
        bad = true;
      }
    }
    if (parent) {
      if (existing !== null) {
        const [cur] = await env.withContext({ activeTest: false }).model(model).browse(existing).read([parent.field]);
        if (cur?.[parent.field] !== parent.id) {
          this.fail(first, null, `Line '${identity?.kind === 'xmlid' ? identity.raw : existing}' belongs to another record`);
          bad = true;
        }
      }
      vals[parent.field] = parent.id;
    }
    if (bad) return null;

    let id: number;
    const ok = await this.guard(first, async () => {
      await env.transaction(async (tx) => {
        if (existing !== null) {
          if (Object.keys(vals).length) await tx.model(model).browse(existing).write(vals);
          id = existing;
          stats.updated++;
        } else {
          id = (await tx.model(model).create(vals)).ids[0]!;
          stats.created++;
          if (identity?.kind === 'xmlid') {
            const { module, name } = parseXmlId(identity.raw);
            await tenantDriver(tx).query({
              text: `INSERT INTO nx_model_data(module, name, model, res_id, noupdate) VALUES ($1,$2,$3,$4,true)`,
              params: [module, name, model, id],
            });
          }
        }
      });
    });
    if (!ok) return null;
    for (const child of level.children.values()) {
      const childRows = block.filter((r) => hasAny(child.level, rows[r]!));
      for (const sub of splitBlocks(child.level, childRows, rows)) {
        await this.importRecord(env, child.level, sub, rows, { field: child.field.inverseName!, id: id! }, stats);
      }
    }
    return id!;
  }

  private async guard(row: number, fn: () => Promise<void>): Promise<boolean> {
    try {
      await fn();
      return true;
    } catch (error) {
      if (error instanceof ImportAbort) throw error;
      this.fail(row, null, error instanceof EngineError ? error.message : 'The record could not be saved');
      return false;
    }
  }

  private async convert(env: Env, col: Column, cell: Cell | undefined): Promise<unknown> {
    const f = col.field!;
    if (f.type === 'many2one') {
      if (isEmpty(cell)) return null;
      return this.reference(env, f, col.mode, String(cell).trim());
    }
    if (f.type === 'many2many') {
      if (isEmpty(cell)) return [{ op: 'set', ids: [] }] satisfies X2ManyCommand[];
      const parts = splitList(String(cell));
      const ids: number[] = [];
      for (const p of parts) ids.push(await this.reference(env, f, col.mode, p));
      return [{ op: 'set', ids: [...new Set(ids)] }] satisfies X2ManyCommand[];
    }
    return convertScalar(f, cell);
  }

  private async reference(env: Env, f: Field, mode: Column['mode'], raw: string): Promise<number> {
    const comodel = f.comodel!;
    const key = `${comodel}\u0000${mode}\u0000${raw}`;
    const cached = this.refCache.get(key);
    if (cached !== undefined) return cached;
    let id: number;
    if (mode === 'xmlid') {
      const ref = await lookupXmlId(tenantDriver(env), raw);
      if (!ref || !(await rowExists(env, modelMeta(env, ref.model), ref.res_id))) throw new ValidationError(`No record found for external id '${raw}'`);
      if (ref.model !== comodel) throw new ValidationError(`External id '${raw}' is not a '${comodel}' record`);
      if (!(await visibleIds(env, comodel, [ref.res_id])).has(ref.res_id)) throw new ValidationError(`No record found for external id '${raw}'`);
      id = ref.res_id;
    } else if (mode === 'dbid') {
      id = toInteger(raw);
      if (id <= 0 || !(await visibleIds(env, comodel, [id])).has(id)) throw new ValidationError(`No '${comodel}' record with id ${raw}`);
    } else {
      id = await this.byName(env, comodel, raw);
    }
    this.refCache.set(key, id);
    return id;
  }

  /** Exact (then case-insensitive) match on the comodel's record name, through the caller's rights. */
  private async byName(env: Env, comodel: string, name: string): Promise<number> {
    const meta = modelMeta(env, comodel);
    const recName = meta.def.recName ?? (meta.fields.has('name') ? 'name' : null);
    if (!recName) throw new ValidationError(`'${comodel}' records cannot be matched by name; use an id column`);
    if ((await hiddenFields(impl(env), comodel)).has(recName)) throw new AccessError(`Field '${comodel}.${recName}' is restricted`);
    const rs = env.model(comodel);
    let found = (await rs.search([[recName, '=', name]], { limit: 2 })).ids;
    if (!found.length) {
      const pattern = name.replace(/[\\%_]/g, (c) => '\\' + c);
      found = (await rs.search([[recName, '=ilike', pattern]], { limit: 2 })).ids;
    }
    if (!found.length) throw new ValidationError(`No '${comodel}' record named '${name.slice(0, 80)}'`);
    if (found.length > 1) throw new ValidationError(`Several '${comodel}' records are named '${name.slice(0, 80)}'`);
    return found[0]!;
  }
}

async function resolveField(env: Env, meta: ResolvedModel, seg: string): Promise<Field> {
  let f = meta.fields.get(seg) as Field | undefined;
  const hidden = await hiddenFields(impl(env), meta.name);
  if (!f) {
    const lower = seg.toLowerCase();
    const matches = [...meta.fields.values()].filter((x) => !hidden.has(x.name) && (x.string ?? '').toLowerCase() === lower) as Field[];
    if (matches.length > 1) throw new ValidationError(`Column '${seg}' matches several fields of '${meta.name}'`);
    f = matches[0];
  }
  if (!f) throw new ValidationError(`Unknown field '${seg}' on '${meta.name}'`);
  if (hidden.has(f.name)) throw new AccessError(`Field '${meta.name}.${f.name}' is restricted`);
  if (MAGIC.has(f.name) || f.compute || f.computeExpr || f.related) {
    throw new ValidationError(`Field '${meta.name}.${f.name}' is computed and cannot be imported`);
  }
  if (f.type === 'binary') throw new ValidationError(`Binary field '${meta.name}.${f.name}' cannot be imported`);
  return f;
}

async function rowExists(env: Env, meta: ResolvedModel, id: number): Promise<boolean> {
  const rows = await tenantDriver(env).query({ text: `SELECT 1 FROM "${meta.table}" WHERE id = $1`, params: [id] });
  return rows.length > 0;
}

function hasAny(level: Level, row: Cell[]): boolean {
  if (level.keys.some((k) => !isEmpty(row[k.index]))) return true;
  for (const c of level.children.values()) if (hasAny(c.level, row)) return true;
  return false;
}

/** A row starts a new record when any key column of the level is filled; others continue it. */
function splitBlocks(level: Level, rowIdx: number[], rows: Cell[][]): number[][] {
  const blocks: number[][] = [];
  for (const r of rowIdx) {
    const starts = level.keys.length ? level.keys.some((k) => !isEmpty(rows[r]![k.index])) : true;
    if (starts || !blocks.length) blocks.push([r]);
    else blocks[blocks.length - 1]!.push(r);
  }
  return blocks;
}

function validateMatrix(header: unknown, rows: unknown): asserts rows is Cell[][] {
  const L = DATA_TRANSFER_LIMITS;
  if (!Array.isArray(header) || !header.length || header.length > L.maxColumns) throw new ValidationError(`The header must have 1 to ${L.maxColumns} columns`);
  if (header.some((h) => typeof h !== 'string')) throw new ValidationError('Header cells must be text');
  if (!Array.isArray(rows)) throw new ValidationError('Rows must be a list');
  if (rows.length > L.maxRows) throw new ValidationError(`At most ${L.maxRows} rows can be imported`);
  let size = 0;
  for (const row of rows) {
    if (!Array.isArray(row) || row.length > header.length) throw new ValidationError('Each row must be a list no longer than the header');
    for (const c of row) {
      if (c !== null && typeof c !== 'string' && typeof c !== 'number' && typeof c !== 'boolean') throw new ValidationError('Cells must be text, numbers, booleans or null');
      const n = typeof c === 'string' ? c.length : 8;
      if (n > L.maxCellChars) throw new ValidationError('A cell is too large');
      size += n;
    }
  }
  if (size > L.maxImportChars) throw new ValidationError('The import is too large');
}

/** Comma-separated list where names escape `\` and `,` with a backslash (round-trips with splitList). */
export function joinList(names: string[]): string {
  return names.map((n) => n.replace(/[\\,]/g, (c) => '\\' + c)).join(',');
}

export function splitList(raw: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (ch === '\\' && i + 1 < raw.length) { cur += raw[++i]!; continue; }
    if (ch === ',') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim()).filter(Boolean);
}

function toInteger(cell: Cell | undefined): number {
  if (typeof cell === 'number') {
    if (!Number.isSafeInteger(cell)) throw new ValidationError(`'${cell}' is not a whole number`);
    return cell;
  }
  const s = String(cell).trim();
  if (!/^[+-]?\d{1,15}$/.test(s)) throw new ValidationError(`'${s.slice(0, 40)}' is not a whole number`);
  return Number(s);
}

const TRUE = new Set(['1', 'true', 't', 'yes', 'y']);
const FALSE = new Set(['0', 'false', 'f', 'no', 'n']);

/** Converts an import cell to the ORM value for a non-relational field. */
export function convertScalar(f: FieldDef & { name: string }, cell: Cell | undefined): unknown {
  if (f.type === 'boolean') {
    if (isEmpty(cell)) return false;
    if (typeof cell === 'boolean') return cell;
    const s = String(cell).trim().toLowerCase();
    if (TRUE.has(s)) return true;
    if (FALSE.has(s)) return false;
    throw new ValidationError(`'${String(cell).slice(0, 40)}' is not a boolean (use true/false)`);
  }
  if (isEmpty(cell)) return null;
  const s = typeof cell === 'string' ? cell.trim() : String(cell);
  switch (f.type) {
    case 'char': case 'text': case 'html':
      return typeof cell === 'string' ? cell : s;
    case 'integer': {
      const n = toInteger(cell);
      if (n > 2_147_483_647 || n < -2_147_483_648) throw new ValidationError(`'${s}' is out of range`);
      return n;
    }
    case 'float': case 'monetary': {
      if (typeof cell === 'number') { if (!Number.isFinite(cell)) throw new ValidationError('Invalid number'); return cell; }
      if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) throw new ValidationError(`'${s.slice(0, 40)}' is not a number`);
      const n = Number(s);
      if (!Number.isFinite(n)) throw new ValidationError(`'${s.slice(0, 40)}' is not a number`);
      return n;
    }
    case 'date': {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      if (!m || !validDate(+m[1]!, +m[2]!, +m[3]!)) throw new ValidationError(`'${s.slice(0, 40)}' is not a date (YYYY-MM-DD)`);
      return s;
    }
    case 'datetime': {
      const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d{1,6})?Z?$/.exec(s);
      if (!m || !validDate(+m[1]!, +m[2]!, +m[3]!) || +m[4]! > 23 || +m[5]! > 59 || +(m[6] ?? 0) > 59) {
        throw new ValidationError(`'${s.slice(0, 40)}' is not a datetime (YYYY-MM-DD HH:MM:SS, UTC)`);
      }
      return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}Z`;
    }
    case 'selection': {
      const options = f.selection ?? [];
      const byValue = options.find(([v]) => v === s);
      if (byValue) return byValue[0];
      const byLabel = options.filter(([, l]) => l.toLowerCase() === s.toLowerCase());
      if (byLabel.length === 1) return byLabel[0]![0];
      throw new ValidationError(`'${s.slice(0, 40)}' is not a valid choice (${options.map(([v]) => v).join(', ').slice(0, 200)})`);
    }
    case 'json': {
      try { return JSON.parse(s) as unknown; } catch { throw new ValidationError('Invalid JSON value'); }
    }
    case 'reference':
      return s;
    default:
      throw new ValidationError(`Field type '${f.type}' cannot be imported`);
  }
}

function validDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// ---------------------------------------------------------------- export templates

export interface ExportTemplate { id: number; name: string; model: string; fields: string[] }

/** Saved export field lists (ir.exports-like), private to their owner. */
export class ExportTemplateService {
  constructor(private readonly env: Env) {}

  async save(model: string, name: string, fields: string[]): Promise<number> {
    if (typeof name !== 'string' || !name.trim() || name.length > 120) throw new ValidationError('Template name must contain 1 to 120 characters');
    await this.env.model(model).checkAccess('read');
    const exporter = new DataExportService(this.env);
    if (!Array.isArray(fields) || !fields.length || fields.length > DATA_TRANSFER_LIMITS.maxColumns) throw new ValidationError('Invalid template fields');
    for (const p of fields) await exporter.validatePath(model, splitPath(p));
    await ensureDataTransferTables(this.env);
    const [row] = await tenantDriver(this.env).query<{ id: number }>({
      text: `INSERT INTO nx_export_template(name, model, user_id, fields) VALUES ($1,$2,$3,$4::jsonb)
        ON CONFLICT (user_id, model, name) DO UPDATE SET fields = EXCLUDED.fields RETURNING id`,
      params: [name.trim(), model, this.env.uid, JSON.stringify(fields.map((f) => f.trim()))],
    });
    return Number(row!.id);
  }

  async list(model: string): Promise<ExportTemplate[]> {
    await this.env.model(model).checkAccess('read');
    await ensureDataTransferTables(this.env);
    const rows = await tenantDriver(this.env).query<ExportTemplate>({
      text: `SELECT id, name, model, fields FROM nx_export_template WHERE user_id = $1 AND model = $2 ORDER BY name, id`,
      params: [this.env.uid, model],
    });
    return rows.map((r) => ({ ...r, id: Number(r.id) }));
  }

  async remove(id: number): Promise<void> {
    positiveInt(id, 'template id');
    await ensureDataTransferTables(this.env);
    const rows = await tenantDriver(this.env).query({
      text: `DELETE FROM nx_export_template WHERE id = $1 AND user_id = $2 RETURNING id`, params: [id, this.env.uid],
    });
    if (!rows.length) throw new AccessError('Export template is unavailable');
  }
}
