import { HealthCheckSchema } from '@nexa/meta';
import { createDb } from '@nexa/db';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { sessionMiddleware } from './middleware/session';
import { auditRoutes } from './routes/audit';
import { authRoutes } from './routes/auth';
import { automationRoutes } from './routes/automations';
import { definitionRoutes } from './routes/definitions';
import { moduleRoutes } from './routes/modules';
import { recordRoutes } from './routes/records';
import { reportRoutes } from './routes/reports';
import { workflowRoutes } from './routes/workflows';
import type { AppDependencies } from './shared';

export type { AppDependencies } from './shared';

export function createApp(dependencies: AppDependencies = {}) {
  const app = new Hono().basePath('/v1');
  app.use('*', logger());
  const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.use('*', cors({
    origin: (origin) => allowedOrigins.includes(origin) ? origin : '',
    credentials: true,
  }));
  app.onError((error, c) => {
    console.error('API Error:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } }, 500);
  });

  app.get('/health', (c) => c.json(HealthCheckSchema.parse({ status: 'ok', timestamp: new Date().toISOString(), version: '0.0.1' })));
  app.get('/status', (c) => c.json({ service: 'nexa-platform', version: '0.0.1', framework: 'Hono' }));

  app.use('*', sessionMiddleware(dependencies));

  app.route('/', authRoutes(dependencies));
  app.route('/', moduleRoutes(dependencies));
  app.route('/', definitionRoutes(dependencies));
  app.route('/', recordRoutes(dependencies));
  app.route('/', workflowRoutes(dependencies));
  app.route('/', automationRoutes(dependencies));
  app.route('/', reportRoutes(dependencies));
  app.route('/', auditRoutes(dependencies));

  return app;
}

const productionDb = createDb();
export const app = createApp({ db: productionDb });
export const routes = app;
export type AppType = typeof routes;
export default app;
