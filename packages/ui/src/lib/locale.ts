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
  options: string;
  comboboxError: string;
  retry: string;
  openList: string;
  remove: (label: string) => string;
  actions: string;
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
  statusValid: string;
  statusError: string;
  statusEmpty: string;
  permission: string;
  save: string;
  cancel: string;
  detailFields: string;
  detailRelations: string;
  detailActivity: string;
  detailNoLinks: string;
  recordsOn: string;
  move: (label: string) => string;
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
    options: 'Options',
    comboboxError: 'Could not load options',
    retry: 'Try again',
    openList: 'Open list',
    remove: (label: string) => `Remove ${label}`,
    actions: 'Actions',
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
    statusValid: 'Valid',
    statusError: 'Error',
    statusEmpty: 'Empty',
    permission: 'Permission',
    save: 'Save',
    cancel: 'Cancel',
    detailFields: 'Fields',
    detailRelations: 'Relations',
    detailActivity: 'Activity',
    detailNoLinks: 'No linked records',
    recordsOn: 'Records on',
    move: (label: string) => `Move ${label}`,
  },
  th: {
    close: 'ปิด',
    loading: 'กำลังโหลด',
    noResults: 'ไม่พบรายการ',
    noMatches: 'ไม่พบรายการที่ตรงกัน',
    noMatchesHint: 'ลองใช้คำค้นอื่น',
    selectedCount: (count: number) => `เลือก ${count} รายการ`,
    clear: 'ล้าง',
    options: 'ตัวเลือก',
    comboboxError: 'โหลดรายการไม่สำเร็จ',
    retry: 'ลองอีกครั้ง',
    openList: 'เปิดรายการ',
    remove: (label: string) => `นำ ${label} ออก`,
    actions: 'การกระทำ',
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
    statusValid: 'ถูกต้อง',
    statusError: 'ผิดพลาด',
    statusEmpty: 'ว่าง',
    permission: 'สิทธิ์',
    save: 'บันทึก',
    detailFields: 'ฟิลด์',
    detailRelations: 'ความสัมพันธ์',
    detailActivity: 'กิจกรรม',
    detailNoLinks: 'ไม่มีรายการที่เชื่อมโยง',
    recordsOn: 'รายการของวันที่',
    move: (label: string) => `ย้าย ${label}`,
    cancel: 'ยกเลิก',
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
