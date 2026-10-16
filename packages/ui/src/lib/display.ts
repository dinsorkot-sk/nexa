import type { FieldDefinition } from '@nexa/meta';
import { isoToCalendarDate } from './date';
import { formatNumberForDisplay } from './number';
import type { NxLocale } from './locale';

/** Resolves a reference id to a label, or undefined when it has none. */
export type ReferenceLabel = (id: string) => string | undefined;

export interface DisplayContext {
  /** Decides the calendar era, digit grouping and the words for yes and no. */
  locale: NxLocale;
  /** Currency for `currency` fields. The field metadata has no currency, so the caller supplies it. */
  currency?: string;
  /** Resolves a reference id to a label. Without it, or when it has no answer, the id is shown. */
  referenceLabel?: ReferenceLabel;
  /** Text for a value that is absent. */
  empty?: string;
  yes?: string;
  no?: string;
}

const bcp47 = { th: 'th-TH', en: 'en-US' } as const;
const numeric = new Set(['number', 'integer', 'decimal', 'currency', 'percentage']);

/**
 * Display text for a stored value, in the user's language. It only formats: the stored value is never altered.
 * Dates show the Buddhist Era year under `th` and the Gregorian year under `en`. Returns the empty text for a missing
 * value, and falls back to showing the raw value rather than hiding data it cannot format.
 */
export function formatFieldDisplay(field: FieldDefinition, value: unknown, context: DisplayContext): string {
  const empty = context.empty ?? '';
  if (value === null || value === undefined || value === '') return empty;
  const locale = bcp47[context.locale];
  const { type, options } = field;

  if (type === 'boolean') return value === true || value === 'true' ? (context.yes ?? 'Yes') : (context.no ?? 'No');

  if (numeric.has(type)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
    const precision = type === 'integer' ? 0 : options.precision;
    if (type === 'currency') return formatNumberForDisplay(value, locale, { precision: precision ?? 2, currency: context.currency ?? 'THB' });
    if (type === 'percentage') return formatNumberForDisplay(value, locale, { precision, percent: true });
    return formatNumberForDisplay(value, locale, { precision });
  }

  if (type === 'date') {
    const date = isoToCalendarDate(value);
    if (!date) return String(value);
    return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(date.toDate('UTC'));
  }
  if (type === 'datetime') {
    const instant = new Date(String(value));
    if (Number.isNaN(instant.getTime())) return String(value);
    return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short' }).format(instant);
  }
  if (type === 'time') return String(value);

  if (type === 'select') {
    const match = options.choices?.find((choice) => choice.value === value);
    return match ? match.label : String(value);
  }
  if (type === 'multiSelect') {
    if (!Array.isArray(value)) return String(value);
    const labels = value.map((item) => options.choices?.find((choice) => choice.value === item)?.label ?? String(item));
    return new Intl.ListFormat(locale, { style: 'narrow', type: 'unit' }).format(labels);
  }
  if (type === 'reference') {
    const id = String(value);
    return context.referenceLabel?.(id) ?? id;
  }
  if (type === 'json') {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
}
