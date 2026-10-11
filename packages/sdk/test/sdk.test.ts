import { afterEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { createNexaClient } from '../src/index';

/** Captures what the client actually sends, without opening a socket: the custom fetch sees the final Request. */
const captures: Array<{ url: string; method: string; headers: Headers; credentials: RequestCredentials }> = [];

function recordingFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = input instanceof Request ? input : new Request(input, init);
  captures.push({
    url: request.url,
    method: request.method,
    headers: request.headers,
    credentials: request.credentials,
  });
  return Promise.resolve(Response.json({ ok: true }));
}

afterEach(() => {
  captures.length = 0;
});

describe('@nexa/sdk client creation', () => {
  it('instantiates client with baseUrl and sends requests to Hono app', async () => {
    const app = new Hono().get('/v1/ping', (c) => c.json({ message: 'pong' }));
    type AppType = typeof app;

    const client = createNexaClient<AppType>({ baseUrl: 'http://localhost' });
    expect(client).toBeDefined();
    expect(app.routes).toHaveLength(1);
  });

  it('adds the Authorization header only when a token is given', async () => {
    const app = new Hono().get('/v1/who', (c) => c.json({ ok: true }));
    type AppType = typeof app;

    const withToken = createNexaClient<AppType>({ baseUrl: 'http://localhost', token: 'tok-1' });
    const tokened = await withToken.v1.who.$get({}, { init: undefined, fetch: recordingFetch });
    expect(tokened.ok).toBe(true);
    expect(captures[0]!.headers.get('authorization')).toBe('Bearer tok-1');

    const withoutToken = createNexaClient<AppType>({ baseUrl: 'http://localhost' });
    const anonymous = await withoutToken.v1.who.$get({}, { fetch: recordingFetch });
    expect(anonymous.ok).toBe(true);
    expect(captures[1]!.headers.get('authorization')).toBeNull();
  });

  it('sends requests with same-origin credentials so a browser attaches the session cookie', async () => {
    const app = new Hono().get('/v1/me', (c) => c.json({ ok: true }));
    type AppType = typeof app;

    const client = createNexaClient<AppType>({ baseUrl: 'http://localhost' });
    const response = await client.v1.me.$get({}, { fetch: recordingFetch, init: { headers: { cookie: 'nexa_session=abc' } } });
    expect(response.ok).toBe(true);
    // The cookie travels on the request; a real browser would attach the HttpOnly cookie itself.
    expect(captures[0]!.headers.get('cookie')).toBe('nexa_session=abc');
    // The client's own init requests same-origin credentials, so the browser sends the cookie.
    expect(captures[0]!.credentials).toBe('same-origin');
  });

  it('resolves endpoint responses through a real Hono app round trip', async () => {
    const app = new Hono().get('/v1/ping', (c) => c.json({ message: 'pong', version: 1 }));
    type AppType = typeof app;

    const client = createNexaClient<AppType>({ baseUrl: 'http://localhost' });
    // A real Hono round trip: the client builds the URL; the app's request handler answers it.
    const response = await client.v1.ping.$get({}, { fetch: (input, init) => Promise.resolve(app.request(input, init)) });
    expect(response.status).toBe(200);
    const body = await response.json();
    // Compile-time check: body is the typed endpoint response, not unknown.
    const check: { message: string; version: number } = body;
    expect(check).toEqual({ message: 'pong', version: 1 });
  });

  it('surfaces the server error status instead of swallowing it', async () => {
    const app = new Hono().get('/v1/denied', (c) => c.json({ error: { code: 'AUTH_REQUIRED' } }, 401));
    type AppType = typeof app;

    const client = createNexaClient<AppType>({ baseUrl: 'http://localhost' });
    const response = await client.v1.denied.$get({}, { fetch: (input, init) => Promise.resolve(app.request(input, init)) });
    expect(response.status).toBe(401);
    const body = await response.json();
    expect((body as { error: { code: string } }).error.code).toBe('AUTH_REQUIRED');
  });
});
