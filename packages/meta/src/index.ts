import { z } from 'zod';

export * from './auth';
export * from './common';
export * from './module';
export * from './entity';
export * from './field';
export * from './relation';
export * from './view';
export * from './form';
export * from './workflow';
export * from './permission';
export * from './action';
export * from './automation';
export * from './report';
export * from './dashboard';
export * from './package';
export * from './record';

/** Readiness response shared by the API health route. */
export const HealthCheckSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  timestamp: z.string().datetime(),
  version: z.string(),
});
export type HealthCheck = z.infer<typeof HealthCheckSchema>;
export { z };
