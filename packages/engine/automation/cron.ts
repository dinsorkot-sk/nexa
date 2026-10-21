/**
 * Cron expressions, in the five-field form: minute, hour, day of month, month,
 * day of week. A field is `*`, a number, a range (`1-5`), a list (`1,2,3`) or
 * a step (`*\/5`, `1-10/2`). The day-of-month and day-of-week fields follow
 * the usual cron rule: when both are restricted, a day matches if either
 * field matches.
 *
 * The expression is evaluated in the trigger's time zone, so a schedule
 * written in local time keeps its meaning across a daylight-saving change.
 */

const FIELDS = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'day of week', min: 0, max: 7 },
] as const;

function parseField(spec: string, min: number, max: number, name: string): Set<number> {
  const values = new Set<number>();
  for (const part of spec.split(',')) {
    const [rangeText, stepText] = part.split('/');
    const step = stepText === undefined ? 1 : Number.parseInt(stepText, 10);
    if (!Number.isInteger(step) || step < 1) throw new Error(`Invalid cron step in "${part}"`);
    let start: number;
    let end: number;
    if (rangeText === '*') {
      start = min;
      end = max;
    } else {
      const [fromText, toText] = rangeText.split('-');
      start = Number.parseInt(fromText, 10);
      end = toText === undefined ? (stepText === undefined ? start : max) : Number.parseInt(toText, 10);
    }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < min || end > max || start > end) {
      throw new Error(`Invalid cron ${name} in "${part}"`);
    }
    for (let value = start; value <= end; value += step) values.add(value);
  }
  return values;
}

/** The local time parts of an instant, in the given time zone. */
export function zonedParts(at: Date, timeZone: string): { minute: number; hour: number; dayOfMonth: number; month: number; dayOfWeek: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
  });
  const parts = Object.fromEntries(formatter.formatToParts(at).map((part) => [part.type, part.value]));
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekday = weekdays.indexOf(parts.weekday ?? 'Sun');
  return {
    // An hour of 24 is midnight in the "hour12: false" format.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    dayOfMonth: Number(parts.day),
    month: Number(parts.month),
    dayOfWeek: weekday < 0 ? 0 : weekday,
  };
}

/** Whether a cron expression matches the given instant, evaluated in the given time zone. */
export function matchesCron(expression: string, at: Date, timeZone = 'UTC'): boolean {
  const specs = expression.trim().split(/\s+/);
  if (specs.length !== FIELDS.length) {
    throw new Error(`A cron expression needs ${FIELDS.length} fields, got ${specs.length}`);
  }
  const parsed = FIELDS.map((field, index) => parseField(specs[index], field.min, field.max, field.name));
  const [minutes, hours, daysOfMonth, months, daysOfWeek] = parsed;
  // Sunday is both 0 and 7 in cron.
  if (daysOfWeek.has(7)) {
    daysOfWeek.delete(7);
    daysOfWeek.add(0);
  }

  const local = zonedParts(at, timeZone);
  if (!minutes.has(local.minute)) return false;
  if (!hours.has(local.hour)) return false;
  if (!months.has(local.month)) return false;
  const dayOfMonthRestricted = specs[2] !== '*';
  const dayOfWeekRestricted = specs[4] !== '*';
  if (dayOfMonthRestricted && dayOfWeekRestricted) {
    return daysOfMonth.has(local.dayOfMonth) || daysOfWeek.has(local.dayOfWeek);
  }
  return daysOfMonth.has(local.dayOfMonth) && daysOfWeek.has(local.dayOfWeek);
}
