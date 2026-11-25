import { Controller, Get, HttpException, HttpStatus, Inject, Logger, Req, Res, UnauthorizedException, type OnModuleDestroy } from '@nestjs/common';
import { BUS_LIMITS, BusHub, parseRecordChannel, type BusEvent, type BusSubscription } from '@nexa/engine';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { EngineService } from './engine.service';
import { callerFrom } from './request-env';

const positiveInt = (fallback: number, max: number) => z.coerce.number().int().min(1).max(max).catch(fallback);

/** Limits of the SSE bus endpoint (overridable for tests and deployments). */
export function busConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    maxPerUser: positiveInt(5, 100).parse(env.NEXA_BUS_MAX_PER_USER ?? 5),
    maxTotal: positiveInt(1_000, 100_000).parse(env.NEXA_BUS_MAX_TOTAL ?? 1_000),
    heartbeatMs: positiveInt(25_000, 300_000).parse(env.NEXA_BUS_HEARTBEAT_MS ?? 25_000),
    /** the bearer token is re-validated (revocation / expiry / archived user) at this interval */
    reauthMs: positiveInt(60_000, 3_600_000).parse(env.NEXA_BUS_REAUTH_MS ?? 60_000),
  };
}

const channelList = z.union([z.string(), z.array(z.string())]).optional()
  .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]))
  .pipe(z.array(z.string().max(140).refine((c) => {
    const ref = parseRecordChannel(c);
    // personal channels are implicit (owner-only) and never subscribed explicitly
    return !!ref && ref[0] !== 'res.users' && ref[0] !== 'res.partner';
  }, { message: 'Channels must be model,id record channels' })).max(BUS_LIMITS.maxRecordChannels));
const lastEventId = z.string().regex(/^[0-9a-f]{12}:[0-9]{1,15}$/).optional().catch(undefined);
/** Pending output beyond this means the client does not keep up: the stream is closed. */
const MAX_BUFFERED = 1024 * 1024;

/**
 * Server-Sent Events endpoint of the realtime bus. Authenticated like every other route (bearer session
 * or API key; development headers only with NEXA_DEV_AUTH); the tenant comes from the credential.
 * Each connection follows its user's own channels plus explicit, readable `?channel=model,id` records.
 * Events carry ids only: clients refetch through the normal (access-checked) API.
 */
@Controller('api')
export class BusController implements OnModuleDestroy {
  private readonly logger = new Logger('Bus');
  private readonly config = busConfig();
  private readonly perUser = new Map<string, number>();
  private total = 0;
  private readonly open = new Set<() => void>();

  constructor(
    @Inject(EngineService) private readonly engine: EngineService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  private async identity(req: Request): Promise<{ tenant: string; uid: number; token?: string }> {
    const caller = callerFrom(req);
    if (caller.bearerToken) {
      const authenticated = await this.auth.authenticate(caller.bearerToken);
      return { tenant: authenticated.tenant, uid: authenticated.uid, token: caller.bearerToken };
    }
    if (!this.engine.config.devAuth || caller.tenant === undefined || caller.uid === undefined) {
      throw new UnauthorizedException('A valid bearer token is required');
    }
    // validates tenant and user like the other routes
    await this.engine.env(caller.tenant, caller.uid);
    return { tenant: caller.tenant, uid: caller.uid };
  }

  @Get('bus')
  async stream(@Req() req: Request, @Res() res: Response): Promise<void> {
    const who = await this.identity(req);
    const channels = channelList.parse(req.query.channel);
    const resume = lastEventId.parse(req.header('last-event-id') ?? req.query.lastEventId);
    const key = `${who.tenant}\u0000${who.uid}`;
    if (this.total >= this.config.maxTotal) throw new HttpException('Too many bus connections', HttpStatus.SERVICE_UNAVAILABLE);
    if ((this.perUser.get(key) ?? 0) >= this.config.maxPerUser) throw new HttpException('Too many bus connections for this user', HttpStatus.TOO_MANY_REQUESTS);
    // reserve the slot before any await so concurrent requests cannot overshoot the limits
    this.total++;
    this.perUser.set(key, (this.perUser.get(key) ?? 0) + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.total--;
      const n = (this.perUser.get(key) ?? 1) - 1;
      if (n > 0) this.perUser.set(key, n);
      else this.perUser.delete(key);
    };

    const pending: string[] = [];
    let ready = false;
    let sub: BusSubscription | undefined;
    const timers: NodeJS.Timeout[] = [];
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      for (const t of timers) clearInterval(t);
      sub?.close();
      release();
      this.open.delete(end);
      if (!res.writableEnded) res.end();
    };
    const write = (chunk: string) => {
      if (ended) return;
      if (!ready) { pending.push(chunk); return; }
      res.write(chunk);
      if (res.writableLength > MAX_BUFFERED) end();
    };
    const send = (event: BusEvent) => write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify({ channel: event.channel, payload: event.payload })}\n\n`);

    try {
      const handle = await this.engine.tenant(who.tenant);
      const hub = await BusHub.for(handle);
      sub = await hub.subscribe(who.uid, {
        channels, ...(resume ? { lastEventId: resume } : {}), onEvent: send, onClose: () => end(),
      });
    } catch (err) {
      sub?.close();
      release();
      throw err;
    }
    if (req.destroyed || res.destroyed) { end(); return; }

    this.open.add(end);
    res.on('close', end);
    res.on('error', end);
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    ready = true;
    res.write(`retry: 3000\n\nevent: bus.ready\ndata: ${JSON.stringify({ channels: [...sub.channels] })}\n\n`);
    for (const chunk of pending.splice(0)) write(chunk);
    timers.push(setInterval(() => write(': ping\n\n'), this.config.heartbeatMs));
    if (who.token) {
      const token = who.token;
      timers.push(setInterval(() => {
        this.auth.authenticate(token).then((current) => {
          // the credential must still identify the same tenant and user as the stream
          if (current.tenant !== who.tenant || current.uid !== who.uid) end();
        }).catch((err: unknown) => {
          if (!(err instanceof UnauthorizedException)) this.logger.warn(`bus re-authentication failed: ${String(err)}`);
          end();
        });
      }, this.config.reauthMs));
    }
  }

  /** Number of open streams (all users, or one user of a tenant). */
  connections(tenant?: string, uid?: number): number {
    return tenant === undefined ? this.total : this.perUser.get(`${tenant}\u0000${uid}`) ?? 0;
  }

  onModuleDestroy(): void {
    for (const end of [...this.open]) end();
  }
}
