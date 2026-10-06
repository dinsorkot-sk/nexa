#!/usr/bin/env node
import { parseDbArgs, runDbCommand } from '@nexa/db';

try {
  const { command, options } = parseDbArgs(process.argv.slice(2));
  void runDbCommand(command ?? '', options).then((exitCode) => {
    process.exitCode = exitCode;
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
