import { AccessError, ValidationError, type Env, type Recordset, type SqlDriver } from '../contracts/index.js';
import { userSecurity } from '../security/access.js';
import type { EnvImpl } from '../orm/env.js';
import { registerExpressionHelper } from '../orm/expr-helpers.js';
import { ensureServiceTables, nonNegativeInt, positiveInt, requireKey, tenantDriver } from './common.js';

export interface SequenceOptions {
  /** Legacy call-time configuration, used only when no `ir.sequence` record exists for the code. */
  prefix?: string; padding?: number; step?: number;
  /** Date the number is issued for (date-range selection and interpolation). Defaults to now in the user's tz. */
  date?: Date | string;
  /** Company whose sequence is preferred over the global one. Defaults to the env's current company. */
  companyId?: number;
  /** Refuse a sequence that is not `no_gap` (ADR 0004 I4: gapless document numbers). */
  requireNoGap?: boolean;
}

const PLACEHOLDER = /%\(([a-z0-9_]+)\)s/g;
const DATE_KEYS = ['year', 'month', 'day', 'y', 'doy', 'woy', 'weekday', 'h24', 'h12', 'min', 'sec'] as const;
export const SEQUENCE_PLACEHOLDERS: readonly string[] = [...DATE_KEYS, ...DATE_KEYS.map((k) => `range_${k}`)];
const MAX_PADDING = 32;

interface LocalDate { year: number; month: number; day: number; hour: number; minute: number; second: number }

function two(n: number): string { return String(n).padStart(2, '0'); }

/** Wall-clock parts of `at` in `tz` (IANA name). */
export function localParts(at: Date, tz: string): LocalDate {
  if (!Number.isFinite(at.getTime())) throw new ValidationError('Invalid sequence date');
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
  } catch {
    throw new ValidationError(`Unknown time zone '${tz}'`);
  }
  const parts = Object.fromEntries(format.formatToParts(at).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour) % 24, minute: Number(parts.minute), second: Number(parts.second),
  };
}

function parseDateOnly(value: string): LocalDate {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) throw new ValidationError('Sequence date must be a Date or YYYY-MM-DD');
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new ValidationError('Invalid sequence date');
  }
  return { year, month, day, hour: 0, minute: 0, second: 0 };
}

function isoDate(d: LocalDate): string { return `${String(d.year).padStart(4, '0')}-${two(d.month)}-${two(d.day)}`; }

/** strftime-like values (Odoo sequence placeholders) for one local date. */
function placeholderValues(d: LocalDate, prefix = ''): Record<string, string> {
  const utc = Date.UTC(d.year, d.month - 1, d.day);
  const yday = Math.round((utc - Date.UTC(d.year, 0, 1)) / 86_400_000); // 0-based
  const weekday = new Date(utc).getUTCDay(); // 0 = Sunday
  const mondayIndex = (weekday + 6) % 7;
  const woy = Math.floor((yday + 7 - mondayIndex) / 7); // Monday-first week number (strftime %W)
  return {
    [`${prefix}year`]: String(d.year).padStart(4, '0'), [`${prefix}month`]: two(d.month), [`${prefix}day`]: two(d.day),
    [`${prefix}y`]: two(d.year % 100), [`${prefix}doy`]: String(yday + 1).padStart(3, '0'), [`${prefix}woy`]: two(woy),
    [`${prefix}weekday`]: String(weekday), [`${prefix}h24`]: two(d.hour), [`${prefix}h12`]: two(d.hour % 12 || 12),
    [`${prefix}min`]: two(d.minute), [`${prefix}sec`]: two(d.second),
  };
}

/** Replaces `%(name)s` placeholders; unknown names are rejected rather than emitted verbatim. */
export function interpolateSequence(template: string | null | undefined, values: Readonly<Record<string, string>>): string {
  if (!template) return '';
  return template.replace(PLACEHOLDER, (_, key: string) => {
    if (!Object.hasOwn(values, key)) throw new ValidationError(`Unknown sequence placeholder '%(${key})s'`);
    return values[key]!;
  });
}

