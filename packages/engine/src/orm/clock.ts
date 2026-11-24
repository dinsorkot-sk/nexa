import type { Env } from '../contracts/index.js';

/** Today (YYYY-MM-DD) and the local wall-clock time in the env's context time zone (UTC fallback). */
export function localClock(env: Env, at = new Date()): { today: string; localNow: string } {
  const tz = typeof env.context.tz === 'string' && env.context.tz ? env.context.tz : 'UTC';
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(at);
  } catch {
    const iso = at.toISOString();
    return { today: iso.slice(0, 10), localNow: `${iso.slice(0, 10)} ${iso.slice(11, 19)}` };
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const today = `${get('year')}-${get('month')}-${get('day')}`;
  return { today, localNow: `${today} ${get('hour')}:${get('minute')}:${get('second')}` };
}
