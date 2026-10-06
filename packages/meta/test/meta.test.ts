import { describe, it, expect } from 'vitest';
import { HealthCheckSchema } from '../src/index';

describe('@nexa/meta basic schema verification', () => {
  it('validates a correct health check payload', () => {
    const valid = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.0.1',
    };
    const parsed = HealthCheckSchema.parse(valid);
    expect(parsed.status).toBe('ok');
    expect(parsed.version).toBe('0.0.1');
  });

  it('rejects invalid status', () => {
    const invalid = {
      status: 'unknown',
      timestamp: new Date().toISOString(),
      version: '0.0.1',
    };
    expect(() => HealthCheckSchema.parse(invalid)).toThrow();
  });
});
