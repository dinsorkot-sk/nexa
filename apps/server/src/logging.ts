import { AsyncLocalStorage } from 'async_hooks';

const ctx = new AsyncLocalStorage<{ correlationId: string }>();

export function getCorrelationId(): string | undefined {
  return ctx.getStore()?.correlationId;
}

export function runWithCorrelationId<T>(id: string, fn: () => T): T {
  return ctx.run({ correlationId: id }, fn);
}

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}


type Level = 'debug' | 'info' | 'warn' | 'error';

function log(level: Level, msg: string, extra?: Record<string, unknown>) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    correlationId: getCorrelationId(),
    ...extra,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, extra?: Record<string, unknown>) => log('debug', msg, extra),
  info: (msg: string, extra?: Record<string, unknown>) => log('info', msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => log('warn', msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => log('error', msg, extra),
};