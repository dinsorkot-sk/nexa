import { randomBytes } from 'node:crypto';
import { AccessError, ValidationError, type Env, type TenantHandle } from '../contracts/index.js';
import { SUPERUSER_ID, type EnvImpl } from '../orm/env.js';
import { userSecurity } from '../security/access.js';
import {
  BROADCAST_CHANNEL, parseEnvelope, parseRecordChannel, partnerChannel, recordChannel, userChannel, type Envelope, type RecordRef,
} from './service.js';
import { busTransport } from './transport.js';

export const BUS_LIMITS = {
  /** explicit record channels per subscription */
  maxRecordChannels: 50,
  /** events kept for Last-Event-ID resume, per tenant */
  ringSize: 1_000,
  /** events waiting for the access check of one subscriber; beyond, the client is told to resync */
  maxQueue: 500,
  /** cached read decisions per subscriber */
  maxDecisions: 512,
  /** read decisions (and the subscriber's security facts) are re-checked after this many ms */
  decisionTtlMs: 2_000,
  batchSize: 50,
  /** per-record change events of one ORM operation; beyond, one `record.reset` per channel chunk */
  maxRecordEvents: 1_000,
};

export interface BusEvent {
  /** `<epoch>:<seq>`: SSE id, usable as Last-Event-ID within this process */
  id: string;
  type: string;
  channel: string;
  payload: Record<string, unknown>;
}

interface Stored { seq: number; env: Envelope }

export interface SubscribeOptions {
  /** explicit record channels (`model,id`); each must be readable at subscribe time */
  channels?: readonly string[];
  /** resume after this event id (from the ring buffer); unknown/expired ids yield a `bus.reset` event */
  lastEventId?: string;
  onEvent: (event: BusEvent) => void;
  /** the subscription was closed by the hub (user archived, queue overflow is NOT a close) */
  onClose?: (reason: string) => void;
}

/**
 * Per-tenant fan-out of committed bus envelopes to in-process subscribers, with access filtering at
 * delivery: a subscriber gets an event only if it may currently read the event's record (ACL + record
 * rules of its own env, rechecked per event with a short bounded cache), personal channels only for
 * their owner, the broadcast channel only for administrators, and internal subtypes only for internal
 * users (base.group_user).
 *
 * Known semantics:
 * - Partner channels: several users may share one res.partner; each of them owns that partner channel
 *   and receives its events (still filtered by each user's own read access to the event's record).
 * - Message events are gated by read access to the DOCUMENT (model,res_id), not by mail.message record
 *   rules; they carry ids only and clients fetch message content through the access-checked chatter API.
 * - The transport LISTENs through the driver's public `listen()` (PgliteDriver in-process, PgDriver on a
 *   dedicated auto-reconnecting connection). After a reconnect every subscription gets a `bus.reset`:
 *   notifications sent while the connection was down are lost and clients must refetch.
 * - One hub (one LISTEN registration) lives per TenantHandle, for the handle's lifetime; `close()`
 *   unregisters it. Reopened handles get a new hub (and a new event-id epoch).
 */
export class BusHub {
  private static readonly hubs = new WeakMap<TenantHandle, Promise<BusHub>>();
  private readonly epoch = randomBytes(6).toString('hex');
  private seq = 0;
  /** seq consumed by the last listener outage: envelopes may be missing before it, so older ids cannot resume */
  private gapSeq = 0;
  private readonly ring: Stored[] = [];
  private readonly byChannel = new Map<string, Set<BusSubscription>>();
  private stop: (() => Promise<void>) | undefined;
  private closed = false;

  private constructor(readonly handle: TenantHandle) {}

  static for(handle: TenantHandle): Promise<BusHub> {
    let p = BusHub.hubs.get(handle);
    if (!p) {
      const hub = new BusHub(handle);
      p = busTransport().listen(handle.driver, (text) => hub.receive(text), () => hub.resetAll()).then((stop) => { hub.stop = stop; return hub; });
      BusHub.hubs.set(handle, p);
      p.catch(() => BusHub.hubs.delete(handle));
    }
    return p;
  }

