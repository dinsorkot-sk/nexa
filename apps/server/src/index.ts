import { serve } from '@hono/node-server';
import { app } from '../hono/app';

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, (info) => {
  console.info(`Nexa API listening on http://localhost:${info.port}/v1`);
});