function validateTemplate(template: unknown, label: string): void {
  if (template === null || template === undefined || template === false) return;
  if (typeof template !== 'string' || template.length > 256) throw new ValidationError(`Invalid sequence ${label}`);
  const known = new Set(SEQUENCE_PLACEHOLDERS);
  for (const [, key] of template.matchAll(PLACEHOLDER)) {
    if (!known.has(key!)) throw new ValidationError(`Unknown sequence placeholder '%(${key})s' in ${label}`);
  }
}

interface SequenceRow {
  id: number | string; prefix: string | null; suffix: string | null; padding: number; number_next: number | string;
  number_increment: number; implementation: 'standard' | 'no_gap'; use_date_range: boolean | null; date_range_period: string | null;
}

export function sequenceRegistered(env: Env): boolean {
  return (env as EnvImpl).registry.models.has('ir.sequence');
}

/** PostgreSQL sequence backing a `standard` sequence (or one of its date ranges). Ids are integers. */
function pgSequenceName(sequenceId: number, rangeId?: number): string {
  return rangeId === undefined ? `ir_sequence_${sequenceId}` : `ir_sequence_${sequenceId}_${rangeId}`;
}

async function currentCompany(env: Env): Promise<number | null> {
  const ids = (env as EnvImpl).companyIds ?? [];
  if (ids.length) return ids[0]!;
  const [row] = await tenantDriver(env).query<{ company_id: number | string | null }>({
    text: `SELECT company_id FROM res_users WHERE id=$1`, params: [env.uid],
  }).catch(() => []);
  return row?.company_id == null ? null : Number(row.company_id);
}

/** Companies the env may act for: its active companies, else the user's allowed companies. */
async function allowedCompanies(env: Env): Promise<number[]> {
  const ids = (env as EnvImpl).companyIds ?? [];
  if (ids.length) return ids;
  try { return [...(await userSecurity(env as Parameters<typeof userSecurity>[0])).allowedCompanyIds]; } catch { return []; }
}

/** Next number of the `ir.sequence` record for `code` (company-specific first, then global), or null. */
export async function nextFromRecord(env: Env, code: string, options: SequenceOptions): Promise<string | null> {
  let companyId: number | null;
  if (options.companyId !== undefined) {
    companyId = positiveInt(options.companyId, 'company id');
    if (!env.su && !(await allowedCompanies(env)).includes(companyId)) throw new AccessError('Company is not allowed');
  } else companyId = await currentCompany(env);
  const tz = typeof env.context.tz === 'string' && env.context.tz ? env.context.tz : 'UTC';
  const issued = options.date === undefined ? localParts(new Date(), tz)
    : typeof options.date === 'string' ? parseDateOnly(options.date)
      : options.date instanceof Date ? localParts(options.date, tz)
        : (() => { throw new ValidationError('Sequence date must be a Date or YYYY-MM-DD'); })();
  return env.transaction(async (tx) => {
    const db = tenantDriver(tx);
    const [seq] = await db.query<SequenceRow>({
      text: `SELECT id, prefix, suffix, padding, number_next, number_increment, implementation, use_date_range, date_range_period
        FROM ir_sequence WHERE code=$1 AND active AND (company_id IS NULL OR company_id = $2::bigint)
        ORDER BY company_id NULLS LAST, id LIMIT 1`,
      params: [code, companyId],
    });
    if (!seq) return null;
    const seqId = Number(seq.id);
    if (options.requireNoGap && seq.implementation !== 'no_gap') throw new ValidationError(`Sequence '${code}' must use the no_gap implementation`);
    const step = seq.number_increment;
    let range: { id: number; date_from: string } | undefined;
    if (seq.use_date_range) range = await dateRange(tx, seqId, seq.date_range_period === 'month' ? 'month' : 'year', issued);
    let number: number;
    if (seq.implementation === 'no_gap') {
      const [row] = range
        ? await db.query<{ issued: string | number }>({
          text: `UPDATE ir_sequence_date_range SET number_next = number_next + $2 WHERE id=$1 RETURNING number_next - $2 AS issued`,
          params: [range.id, step] })
        : await db.query<{ issued: string | number }>({
          text: `UPDATE ir_sequence SET number_next = number_next + $2 WHERE id=$1 RETURNING number_next - $2 AS issued`,
          params: [seqId, step] });
      number = Number(row!.issued);
    } else {
      const name = pgSequenceName(seqId, range?.id);
      if (!(await exists(db, name))) {
        // first draw: create under the sequence row lock (serializes with concurrent creators and record edits)
        const [locked] = await db.query<{ number_increment: number }>({
          text: `SELECT number_increment FROM ir_sequence WHERE id=$1 FOR UPDATE`, params: [seqId] });
        const [start] = range
          ? await db.query<{ n: string | number }>({ text: `SELECT number_next AS n FROM ir_sequence_date_range WHERE id=$1`, params: [range.id] })
          : await db.query<{ n: string | number }>({ text: `SELECT number_next AS n FROM ir_sequence WHERE id=$1`, params: [seqId] });
        const first = Math.max(1, Number(start!.n));
        await db.query({
          text: `CREATE SEQUENCE IF NOT EXISTS "${name}" INCREMENT BY ${Number(locked!.number_increment)} START WITH ${first} MINVALUE 1`, params: [] });
      }
      const [row] = await db.query<{ v: string | number }>({ text: `SELECT nextval('"${name}"') AS v`, params: [] });
      number = Number(row!.v);
    }
    const values = {
      ...placeholderValues(issued),
      ...placeholderValues(range ? parseDateOnly(range.date_from) : issued, 'range_'),
    };
    return `${interpolateSequence(seq.prefix, values)}${String(number).padStart(seq.padding, '0')}${interpolateSequence(seq.suffix, values)}`;
  });
}

