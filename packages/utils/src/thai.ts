export function toBuddhistYear(date: Date | string): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.getFullYear() + 543;
}

export function formatThaiNumber(n: number, decimals = 2): string {
  return n.toLocaleString('th-TH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatThaiCurrency(n: number): string {
  return `${formatThaiNumber(n, 2)} บาท`;
}

export function vatCalc(amount: number, rate = 7): { net: number; vat: number; total: number } {
  const vat = (amount * rate) / 100;
  return { net: amount, vat: round2(vat), total: round2(amount + vat) };
}

export function whtCalc(amount: number, rate: number): { net: number; wht: number; total: number } {
  const wht = (amount * rate) / 100;
  return { net: amount, wht: round2(wht), total: round2(amount - wht) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

export function formatThaiDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}