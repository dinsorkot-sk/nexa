import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { greet } from '@nexa/core';
import { logger, runWithCorrelationId } from './logging';

const app = new Hono();

app.use('*', async (c, next) => {
  const incoming = c.req.header('x-correlation-id');
  const id = incoming && incoming.length > 0 ? incoming : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  c.header('x-correlation-id', id);
  await runWithCorrelationId(id, () => next());
});

app.get('/health', (c) => c.json({ ok: true }));

app.get('/greet/:name', (c) => {
  const name = c.req.param('name');
  const message = greet({ id: '1', email: 'a@b.com', name, createdAt: new Date().toISOString() });
  return c.json({ message });
});

const port = Number(process.env.PORT ?? 3000);

logger.info('server starting', { port });

serve({ fetch: app.fetch, port }, (info) => {
  logger.info('server listening', { port: info.port });
});