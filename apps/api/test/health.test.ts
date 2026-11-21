import 'reflect-metadata';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NestFactory } from '@nestjs/core';
import { healthResponseSchema } from '@nexa/shared';
import { expect, test, vi } from 'vitest';
import { AppModule } from '../src/app.module';

test('GET /health responds with the shared API contract', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nexa-api-health-'));
  vi.stubEnv('DATABASE_URL', pathToFileURL(join(directory, 'health.db')).href);

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
    await rm(directory, { force: true, recursive: true });
  }
});
