import { describe, expect, it } from 'vitest';
import { parseDbArgs, runDbCommand } from '@nexa/db';

describe('@nexa/cli arguments', () => {
  it('parses database options', () => {
    expect(parseDbArgs(['migrate', '--database-url', 'postgres://localhost/nexa'])).toEqual({
      command: 'migrate',
      options: { databaseUrl: 'postgres://localhost/nexa' },
    });
  });

  it('rejects missing option values and unknown options', () => {
    expect(() => parseDbArgs(['check', '--data-dir'])).toThrow(/Missing value/);
    expect(() => parseDbArgs(['check', '--force'])).toThrow(/Unknown argument/);
  });

  it('returns usage error for an unknown command', async () => {
    expect(await runDbCommand('unknown')).toBe(2);
  });
});