  get subscriptionCount(): number {
    const all = new Set<BusSubscription>();
    for (const set of this.byChannel.values()) for (const s of set) all.add(s);
    return all.size;
  }

  /**
   * Subscribe user `uid` to its own user and partner channels, the broadcast channel when it is an
   * administrator, plus explicit record channels it can read now. Throws AccessError / ValidationError.
   */
  async subscribe(uid: number, opts: SubscribeOptions): Promise<BusSubscription> {
    if (this.closed) throw new AccessError('The bus is closed');
    if (!Number.isSafeInteger(uid) || uid <= SUPERUSER_ID) throw new AccessError('Invalid user');
    const requested = [...new Set(opts.channels ?? [])];
    if (requested.length > BUS_LIMITS.maxRecordChannels) throw new ValidationError(`At most ${BUS_LIMITS.maxRecordChannels} channels`);
    const refs: RecordRef[] = [];
    for (const ch of requested) {
      const ref = parseRecordChannel(ch);
      if (!ref) throw new ValidationError('Channels must be `model,id`');
      // personal channels are implicit and owner-only
      if (ref[0] === 'res.users' || ref[0] === 'res.partner') throw new ValidationError('Personal channels cannot be subscribed explicitly');
      refs.push(ref);
    }
    const sub = new BusSubscription(this, uid, opts);
    await sub.init(refs);
    for (const ch of sub.channels) {
      let set = this.byChannel.get(ch);
      if (!set) this.byChannel.set(ch, (set = new Set()));
      set.add(sub);
    }
    if (opts.lastEventId !== undefined) this.replay(sub, opts.lastEventId);
    return sub;
  }

  /** @internal */
  remove(sub: BusSubscription): void {
    for (const ch of sub.channels) {
      const set = this.byChannel.get(ch);
      set?.delete(sub);
      if (set && !set.size) this.byChannel.delete(ch);
    }
  }

  /** @internal */
  eventId(seq: number): string { return `${this.epoch}:${seq}`; }

  private replay(sub: BusSubscription, lastEventId: string): void {
    const m = /^([0-9a-f]{12}):([0-9]{1,15})$/.exec(lastEventId);
    const first = this.ring[0]?.seq ?? this.seq + 1;
    const last = m && m[1] === this.epoch ? Number(m[2]) : NaN;
    // unknown epoch (restart), garbage, a future id, one already evicted, or one from before a listener
    // outage (notifications were lost in between): the client must refetch
    if (!(last >= first - 1 && last <= this.seq && last >= this.gapSeq)) {
      sub.emit({ id: this.eventId(this.seq), type: 'bus.reset', channel: '', payload: {} });
      return;
    }
    for (const s of this.ring) if (s.seq > last) sub.offer(s.seq, s.env);
  }

  private receive(text: string): void {
    const env = parseEnvelope(text);
    if (!env) return;
    const seq = ++this.seq;
    this.ring.push({ seq, env });
    if (this.ring.length > BUS_LIMITS.ringSize) this.ring.shift();
    const targets = new Set<BusSubscription>();
    for (const ch of env.c) for (const s of this.byChannel.get(ch) ?? []) targets.add(s);
    for (const s of targets) s.offer(seq, env);
  }

  /** Envelopes may have been lost (listener reconnected): every subscriber must refetch. */
  private resetAll(): void {
    if (this.closed) return;
    // the reset takes its own seq (not in the ring): subscribers that receive it can resume from its id,
    // and anyone resuming from an earlier id gets a reset in replay()
    this.gapSeq = ++this.seq;
    const all = new Set<BusSubscription>();
    for (const set of this.byChannel.values()) for (const s of set) all.add(s);
    for (const s of all) s.emit({ id: this.eventId(this.seq), type: 'bus.reset', channel: '', payload: {} });
  }

  async close(): Promise<void> {
    this.closed = true;
    BusHub.hubs.delete(this.handle);
    for (const set of [...this.byChannel.values()]) for (const s of set) s.close('bus closed');
    await this.stop?.();
  }
}

