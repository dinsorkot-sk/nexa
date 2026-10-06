import { checkDatabase } from './check';
import { createDb } from './client';
import { runMigrations } from './migrate';
import { seedDatabase } from './seed';

export type DbCommand = 'migrate' | 'seed' | 'check';

export interface CliOptions {
  databaseUrl?: string;
  dataDir?: string;
}

export async function runDbCommand(command: string, options: CliOptions = {}): Promise<number> {
  if (!isCommand(command)) {
    console.error('Usage: nexa <migrate|seed|check> [--database-url URL] [--data-dir PATH]');
    return 2;
  }

  const handle = createDb(options);
  try {
    if (command === 'migrate') {
      await runMigrations(handle);
      console.info('Database migrations applied.');
      return 0;
    }
    if (command === 'seed') {
      await seedDatabase(handle);
      console.info('Database seed completed.');
      return 0;
    }

    const result = await checkDatabase(handle);
    for (const check of result.checks) {
      console.info(`${check.ok ? 'OK' : 'FAIL'} ${check.name}${check.detail ? `: ${check.detail}` : ''}`);
    }
    return result.ok ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  } finally {
    await handle.close();
  }
}

export function parseDbArgs(args: string[]): { command?: string; options: CliOptions } {
  const [command, ...rest] = args;
  const options: CliOptions = {};
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === '--database-url' || argument === '--data-dir') {
      const value = rest[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
      if (argument === '--database-url') options.databaseUrl = value;
      else options.dataDir = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return { command, options };
}

function isCommand(command: string): command is DbCommand {
  return command === 'migrate' || command === 'seed' || command === 'check';
}
