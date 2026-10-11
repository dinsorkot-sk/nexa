/** The HTML step for a given number of decimal places: 0 -> 1, 2 -> 0.01, unset -> any. */
export function stepFor(precision: number | undefined): number | 'any' {
  if (precision === undefined) return 'any';
  return precision <= 0 ? 1 : Number((10 ** -precision).toFixed(precision));
}

/**
 * Parses what a number box holds. Returns undefined for empty or partial text ("", "-", ".", "1e"), and never NaN
 * or Infinity, so an empty field can never be sent to the API as a number. A value with more decimal places than
 * `precision` is rounded to it.
 */
export function parseNumberInput(raw: string, precision?: number): number | undefined {
  const text = raw.trim();
  if (text === '') return undefined;
  const value = Number(text);
  if (!Number.isFinite(value)) return undefined;
  if (precision === undefined) return value;
  const factor = 10 ** Math.max(0, precision);
  return Math.round((value + Number.EPSILON * Math.sign(value)) * factor) / factor;
}

/** Text for a stored number: fixed decimals when a precision is set, so 12 shows as 12.00 for currency. */
export function formatDecimal(value: number | null | undefined, precision?: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return precision === undefined ? String(value) : value.toFixed(Math.max(0, precision));
}

/** Locale display for read-only values: grouped digits, with currency when asked. The stored number is unchanged. */
export function formatNumberForDisplay(value: number, locale: string, options: { precision?: number; currency?: string; percent?: boolean } = {}): string {
  const { precision, currency, percent } = options;
  const fractions = precision === undefined ? undefined : { minimumFractionDigits: precision, maximumFractionDigits: precision };
  if (currency) return new Intl.NumberFormat(locale, { style: 'currency', currency, ...fractions }).format(value);
  if (percent) return `${new Intl.NumberFormat(locale, fractions ?? { maximumFractionDigits: 12 }).format(value)}%`;
  return new Intl.NumberFormat(locale, fractions ?? { maximumFractionDigits: 12 }).format(value);
}