interface Decision { ok: boolean; at: number }

export class BusSubscription {
  readonly channels = new Set<string>();
  private readonly recordChannels = new Set<string>();
  private partnerId: number | null = null;
  private internal = false;
  private admin = false;
  private env!: Env;
  private envAt = 0;
  private readonly decisions = new Map<string, Decision>();
  private readonly queue: Stored[] = [];
  private draining = false;
  private overflowed = false;
  private droppedSeq = 0;
  private closed = false;

  constructor(private readonly hub: BusHub, readonly uid: number, private readonly opts: SubscribeOptions) {}

  get isClosed(): boolean { return this.closed; }

  /** @internal */
  async init(refs: readonly RecordRef[]): Promise<void> {
    await this.refresh(true);
    this.channels.add(userChannel(this.uid));
    if (this.partnerId !== null) this.channels.add(partnerChannel(this.partnerId));
    if (this.admin) this.channels.add(BROADCAST_CHANNEL);
    const readable = await this.readable(refs);
    for (const ref of refs) {
      const ch = recordChannel(ref[0], ref[1]);
      if (!readable.has(ch)) throw new AccessError('Record is unavailable');
      this.channels.add(ch);
      this.recordChannels.add(ch);
    }
  }

  /** Fresh env and security facts (throws AccessError for archived/removed users). */
  private async refresh(force = false): Promise<void> {
    if (!force && Date.now() - this.envAt < BUS_LIMITS.decisionTtlMs) return;
    const env = this.hub.handle.env({ uid: this.uid });
    if (env.su) throw new AccessError('Invalid user');
    const sec = await userSecurity(env as EnvImpl);
    const [user] = await env.sudo().withContext({ activeTest: false }).model('res.users').browse(this.uid).read(['partner_id']);
    this.partnerId = typeof user?.partner_id === 'number' ? user.partner_id : null;
    this.internal = sec.groups.has('base.group_user');
    this.admin = sec.groups.has('base.group_system');
    this.env = env;
    this.envAt = Date.now();
    this.decisions.clear();
  }

  /** Record channels among `refs` the subscriber may read now (one search per model, cached). */
  private async readable(refs: readonly RecordRef[]): Promise<Set<string>> {
    const out = new Set<string>();
    const now = Date.now();
    const missing = new Map<string, number[]>();
    for (const [model, id] of refs) {
      const key = recordChannel(model, id);
      const d = this.decisions.get(key);
      if (d && now - d.at < BUS_LIMITS.decisionTtlMs) { if (d.ok) out.add(key); continue; }
      let list = missing.get(model);
      if (!list) missing.set(model, (list = []));
      if (!list.includes(id)) list.push(id);
    }
    const registry = (this.env as EnvImpl).registry;
    for (const [model, ids] of missing) {
      let found = new Set<number>();
      if (registry.models.has(model) && registry.get(model).table) {
        try {
          found = new Set((await this.env.withContext({ activeTest: false }).model(model).search([['id', 'in', ids]])).ids);
        } catch (err) {
          if (!(err instanceof AccessError)) throw err;
        }
      }
      for (const id of ids) {
        const key = recordChannel(model, id);
        const ok = found.has(id);
        if (ok) out.add(key);
        this.decisions.delete(key);
        this.decisions.set(key, { ok, at: now });
        if (this.decisions.size > BUS_LIMITS.maxDecisions) this.decisions.delete(this.decisions.keys().next().value!);
      }
    }
    return out;
  }

  private async modelReadable(model: string): Promise<boolean> {
    const registry = (this.env as EnvImpl).registry;
    if (!registry.models.has(model)) return false;
    try { await this.env.model(model).checkAccess('read'); return true; } catch (err) {
      if (err instanceof AccessError) return false;
      throw err;
    }
  }

