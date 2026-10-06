import { z } from 'zod';

export const HealthCheckSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  timestamp: z.string().datetime(),
  version: z.string(),
});

export type HealthCheck = z.infer<typeof HealthCheckSchema>;
