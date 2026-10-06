import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { createNexaClient } from '../src/index';

describe('@nexa/sdk client creation', () => {
  it('instantiates client with baseUrl and sends requests to Hono app', async () => {
    const app = new Hono().get('/v1/ping', (c) => c.json({ message: 'pong' }));
    type AppType = typeof app;

    const client = createNexaClient<AppType>({ baseUrl: 'http://localhost' });
    expect(client).toBeDefined();
    expect(app.routes).toHaveLength(1);
  });
});
