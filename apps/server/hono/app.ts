import { HealthCheckSchema } from '@nexa/meta';
import { pingDatabase } from '@nexa/db';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { csrfGuard, rateLimit } from './middleware/protection';
import { sessionMiddleware } from './middleware/session';
import { auditRoutes } from './routes/audit';
import { authRoutes } from './routes/auth';
import { automationRoutes } from './routes/automations';
import { definitionRoutes } from './routes/definitions';
import { invitationRoutes } from './routes/invitations';
import { memberRoutes } from './routes/members';
import { moduleRoutes } from './routes/modules';
import { organizationRoutes } from './routes/organizations';
import { recordRoutes } from './routes/records';
import { reportRoutes } from './routes/reports';
import { workflowRoutes } from './routes/workflows';
import type { AppDependencies } from './shared';

export type { AppDependencies } from './shared';

export function createApp(dependencies: AppDependencies = {}) {
  const app = new Hono().basePath('/v1');
  app.use('*', logger());
  app.use('*', secureHeaders());
  app.use('*', bodyLimit({
    maxSize: dependencies.maxBodyBytes ?? 1024 * 1024,
    onError: (c) => c.json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large', status: 413 } }, 413),
  }));
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
  /** Readiness: fails with 503 when the database cannot answer, so a load balancer stops routing here. */
  app.get('/ready', async (c) => {
    if (!dependencies.db) return c.json({ status: 'unavailable', database: 'missing' }, 503);
    try {
      await pingDatabase(dependencies.db);
      return c.json({ status: 'ready', database: 'ok' });
    } catch {
      return c.json({ status: 'unavailable', database: 'error' }, 503);
    }
  });

  app.use('*', csrfGuard());
  app.use('*', sessionMiddleware(dependencies));

  // Brute-force and abuse limits on the endpoints most exposed to credential guessing and spam.
  app.use('/auth/login', rateLimit({ name: 'login', limit: 10, windowMs: 60_000 }));
  app.use('/auth/signup', rateLimit({ name: 'signup', limit: 5, windowMs: 60_000 }));
  app.use('/invitations', rateLimit({ name: 'invite', limit: 30, windowMs: 60_000 }));

  app.route('/', authRoutes(dependencies));
  app.route('/', moduleRoutes(dependencies));
  app.route('/', definitionRoutes(dependencies));
  app.route('/', recordRoutes(dependencies));
  app.route('/', workflowRoutes(dependencies));
  app.route('/', automationRoutes(dependencies));
  app.route('/', reportRoutes(dependencies));
  app.route('/', auditRoutes(dependencies));
  app.route('/', organizationRoutes(dependencies));
  app.route('/', memberRoutes(dependencies));
  app.route('/', invitationRoutes(dependencies));

  return app;
}

// Dependency-free default for imports (health/status only). Runtime wiring with a database lives in src/index.ts.
export const app = createApp();
export const routes = app;
export type AppType = typeof routes;
export default app;
