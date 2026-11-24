// Load order matters: the services module installs the automation hooks and then the config hooks
// (services/config.ts chains onto automation). Mail chains onto both, so import them first.
import '../services/index.js';
import type { Env } from '../contracts/index.js';
import { recordHooks, setRecordHooks, type EnvImpl } from '../orm/env.js';
import {
  addFollowers, createMessage, isThread, mailInstalled, purgeDocuments, resolveSubtype, userPartner, type TrackingValue,
} from './message.js';
import { sanitizeHtml } from './sanitize.js';

type Row = Record<string, unknown>;
type ResolvedField = { name: string; type: string; string?: string; selection?: ReadonlyArray<readonly [string, string]>; comodel?: string; tracking?: boolean };

const TRACKABLE = new Set(['char', 'text', 'html', 'selection', 'boolean', 'integer', 'float', 'monetary', 'date', 'datetime', 'many2one']);

/** Tracked fields of a thread model among the written values. */
function trackedFields(env: EnvImpl, model: string, vals: Record<string, unknown>): ResolvedField[] {
  if (env.context.tracking_disable || !isThread(env, model)) return [];
  const meta = env.registry.get(model);
  return Object.keys(vals).map((name) => meta.fields.get(name) as ResolvedField | undefined)
    .filter((f): f is ResolvedField => !!f && !!f.tracking && TRACKABLE.has(f.type));
}

async function snapshot(env: Env, model: string, ids: readonly number[], fields: ResolvedField[]): Promise<Map<number, Row>> {
  const rows = await env.sudo().withContext({ activeTest: false }).model(model).browse([...ids]).read(fields.map((f) => f.name));
  return new Map(rows.map((r) => [r.id as number, r]));
}

function scalarKey(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value ?? null);
}