  /** @internal queue an envelope for access filtering, preserving order */
  offer(seq: number, env: Envelope): void {
    if (this.closed) return;
    if (this.overflowed || this.queue.length >= BUS_LIMITS.maxQueue) {
      // too slow / too many events: drop everything up to the newest dropped event and tell the
      // client to refetch; the reset carries that event's id so a resume continues after it
      this.overflowed = true;
      this.droppedSeq = Math.max(this.droppedSeq, seq);
      this.queue.length = 0;
    } else {
      this.queue.push({ seq, env });
    }
    if (!this.draining) void this.drain();
  }

  private async drain(): Promise<void> {
    this.draining = true;
    try {
      // `overflowed` is re-checked after every batch and before exiting: an overflow raised while a
      // batch was awaiting its access check must still produce a reset, even with no later events
      while ((this.queue.length || this.overflowed) && !this.closed) {
        if (this.overflowed) {
          this.overflowed = false;
          this.emit({ id: this.hub.eventId(this.droppedSeq), type: 'bus.reset', channel: '', payload: {} });
          continue;
        }
        const batch = this.queue.splice(0, BUS_LIMITS.batchSize);
        await this.refresh();
        const readable = await this.readable(batch.flatMap((s) => (s.env.r && !s.env.u ? [s.env.r] : [])));
        for (const s of batch) {
          if (s.env.m) {
            // model-level resets name no record: one event per subscribed channel so the client knows which to refetch
            for (const ch of s.env.c) {
              if (!this.channels.has(ch)) continue;
              const channel = await this.allowed({ ...s.env, c: [ch] }, readable);
              if (channel !== undefined) this.emit({ id: this.hub.eventId(s.seq), type: s.env.t, channel, payload: s.env.p });
            }
            continue;
          }
          const channel = await this.allowed(s.env, readable);
          if (channel !== undefined) this.emit({ id: this.hub.eventId(s.seq), type: s.env.t, channel, payload: s.env.p });
        }
      }
    } catch (err) {
      this.close(err instanceof AccessError ? 'access revoked' : 'bus error');
    } finally {
      this.draining = false;
    }
  }

  /** The channel through which the subscriber may receive this envelope, if any. */
  private async allowed(env: Envelope, readable: ReadonlySet<string>): Promise<string | undefined> {
    if (env.n && !this.internal) return undefined;
    const channel = env.c.find((ch) => this.channels.has(ch) && this.ownsChannel(ch));
    if (channel === undefined) return undefined;
    // record channels always need an access target (publish enforces it; defense in depth)
    if (!env.r && !env.m && this.recordChannels.has(channel)) return undefined;
    if (env.m) {
      // model-level reset (bulk change): explicit record channel of that model + model read ACL
      const ref = parseRecordChannel(channel);
      if (!ref || ref[0] !== env.m || !this.recordChannels.has(channel) || !(await this.modelReadable(env.m))) return undefined;
    }
    if (env.r) {
      const key = recordChannel(env.r[0], env.r[1]);
      if (env.u) {
        // deleted records cannot be read any more: only subscribers that explicitly (and validly)
        // followed this record channel and still have read ACL on the model learn the id was deleted
        if (!this.recordChannels.has(key) || channel !== key || !(await this.modelReadable(env.r[0]))) return undefined;
      } else if (!readable.has(key)) return undefined;
    }
    return channel;
  }

  private ownsChannel(ch: string): boolean {
    if (ch === BROADCAST_CHANNEL) return this.admin;
    if (ch.startsWith('res.users,')) return ch === userChannel(this.uid);
    if (ch.startsWith('res.partner,')) return this.partnerId !== null && ch === partnerChannel(this.partnerId);
    return this.recordChannels.has(ch);
  }

  /** @internal */
  emit(event: BusEvent): void {
    if (this.closed) return;
    try { this.opts.onEvent(event); } catch { this.close('subscriber error'); }
  }

  close(reason = 'closed'): void {
    if (this.closed) return;
    this.closed = true;
    this.queue.length = 0;
    this.hub.remove(this);
    try { this.opts.onClose?.(reason); } catch { /* ignore */ }
  }
}
