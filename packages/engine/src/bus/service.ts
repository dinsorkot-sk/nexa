import { ValidationError, type Env } from '../contracts/index.js';
import { tenantDriver } from '../services/common.js';
import { busTransport, MAX_ENVELOPE_BYTES } from './transport.js';

/** Admin-only tenant broadcast channel. */
export const BROADCAST_CHANNEL = 'broadcast';
const MODEL_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;
const TYPE_RE = /^[a-z][a-z0-9_.]{0,63}$/;
/** Channels per NOTIFY: keeps envelopes far below the payload limit. */
const CHANNELS_PER_ENVELOPE = 100;

export type RecordRef = readonly [model: string, id: number];

/** On-the-wire envelope (kept short: it travels as a NOTIFY payload). */
export interface Envelope {
  /** target channels */
  c: string[];
  /** event type */
  t: string;
  /** small JSON payload (ids only; clients refetch through the normal API) */
  p: Record<string, unknown>;
  /** record every subscriber must currently be able to read */
  r?: RecordRef;
  /** internal (note) subtype: never delivered to portal/public users */
  n?: 1;
  /** the record is being deleted: it can no longer be read, see hub.ts */
  u?: 1;
  /** model-level event (bulk change): delivered on explicit record channels of this model with model read ACL */
  m?: string;
}

export function userChannel(uid: number): string { return `res.users,${uid}`; }
export function partnerChannel(partnerId: number): string { return `res.partner,${partnerId}`; }
export function recordChannel(model: string, id: number): string { return `${model},${id}`; }

/** Parse a `model,id` channel; undefined when malformed. */
export function parseRecordChannel(channel: string): RecordRef | undefined {
  if (typeof channel !== 'string' || channel.length > 140) return undefined;
  const at = channel.lastIndexOf(',');
  if (at <= 0) return undefined;
  const model = channel.slice(0, at);
  const raw = channel.slice(at + 1);
  if (!MODEL_RE.test(model) || model.length > 120 || !/^[1-9][0-9]{0,9}$/.test(raw)) return undefined;
  const id = Number(raw);
  return id <= 2_147_483_647 ? [model, id] : undefined;
}

export interface PublishOptions {
  /** record the subscriber must be able to read for the event to be delivered */
  record?: RecordRef;
  /** internal subtype (never delivered to non-internal users) */
  internal?: boolean;
  /** record deletion event (see hub.ts for the access rule) */
  unlink?: boolean;
  /** model-level event: subscribers need read ACL on this model and an explicit channel of it */
  model?: string;
}

function isPersonal(channel: string): boolean {
  return channel === BROADCAST_CHANNEL || channel.startsWith('res.users,') || channel.startsWith('res.partner,');
}

/** Models whose create/write/unlink are announced on their record channels (opt-in). */
const notifyModels = new Set<string>();
/** Opt models into record change notifications (`{model, id, op, write_date}` only, never values). */
export function registerBusModels(...models: string[]): void {
  for (const m of models) {
    if (!MODEL_RE.test(m)) throw new ValidationError('Invalid model name');
    notifyModels.add(m);
  }
}
export function unregisterBusModels(...models: string[]): void { for (const m of models) notifyModels.delete(m); }
export function busNotifies(model: string): boolean { return notifyModels.has(model); }

function validChannel(channel: string): boolean {
  return channel === BROADCAST_CHANNEL || parseRecordChannel(channel) !== undefined;
}

/**
 * Publishes bus events (Odoo bus concepts). Envelopes are sent through the env's database driver, so
 * they join the surrounding transaction and are delivered to subscribers only after it commits; a
 * rollback drops them. Payloads must be small JSON objects carrying ids only.
 * Server-side API: no access check is made here, delivery filters per subscriber (see BusHub).
 */
export class BusService {
  constructor(private readonly env: Env) {}

  async publish(channel: string | readonly string[], type: string, payload: Record<string, unknown> = {}, opts: PublishOptions = {}): Promise<void> {
    const channels = [...new Set(typeof channel === 'string' ? [channel] : channel)];
    if (!channels.length) return;
    if (!channels.every(validChannel)) throw new ValidationError('Invalid bus channel');
    if (!TYPE_RE.test(type)) throw new ValidationError('Invalid bus event type');
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new ValidationError('Bus payload must be an object');
    if (opts.record && !parseRecordChannel(recordChannel(opts.record[0], opts.record[1]))) throw new ValidationError('Invalid bus record');
    if (opts.model !== undefined && !MODEL_RE.test(opts.model)) throw new ValidationError('Invalid bus model');
    // record channels need an access target: default to the record itself when it is unambiguous
    if (!opts.record && opts.model === undefined) {
      const records = channels.filter((ch) => !isPersonal(ch));
      if (records.length > 1) throw new ValidationError('Events on several record channels need an explicit access target');
      if (records.length === 1) opts = { ...opts, record: parseRecordChannel(records[0]!)! };
    }
    const driver = tenantDriver(this.env);
    for (let i = 0; i < channels.length; i += CHANNELS_PER_ENVELOPE) {
      const env: Envelope = {
        c: channels.slice(i, i + CHANNELS_PER_ENVELOPE), t: type, p: payload,
        ...(opts.record ? { r: [opts.record[0], opts.record[1]] as const } : {}),
        ...(opts.internal ? { n: 1 as const } : {}), ...(opts.unlink ? { u: 1 as const } : {}),
        ...(opts.model !== undefined ? { m: opts.model } : {}),
      };
      const text = JSON.stringify(env);
      if (Buffer.byteLength(text, 'utf8') > MAX_ENVELOPE_BYTES) throw new ValidationError('Bus payload is too large: send ids and let clients refetch');
      await busTransport().send(driver, text);
    }
  }
}

export function parseEnvelope(text: string): Envelope | undefined {
  try {
    const v = JSON.parse(text) as Envelope;
    if (!v || typeof v !== 'object' || !Array.isArray(v.c) || !v.c.length || v.c.length > CHANNELS_PER_ENVELOPE) return undefined;
    if (!v.c.every((ch) => typeof ch === 'string' && ch.length <= 140 && validChannel(ch))) return undefined;
    if (typeof v.t !== 'string' || !TYPE_RE.test(v.t) || !v.p || typeof v.p !== 'object' || Array.isArray(v.p)) return undefined;
    if (v.r !== undefined && !(Array.isArray(v.r) && v.r.length === 2 && typeof v.r[0] === 'string' && MODEL_RE.test(v.r[0])
      && Number.isSafeInteger(v.r[1]) && v.r[1] > 0)) return undefined;
    if (v.m !== undefined && (typeof v.m !== 'string' || !MODEL_RE.test(v.m))) return undefined;
    if ((v.n !== undefined && v.n !== 1) || (v.u !== undefined && v.u !== 1)) return undefined;
    return v;
  } catch {
    return undefined;
  }
}