function asDatetime(value: unknown): string | null {
  if (value === null || value === undefined || value === false) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

async function trackingValues(env: Env, field: ResolvedField, before: unknown, after: unknown): Promise<TrackingValue> {
  const out: TrackingValue = { field: field.name, field_desc: field.string ?? field.name, field_type: field.type };
  switch (field.type) {
    case 'integer':
      out.old_value_integer = (before as number | null) ?? null; out.new_value_integer = (after as number | null) ?? null; break;
    case 'float': case 'monetary':
      out.old_value_float = before === null || before === undefined ? null : Number(before);
      out.new_value_float = after === null || after === undefined ? null : Number(after); break;
    case 'date': case 'datetime':
      out.old_value_datetime = asDatetime(before); out.new_value_datetime = asDatetime(after); break;
    case 'many2one': {
      out.old_value_integer = (before as number | null) ?? null; out.new_value_integer = (after as number | null) ?? null;
      const ids = [before, after].filter((v): v is number => typeof v === 'number');
      const names = new Map((ids.length ? await env.sudo().withContext({ activeTest: false }).model(field.comodel!).browse(ids).read(['display_name']) : [])
        .map((r) => [r.id as number, String(r.display_name ?? '')]));
      out.old_value_char = typeof before === 'number' ? names.get(before) ?? null : null;
      out.new_value_char = typeof after === 'number' ? names.get(after) ?? null : null;
      break;
    }
    case 'selection': {
      const label = (v: unknown) => (v === null || v === undefined ? null : field.selection?.find(([k]) => k === v)?.[1] ?? String(v));
      out.old_value_char = label(before); out.new_value_char = label(after); break;
    }
    case 'boolean':
      out.old_value_char = before ? 'True' : 'False'; out.new_value_char = after ? 'True' : 'False'; break;
    default:
      out.old_value_char = before === null || before === undefined ? null : String(before).slice(0, 10_000);
      out.new_value_char = after === null || after === undefined ? null : String(after).slice(0, 10_000);
  }
  return out;
}

/**
 * HTML fields of mail models that ordinary users can write through the ORM: re-sanitized in place after
 * every create/write (whatever the path), so stored values never carry active content.
 */
// mail.template.body_html is deliberately absent: it is template SOURCE ({% if a < b %}, quotes inside
// {{ }}), which HTML re-serialization would corrupt; its rendered output is always sanitized instead.
const SANITIZED: Record<string, string[]> = { 'mail.activity': ['note'] };

async function sanitizeStored(env: EnvImpl, model: string, ids: readonly number[], written?: Record<string, unknown>): Promise<void> {
  const fields = (SANITIZED[model] ?? []).filter((f) => !written || f in written);
  if (!fields.length || !ids.length || !mailInstalled(env)) return;
  const meta = env.registry.get(model);
  for (const name of fields) {
    const field = meta.fields.get(name);
    if (!field || !meta.table) continue;
    const rows = await env.db.query<{ id: number; v: unknown }>({
      text: `SELECT id, "${name}" AS v FROM "${meta.table}" WHERE id = ANY($1) AND "${name}" IS NOT NULL`, params: [[...ids]],
    });
    for (const row of rows) {
      let next: unknown;
      if (field.translate) {
        const map = (typeof row.v === 'string' ? JSON.parse(row.v) : row.v) as Record<string, unknown>;
        const clean = Object.fromEntries(Object.entries(map).map(([k, v]) => [k, typeof v === 'string' ? sanitizeHtml(v) : v]));
        if (JSON.stringify(clean) === JSON.stringify(map)) continue;
        next = JSON.stringify(clean);
      } else {
        const clean = sanitizeHtml(String(row.v));
        if (clean === row.v) continue;
        next = clean;
      }
      await env.db.query({
        text: `UPDATE "${meta.table}" SET "${name}" = $1${field.translate ? '::jsonb' : ''} WHERE id = $2`, params: [next, row.id],
      });
    }
  }
  env.cache.invalidate(model, ids);
}

interface TrackState { fields: ResolvedField[]; before: Map<number, Row> }

const previous = recordHooks();
if (!previous) throw new Error('Automation and config record hooks must be installed before the mail hooks');

/**
 * Mail record hooks, chained after the automation/config hooks:
 * - afterCreate: the creator follows new thread records (context `mail_create_nosubscribe` skips it);
 * - beforeWrite/afterWrite: tracked fields are diffed and one notification message per changed record
 *   is created in the same transaction, BEFORE the automation hooks fire (they see the message);
 * - beforeUnlink: messages, followers and activities of deleted documents are removed.
 * All of it is inert when the mail module is not installed in the tenant.
 */
setRecordHooks({
  afterCreate: async (env, model, ids) => {
    await sanitizeStored(env, model, ids);
    if (isThread(env, model) && !env.context.mail_create_nosubscribe) {
      const partner = await userPartner(env);
      if (partner !== null) for (const id of ids) await addFollowers(env, model, id, [partner]);
    }
    await previous.afterCreate(env, model, ids);
  },
  beforeWrite: async (env, model, ids, vals) => {
    const fields = trackedFields(env, model, vals);
    const track: TrackState | undefined = fields.length ? { fields, before: await snapshot(env, model, ids, fields) } : undefined;
    return { track, previous: await previous.beforeWrite(env, model, ids, vals) };
  },
  afterWrite: async (env, model, ids, vals, state) => {
    await sanitizeStored(env, model, ids, vals);
    const chained = state as { track?: TrackState; previous?: unknown } | undefined;
    const track = chained?.track;
    if (track) {
      const after = await snapshot(env, model, ids, track.fields);
      let subtype: number | undefined;
      for (const id of ids) {
        const old = track.before.get(id);
        const now = after.get(id);
        if (!old || !now) continue;
        const values: TrackingValue[] = [];
        for (const field of track.fields) {
          if (scalarKey(old[field.name]) !== scalarKey(now[field.name])) values.push(await trackingValues(env, field, old[field.name], now[field.name]));
        }
        if (!values.length) continue;
        subtype ??= await resolveSubtype(env, 'mail.mt_note');
        await createMessage(env, { model, resId: id, body: '', messageType: 'notification', subtypeId: subtype, tracking: values });
      }
    }
    await previous.afterWrite(env, model, ids, vals, chained?.previous);
  },
  beforeUnlink: async (env, model, ids) => {
    await previous.beforeUnlink(env, model, ids);
    if (mailInstalled(env) && !model.startsWith('mail.')) await purgeDocuments(env, model, ids);
  },
});