async function dateRange(env: Env, seqId: number, period: 'year' | 'month', at: LocalDate): Promise<{ id: number; date_from: string }> {
  const db = tenantDriver(env);
  const day = isoDate(at);
  const find = async () => (await db.query<{ id: number | string; date_from: string }>({
    text: `SELECT id, date_from::text AS date_from FROM ir_sequence_date_range
      WHERE sequence_id=$1 AND date_from <= $2::date AND date_to >= $2::date ORDER BY date_from DESC, id DESC LIMIT 1`,
    params: [seqId, day],
  }))[0];
  let found = await find();
  if (!found) {
    // serialize range creation per sequence, then re-check
    await db.query({ text: `SELECT id FROM ir_sequence WHERE id=$1 FOR UPDATE`, params: [seqId] });
    found = await find();
    if (!found) {
      const from = period === 'month' ? { ...at, day: 1 } : { ...at, month: 1, day: 1 };
      const lastDay = new Date(Date.UTC(at.year, period === 'month' ? at.month : 12, 0)).getUTCDate();
      const to = period === 'month' ? { ...at, day: lastDay } : { ...at, month: 12, day: 31 };
      await env.sudo().model('ir.sequence.date_range').create({ sequence_id: seqId, date_from: isoDate(from), date_to: isoDate(to), number_next: 1 });
      found = await find();
    }
  }
  return { id: Number(found!.id), date_from: found!.date_from };
}

/** Legacy counter stored in nx_sequence, configured at call time. */
export async function legacyNext(env: Env, code: string, options: SequenceOptions): Promise<string> {
  const step = positiveInt(options.step ?? 1, 'sequence step');
  const padding = nonNegativeInt(options.padding ?? 5, 'sequence padding');
  const prefix = options.prefix ?? '';
  return env.transaction(async (tx) => {
    await ensureServiceTables(tx);
    await tenantDriver(tx).query({
      text: `INSERT INTO nx_sequence(code, step, padding, prefix) VALUES ($1,$2,$3,$4) ON CONFLICT (code) DO NOTHING`,
      params: [code, step, padding, prefix],
    });
    const [row] = await tenantDriver(tx).query<{ issued: number; step: number; padding: number; prefix: string }>({
      text: `UPDATE nx_sequence SET next_number = next_number + step WHERE code = $1 RETURNING next_number - step AS issued, step, padding, prefix`,
      params: [code],
    });
    return `${row!.prefix}${String(row!.issued).padStart(row!.padding, '0')}`;
  });
}

/**
 * Database-backed numbering. An active `ir.sequence` record with the code (company-specific preferred
 * over global) supplies the configuration; otherwise the legacy call-time options apply.
 * Numbers are issued with the sequence's own rights (no ACL on ir.sequence is needed to draw a number).
 */
