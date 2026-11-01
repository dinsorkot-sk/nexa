import { describe, it, expect } from 'vitest';
import { JobRunner, mergeViewOverride, needsUpgrade } from './modules';

describe('JobRunner', () => {
  it('runs across tenants and isolates failures', async () => {
    const runner = new JobRunner();
    const results = await runner.runAcrossTenants(['t1', 't2', 't3'], async (tid) => {
      if (tid === 't2') throw new Error('boom');
    });
    expect(results.length).toBe(3);
    expect(results[0].status).toBe('completed');
    expect(results[1].status).toBe('failed');
    expect(results[1].error).toBe('boom');
    expect(results[2].status).toBe('completed');
  });

  it('getStatus returns last job status', async () => {
    const runner = new JobRunner();
    await runner.runAcrossTenants(['t1'], async () => {});
    expect(runner.getStatus('t1')).toBe('completed');
    expect(runner.getStatus('nope')).toBe('pending');
  });
});

describe('mergeViewOverride', () => {
  it('merges config shallowly', () => {
    const base = { name: 'list', config: { columns: ['a', 'b'] } };
    const override = { config: { columns: ['a', 'c'] } };
    const merged = mergeViewOverride(base, override);
    expect((merged.config as { columns: string[] }).columns).toEqual(['a', 'c']);
  });
});

describe('needsUpgrade', () => {
  it('true when not installed', () => {
    expect(needsUpgrade(undefined, '1.0.0')).toBe(true);
  });
  it('true when version differs', () => {
    expect(needsUpgrade('1.0.0', '1.1.0')).toBe(true);
  });
  it('false when same', () => {
    expect(needsUpgrade('1.0.0', '1.0.0')).toBe(false);
  });
});