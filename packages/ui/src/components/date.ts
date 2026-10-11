import { CalendarDate, GregorianCalendar, toCalendar, type DateValue } from '@internationalized/date';

/**
 * Dates are stored and sent as ISO `YYYY-MM-DD` in the Gregorian calendar, whatever the display language is.
 * The Thai locale shows Buddhist Era years, so the displayed year differs from the stored one by 543. Only the
 * display is ever localised: these two functions are the single place a stored value and a picker value meet.
 */
const iso = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses a stored value. Returns undefined for anything that is not a real Gregorian calendar date. */
export function isoToCalendarDate(value: unknown): CalendarDate | undefined {
  if (typeof value !== 'string') return undefined;
  const match = iso.exec(value);
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1) return undefined;
  const date = new CalendarDate(year, month, 1);
  if (day > date.calendar.getDaysInMonth(date)) return undefined;
  return new CalendarDate(year, month, day);
}

/** Formats a picker value for storage. Converts from any calendar, so a Buddhist-calendar value still yields CE. */
export function calendarDateToIso(value: DateValue | undefined | null): string | undefined {
  if (!value) return undefined;
  const gregorian = toCalendar(value, new GregorianCalendar());
  const pad = (n: number, width: number) => String(n).padStart(width, '0');
  return `${pad(gregorian.year, 4)}-${pad(gregorian.month, 2)}-${pad(gregorian.day, 2)}`;
}

/** The `datetime-local` wire format the engine accepts for `datetime` fields: `YYYY-MM-DDTHH:mm`. */
export const datetimeLocal = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * A `datetime` field is an instant. The browser's datetime-local box has no timezone, so its value is read as the
 * user's local time and stored as a UTC ISO string (`2026-10-11T07:30:00.000Z`). That is unambiguous, and the engine
 * accepts it. Returns undefined for an empty or incomplete box.
 */
export function datetimeLocalToIso(value: string): string | undefined {
  if (!datetimeLocal.test(value)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** The inverse: a stored instant shown in the user's local time for a datetime-local box. Empty if unparseable. */
export function isoToDatetimeLocal(value: unknown): string {
  if (typeof value !== 'string') return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** `HH:mm` or `HH:mm:ss` on a 24-hour clock: a time of day, matching what the engine accepts for `time` fields. */
export const timeOfDay = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