export class SequenceService {
  constructor(private readonly env: Env) {}

  async next(code: string, options: SequenceOptions = {}): Promise<string> {
    requireKey(code, 'sequence code');
    if (sequenceRegistered(this.env)) {
      const value = await nextFromRecord(this.env, code, options);
      if (value !== null) return value;
    }
    return legacyNext(this.env, code, options);
  }
}

/**
 * NX-Expr `sequence_next(code, company_id?)`: Odoo `ir.sequence.next_by_code` for no-code create-time
 * defaults and server-action / automation field values. Access model: like SequenceService, drawing a number
 * needs no ACL on ir.sequence (the configuration is read with the sequence's own rights, so plain
 * users can number their documents); the caller's identity still decides the company: the env's
 * current company by default, or an explicit company that must be one of the caller's allowed
 * companies. Only `ir.sequence` records are used (no implicit legacy counter is created for an
 * unknown code); an unknown code returns null like next_by_code's False. The helper has side
 * effects, so it is impure (rejected in stored computes) and refused in read-only evaluations:
 * computed fields, constraints, onchange, button guards and action messages; default_get omits such a
 * default (the number is drawn by create).
 * Within one expression evaluation identical calls are memoized and return the same number.
 */
registerExpressionHelper('sequence_next', {
  sideEffects: true,
  resolve: async (env, [code, company]) => {
    if (typeof code !== 'string' || !code.trim() || code.length > 128) throw new ValidationError('sequence_next requires a sequence code');
    if (company !== undefined && company !== null && (typeof company !== 'number' || !Number.isSafeInteger(company) || company <= 0)) {
      throw new ValidationError('sequence_next company must be a company id');
    }
    if (!sequenceRegistered(env)) return null;
    return nextFromRecord(env, code, typeof company === 'number' ? { companyId: company } : {});
  },
});

// ---------- record validation and PostgreSQL-sequence bookkeeping ----------

export async function checkSequences(records: Recordset): Promise<void> {
  const rows = await tenantDriver(records.env).query<{
    id: number; code: string; prefix: string | null; suffix: string | null; padding: number; number_next: string | number; number_increment: number; dup: boolean;
  }>({
    text: `SELECT s.id, s.code, s.prefix, s.suffix, s.padding, s.number_next, s.number_increment,
        EXISTS (SELECT 1 FROM ir_sequence o WHERE o.id <> s.id AND o.code = s.code AND o.company_id IS NOT DISTINCT FROM s.company_id) AS dup
      FROM ir_sequence s WHERE s.id = ANY($1)`,
    params: [[...records.ids]],
  });
  for (const row of rows) {
    requireKey(row.code, 'sequence code');
    if (row.dup) throw new ValidationError(`Sequence code '${row.code}' already exists for this company`);
    validateTemplate(row.prefix, 'prefix');
    validateTemplate(row.suffix, 'suffix');
    if (!Number.isSafeInteger(row.padding) || row.padding < 0 || row.padding > MAX_PADDING) throw new ValidationError(`Sequence padding must be between 0 and ${MAX_PADDING}`);
    if (!Number.isSafeInteger(row.number_increment) || row.number_increment <= 0) throw new ValidationError('Sequence step must be a positive integer');
    if (Number(row.number_next) < 1) throw new ValidationError('Next number must be at least 1');
  }
}

export async function checkSequenceRanges(records: Recordset): Promise<void> {
  const rows = await tenantDriver(records.env).query<{ bad_order: boolean; overlap: boolean; number_next: string | number }>({
    text: `SELECT r.date_from > r.date_to AS bad_order, r.number_next,
        EXISTS (SELECT 1 FROM ir_sequence_date_range o WHERE o.id <> r.id AND o.sequence_id = r.sequence_id
          AND o.date_from <= r.date_to AND o.date_to >= r.date_from) AS overlap
      FROM ir_sequence_date_range r WHERE r.id = ANY($1)`,
    params: [[...records.ids]],
  });
  for (const row of rows) {
    if (row.bad_order) throw new ValidationError('A date range must start before it ends');
    if (row.overlap) throw new ValidationError('Date ranges of a sequence must not overlap');
    if (Number(row.number_next) < 1) throw new ValidationError('Next number must be at least 1');
  }
}

