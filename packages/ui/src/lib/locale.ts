import { inject, provide, computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue';

export type NxLocale = 'th' | 'en';

/**
 * Words the components show themselves (close, loading, calendar navigation, yes and no). Anything the caller
 * shows, such as labels and help text, is passed in as props already translated.
 */
export interface NxMessages {
  close: string;
  loading: string;
  noResults: string;
  noMatches: string;
  noMatchesHint: string;
  selectedCount: (count: number) => string;
  clear: string;
  comboboxError: string;
  retry: string;
  openList: string;
  remove: (label: string) => string;
  openCalendar: string;
  prevMonth: string;
  nextMonth: string;
  previous: string;
  next: string;
  pagination: string;
  range: (start: number, end: number, total: number) => string;
  search: string;
  copy: string;
  copied: string;
  empty: string;
  yes: string;
  no: string;
  invalidJson: string;
  urlOnly: string;
}

export const messages: Record<NxLocale, NxMessages> = {
  en: {
    close: 'Close',
    loading: 'Loading',
    noResults: 'No results',
    noMatches: 'No matches',
    noMatchesHint: 'Try a different search term.',
    selectedCount: (count: number) => `${count} selected`,
    clear: 'Clear',
    comboboxError: 'Could not load options',
    retry: 'Try again',
    openList: 'Open list',
    remove: (label: string) => `Remove ${label}`,
    openCalendar: 'Open calendar',
    prevMonth: 'Previous month',
    nextMonth: 'Next month',
    previous: 'Previous page',
    next: 'Next page',
    pagination: 'Pagination',
    range: (start: number, end: number, total: number) => `Showing ${start}-${end} of ${total}`,
    search: 'Search',
    copy: 'Copy',
    copied: 'Copied',
    empty: '—',
    yes: 'Yes',
    no: 'No',
    invalidJson: 'Invalid JSON',
    urlOnly: 'Stored as a link. File upload is not supported yet.',
  },
  th: {
    close: 'ปิด',
    loading: 'กำลังโหลด',
    noResults: 'ไม่พบรายการ',
    noMatches: 'ไม่พบรายการที่ตรงกัน',
    noMatchesHint: 'ลองใช้คำค้นอื่น',
    selectedCount: (count: number) => `เลือก ${count} รายการ`,
    clear: 'ล้าง',
    comboboxError: 'โหลดรายการไม่สำเร็จ',
    retry: 'ลองอีกครั้ง',
    openList: 'เปิดรายการ',
    remove: (label: string) => `นำ ${label} ออก`,
    openCalendar: 'เปิดปฏิทิน',
    prevMonth: 'เดือนก่อนหน้า',
    nextMonth: 'เดือนถัดไป',
    previous: 'หน้าก่อนหน้า',
    next: 'หน้าถัดไป',
    pagination: 'การแบ่งหน้า',
    range: (start: number, end: number, total: number) => `แสดง ${start}-${end} จาก ${total}`,
    search: 'ค้นหา',
    copy: 'คัดลอก',
    copied: 'คัดลอกแล้ว',
    empty: '—',
    yes: 'ใช่',
    no: 'ไม่ใช่',
    invalidJson: 'รูปแบบ JSON ไม่ถูกต้อง',
    urlOnly: 'เก็บเป็นลิงก์ ยังไม่รองรับการอัปโหลดไฟล์',
  },
};

const localeKey = Symbol('nx-locale');

/**
 * Sets the language for every Nx component below this one. Without a provider the language is `en`. Use this at the
 * app root, with a getter or ref, so a switch of language updates the whole tree.
 */
export function provideNxLocale(locale: MaybeRefOrGetter<NxLocale>): void {
  provide(localeKey, computed(() => toValue(locale)));
}

export function useNxLocale(): ComputedRef<NxLocale> {
  return inject<ComputedRef<NxLocale>>(localeKey, computed(() => 'en'));
}

export function useNxMessages(): ComputedRef<NxMessages> {
  const locale = useNxLocale();
  return computed(() => messages[locale.value]);
}
