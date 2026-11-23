import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { healthResponseSchema } from '@nexa/shared';
import { expect, test, vi } from 'vitest';
import { AppModule } from '../src/app.module';

test('GET /health responds with the shared API contract', async () => {
  vi.stubEnv('NEXA_DATA_DIR', ':memory:');
  try {
    const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
    try {
      await app.listen(0, '127.0.0.1');
      const response = await fetch(new URL('/health', await app.getUrl()));
      expect(response.status).toBe(200);
      expect(healthResponseSchema.parse(await response.json())).toEqual({ status: 'ok' });
    } finally {
      await app.close();
    }
  } finally {
    vi.unstubAllEnvs();
  }
});