async function exists(db: SqlDriver, name: string): Promise<boolean> {
  const [row] = await db.query<{ r: string | null }>({ text: `SELECT to_regclass($1)::text AS r`, params: [name] });
  return Boolean(row?.r);
}

/** Next value a standard sequence would issue, or null if no PostgreSQL sequence exists yet. */
async function pendingValue(db: SqlDriver, name: string): Promise<number | null> {
  if (!(await exists(db, name))) return null;
  const [row] = await db.query<{ last_value: string | number; is_called: boolean; inc: string | number }>({
    text: `SELECT s.last_value, s.is_called, q.seqincrement AS inc FROM "${name}" s, pg_sequence q WHERE q.seqrelid = $1::regclass`,
    params: [name],
  });
  if (!row) return null;
  return row.is_called ? Number(row.last_value) + Number(row.inc) : Number(row.last_value);
}

/**
 * Blocks concurrent nextval() on the PostgreSQL sequence until commit (ALTER SEQUENCE takes a lock that
 * conflicts with nextval; LOCK TABLE does not accept sequences), so a pending value read afterwards is final.
 */
async function lockPg(db: SqlDriver, name: string): Promise<boolean> {
  if (!(await exists(db, name))) return false;
  await db.query({ text: `ALTER SEQUENCE "${name}" NO CYCLE`, params: [] });
  return true;
}

interface Counter { table: 'ir_sequence' | 'ir_sequence_date_range'; id: number; name: string; standard: boolean }
type CounterRow = { id: number | string; sequence_id: number | string; implementation: string };

function rangeCounter(r: CounterRow): Counter {
  return {
    table: 'ir_sequence_date_range', id: Number(r.id), name: pgSequenceName(Number(r.sequence_id), Number(r.id)),
    standard: r.implementation === 'standard',
  };
}

/** Counters (sequence rows and optionally their ranges) of a write on `model`; sequence rows are locked FOR UPDATE. */
async function counters(db: SqlDriver, model: string, ids: readonly number[], withRanges: boolean): Promise<Counter[]> {
  if (model === 'ir.sequence') {
    const seqs = await db.query<{ id: number | string; implementation: string }>({
      text: `SELECT id, implementation FROM ir_sequence WHERE id = ANY($1) ORDER BY id FOR UPDATE`, params: [[...ids]] });
    const out: Counter[] = seqs.map((s) => ({
      table: 'ir_sequence', id: Number(s.id), name: pgSequenceName(Number(s.id)), standard: s.implementation === 'standard',
    }));
    if (!withRanges || !seqs.length) return out;
    const ranges = await db.query<CounterRow>({
      text: `SELECT r.id, r.sequence_id, s.implementation FROM ir_sequence_date_range r JOIN ir_sequence s ON s.id = r.sequence_id
        WHERE r.sequence_id = ANY($1) ORDER BY r.id`, params: [[...ids]] });
    return [...out, ...ranges.map(rangeCounter)];
  }
  if (model === 'ir.sequence.date_range') {
    const ranges = await db.query<CounterRow>({
      text: `SELECT r.id, r.sequence_id, s.implementation FROM ir_sequence_date_range r JOIN ir_sequence s ON s.id = r.sequence_id
        WHERE r.id = ANY($1) ORDER BY r.sequence_id, r.id`, params: [[...ids]] });
    if (ranges.length) {
      await db.query({
        text: `SELECT id FROM ir_sequence WHERE id = ANY($1) ORDER BY id FOR UPDATE`,
        params: [[...new Set(ranges.map((r) => Number(r.sequence_id)))]],
      });
    }
    return ranges.map(rangeCounter);
  }
  return [];
}

/**
 * Before a write that touches counters of standard sequences: lock the sequence rows and their
 * PostgreSQL sequences, then
 *  - reject an explicit number_next below the value the sequence would issue next (no reuse);
 *  - when the step or implementation changes, copy the pending value back into number_next.
 * Unchanged number_next values (full-record saves) are no-ops. Returns the pending values (hook state).
 */
