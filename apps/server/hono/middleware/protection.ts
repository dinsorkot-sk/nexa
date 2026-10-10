import type { Context, Next } from 'hono';
import { sessionCookieName, cookieValue } from './session';

const stateChanging = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Parses CORS_ORIGINS the same way app.ts does, so the two allowlists cannot drift. */
export function allowedOriginsFromEnv(): string[] {
  return (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((origin) => origin.trim()).filter(Boolean);
}

/**
 * CSRF guard for cookie-authenticated writes. A state-changing request that carries a session cookie
 * must send an Origin from the allowlist and a JSON content type when it has a body. Requests without
 * a session cookie cannot act on a session, so they pass through unchanged.
 */
export function csrfGuard() {
  return async (c: Context, next: Next) => {
    if (!stateChanging.has(c.req.method)) return next();
    const hasSession = Boolean(cookieValue(c.req.header('cookie'), sessionCookieName()));
    if (!hasSession) return next();

    const origin = c.req.header('origin');
    if (!origin || !allowedOriginsFromEnv().includes(origin)) {
      return c.json({ error: { code: 'CSRF_REJECTED', message: 'Origin is not allowed for this request', status: 403 } }, 403);
    }
    const hasBody = (c.req.header('content-length') ?? '0') !== '0' || c.req.header('transfer-encoding') !== undefined;
    const contentType = c.req.header('content-type') ?? '';
    if (hasBody && !contentType.toLowerCase().startsWith('application/json')) {
      return c.json({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Requests with a body must be application/json', status: 415 } }, 415);
    }
    return next();
  };
}

interface Bucket { count: number; resetAt: number }

/**
 * Fixed-window, in-memory rate limiter keyed by route group and client. Without TRUST_PROXY=1 every
 * anonymous client shares one bucket. That is conservative and cannot be bypassed by spoofing headers,
 * but one attacker can exhaust it for everyone. Per-address limiting needs the Node socket address,
 * which Hono does not expose here; that is the upgrade path behind a trusted proxy.
 * ponytail: per-process only. With more than one instance, move the counters to the database.
 */
export function rateLimit(options: { name: string; limit: number; windowMs: number; now?: () => number }) {
  const buckets = new Map<string, Bucket>();
  const now = options.now ?? Date.now;
  return async (c: Context, next: Next) => {
    // Forwarded headers are only trusted behind a proxy that overwrites them; otherwise a client could mint a fresh bucket per request.
    const clientKey = (process.env.TRUST_PROXY === '1' && c.req.header('x-forwarded-for')?.split(',')[0]?.trim()) || 'shared';
    const key = `${options.name}:${clientKey}`;
    const current = now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= current) {
      buckets.set(key, { count: 1, resetAt: current + options.windowMs });
      return next();
    }
    if (bucket.count >= options.limit) {
      const retryAfter = Math.ceil((bucket.resetAt - current) / 1000);
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: { code: 'RATE_LIMITED', message: 'Too many requests, try again later', status: 429 } }, 429);
    }
    bucket.count += 1;
    return next();
  };
}
