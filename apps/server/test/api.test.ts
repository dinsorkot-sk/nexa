import { describe, expect, it } from 'vitest';
import { app } from '../hono/app';

describe('Hono API (/v1)', () => {
  it('returns a schema-validated health payload', async () => {
    const response = await app.request('/v1/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      version: '0.0.1',
    });
  });

  it('returns service information', async () => {
    const response = await app.request('/v1/status');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      service: 'nexa-platform',
      framework: 'Nuxt + Hono',
    });
  });
});
