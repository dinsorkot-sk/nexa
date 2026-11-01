const TH_TZ = 'Asia/Bangkok';

function locale(): string {
  if (typeof window === 'undefined') return 'th-TH';
  return localStorage.getItem('nexa:locale') === 'en' ? 'en-US' : 'th-TH';
}

/** พ.ศ. display year offset for manual formatting. */
export function buddhistYear(date: Date | string | number): number {
  const d = typeof date === 'object' && date !== null ? date : new Date(date);
  return d.getFullYear() + 543;
}

export function formatDate(value: string | number | Date, opts: Intl.DateTimeFormatOptions = {}): string {
  const d = typeof value === 'object' && value !== null ? value : new Date(value);
  return new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeZone: TH_TZ, ...opts }).format(d);
}

export function formatDateTime(value: string | number | Date): string {
  const d = typeof value === 'object' && value !== null ? value : new Date(value);
  return new Intl.DateTimeFormat(locale(), { dateStyle: 'short', timeStyle: 'short', timeZone: TH_TZ }).format(d);
}

export function formatTime(value: string | number | Date): string {
  const d = typeof value === 'object' && value !== null ? value : new Date(value);
  return new Intl.DateTimeFormat(locale(), { timeStyle: 'short', timeZone: TH_TZ }).format(d);
}

export function formatNumber(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: fractionDigits, minimumFractionDigits: fractionDigits }).format(value);
}

export function formatDecimal(value: number | string, scale = 2): string {
  return new Intl.NumberFormat(locale(), { minimumFractionDigits: scale, maximumFractionDigits: scale }).format(Number(value));
}

export function formatCurrency(value: number | string, currency = 'THB'): string {
  return new Intl.NumberFormat(locale(), { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value));
}

export function formatRelativeTime(value: string | number | Date): string {
  const d = typeof value === 'object' && value !== null ? value : new Date(value);
  const diffMs = Date.now() - d.getTime();
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  const abs = Math.abs(diffMs);
  const future = diffMs < 0;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', Math.round(abs / 1000)],
    ['minute', Math.round(abs / 60000)],
    ['hour', Math.round(abs / 3600000)],
    ['day', Math.round(abs / 86400000)],
    ['month', Math.round(abs / 2592000000)],
    ['year', Math.round(abs / 31536000000)],
  ];
  for (const [unit, v] of units) {
    if (v < 60 || unit === 'year') return rtf.format(future ? v : -v, unit);
  }
  return rtf.format(0, 'second');
}