export async function sequenceBeforeWrite(env: Env, model: string, ids: readonly number[], vals: Record<string, unknown>): Promise<Map<string, number> | undefined> {
  if (model !== 'ir.sequence' && model !== 'ir.sequence.date_range') return undefined;
  const structural = model === 'ir.sequence' && ('implementation' in vals || 'number_increment' in vals);
  if (!structural && !('number_next' in vals)) return undefined;
  const db = tenantDriver(env);
  const ownTable = model === 'ir.sequence' ? 'ir_sequence' : 'ir_sequence_date_range';
  const pending = new Map<string, number>();
  for (const c of await counters(db, model, ids, structural)) {
    // a no_gap counter keeps its (unused) PostgreSQL sequence: it is only restarted on structural changes
    if ((!c.standard && !structural) || !(await lockPg(db, c.name))) continue;
    const value = await pendingValue(db, c.name);
    if (value === null) continue;
    pending.set(c.name, value);
    if (!c.standard) continue; // number_next is authoritative for no_gap counters
    if (c.table === ownTable && 'number_next' in vals) {
      if (Number(vals.number_next) < value) throw new ValidationError(`Next number cannot be lower than ${value} (already issued)`);
    } else if (structural) {
      await db.query({ text: `UPDATE ${c.table} SET number_next=$2 WHERE id=$1`, params: [c.id, value] });
    }
  }
  return pending;
}

/** After the write: restart the locked PostgreSQL sequences from the new number_next/step when they changed. */
export async function sequenceAfterWrite(
  env: Env, model: string, ids: readonly number[], vals: Record<string, unknown>, state: Map<string, number> | undefined,
): Promise<void> {
  if (!state?.size) return;
  const db = tenantDriver(env);
  const structural = model === 'ir.sequence' && ('implementation' in vals || 'number_increment' in vals);
  for (const c of await counters(db, model, ids, structural)) {
    const pending = state.get(c.name);
    if (pending === undefined) continue;
    const [row] = c.table === 'ir_sequence'
      ? await db.query<{ n: string | number; step: number }>({
        text: `SELECT number_next AS n, number_increment AS step FROM ir_sequence WHERE id=$1`, params: [c.id] })
      : await db.query<{ n: string | number; step: number }>({
        text: `SELECT r.number_next AS n, s.number_increment AS step FROM ir_sequence_date_range r
          JOIN ir_sequence s ON s.id = r.sequence_id WHERE r.id=$1`, params: [c.id] });
    if (!row || (!structural && Number(row.n) === pending)) continue;
    await db.query({ text: `ALTER SEQUENCE "${c.name}" INCREMENT BY ${Number(row.step)} RESTART WITH ${Math.max(1, Number(row.n))}`, params: [] });
  }
}

/** Drops the PostgreSQL sequences of records about to be deleted (cascade deletes are not covered). */
export async function dropBacking(env: Env, model: string, ids: readonly number[]): Promise<void> {
  if (model !== 'ir.sequence' && model !== 'ir.sequence.date_range') return;
  const db = tenantDriver(env);
  for (const c of await counters(db, model, ids, true)) await db.query({ text: `DROP SEQUENCE IF EXISTS "${c.name}"`, params: [] });
}

/** Display value of number_next: the pending PostgreSQL value for standard sequences. */
export async function computeNumberNextActual(records: Recordset): Promise<Map<number, unknown>> {
  const db = tenantDriver(records.env);
  const out = new Map<number, unknown>();
  const ids = [...records.ids];
  const rows = records.model === 'ir.sequence'
    ? await db.query<CounterRow & { n: string | number }>({
      text: `SELECT id, id AS sequence_id, number_next AS n, implementation FROM ir_sequence WHERE id = ANY($1)`, params: [ids] })
    : await db.query<CounterRow & { n: string | number }>({
      text: `SELECT r.id, r.sequence_id, r.number_next AS n, s.implementation FROM ir_sequence_date_range r
        JOIN ir_sequence s ON s.id = r.sequence_id WHERE r.id = ANY($1)`, params: [ids] });
  for (const r of rows) {
    const name = records.model === 'ir.sequence' ? pgSequenceName(Number(r.id)) : pgSequenceName(Number(r.sequence_id), Number(r.id));
    const pending = r.implementation === 'standard' ? await pendingValue(db, name) : null;
    out.set(Number(r.id), pending ?? Number(r.n));
  }
  return out;
}
