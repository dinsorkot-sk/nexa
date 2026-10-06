import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { HealthCheckSchema } from '@nexa/meta';

export const app = new Hono().basePath('/v1');

// Global middleware
app.use('*', logger());
app.use('*', cors());

// Error handler
app.onError((err, c) => {
  console.error('API Error:', err);
  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: err.message || 'An unexpected error occurred',
      },
    },
    500
  );
});

// Health check endpoint
export const routes = app
  .get('/health', (c) => {
    const health = HealthCheckSchema.parse({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.0.1',
    });
    return c.json(health);
  })
  .get('/status', (c) => {
    return c.json({
      service: 'nexa-platform',
      version: '0.0.1',
      framework: 'Nuxt + Hono',
    });
  });

export type AppType = typeof routes;
export default app;
