import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api } from '../app/composables/useApi';

/** The tests own the network: every fetch is a stubbed `Response`, never a socket. */
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api', () => {
  it('returns the parsed body of an ok response', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ items: [1, 2] }), { status: 200 })));
    vi.stubGlobal('fetch', fetch);
    await expect(api<{ items: number[] }>('/modules')).resolves.toEqual({ items: [1, 2] });
    expect(fetch).toHaveBeenCalledWith('/v1/modules', expect.objectContaining({ method: 'GET', credentials: 'same-origin' }));
  });

  it('resolves to undefined on a 204 without reading the body', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetch);
    await expect(api('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith('/v1/auth/logout', expect.objectContaining({ method: 'POST' }));
  });

  it('sends the JSON content type only when there is a body', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response('{"ok":true}', { status: 200 })));
    vi.stubGlobal('fetch', fetch);
    await api('/things', { method: 'POST', body: { a: 1 } });
    expect(fetch).toHaveBeenCalledWith('/v1/things', expect.objectContaining({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
    }));
    await api('/things');
    expect(fetch).toHaveBeenLastCalledWith('/v1/things', expect.objectContaining({ headers: undefined, body: undefined }));
  });

  it('throws an ApiError carrying the server body of an error response', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(
      JSON.stringify({ error: { code: 'STALE_WRITE', message: 'Someone changed this record', status: 409, details: { version: 3 } } }),
      { status: 409, statusText: 'Conflict' },
    )));
    vi.stubGlobal('fetch', fetch);
    const caught = await api('/modules/m/entities/e/records/r', { method: 'PATCH', body: { data: {}, version: 2 } }).catch((error) => error);
    expect(caught).toBeInstanceOf(ApiError);
    expect(caught.status).toBe(409);
    expect(caught.code).toBe('STALE_WRITE');
    expect(caught.message).toBe('Someone changed this record');
    expect(caught.details).toEqual({ version: 3 });
  });

  it('falls back to UNKNOWN and the status text when an error body is not JSON', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response('database is down', { status: 503, statusText: 'Service Unavailable' })));
    vi.stubGlobal('fetch', fetch);
    const caught = await api('/auth/me').catch((error) => error);
    expect(caught).toBeInstanceOf(ApiError);
    expect(caught.status).toBe(503);
    expect(caught.code).toBe('UNKNOWN');
    expect(caught.message).toBe('Service Unavailable');
  });
});
