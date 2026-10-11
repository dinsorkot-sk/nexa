import type { Messages } from './en';

const th: Messages = {
  common: {
    close: 'ปิด',
    loading: 'กำลังโหลด',
    empty: '—',
    yes: 'ใช่',
    no: 'ไม่ใช่',
    select: 'เลือก',
    required: 'จำเป็น',
    noResults: 'ไม่พบผลลัพธ์',
  },
  combobox: {
    loading: 'กำลังค้นหา…',
    error: 'โหลดตัวเลือกไม่สำเร็จ',
    retry: 'ลองอีกครั้ง',
    toggle: 'แสดงตัวเลือก',
    remove: 'ลบ {label}',
  },
  datepicker: {
    open: 'เปิดปฏิทิน',
    prev: 'เดือนก่อนหน้า',
    next: 'เดือนถัดไป',
  },
  link: {
    fileNote: 'ใส่ลิงก์ไปยังไฟล์ ยังไม่รองรับการอัปโหลดไฟล์',
    imageNote: 'ใส่ลิงก์ไปยังรูปภาพ ยังไม่รองรับการอัปโหลดรูปภาพ',
    previewAlt: 'ตัวอย่างรูปภาพ',
    invalid: 'ใส่ลิงก์ที่ขึ้นต้นด้วย http:// หรือ https://',
    previewFailed: 'ไม่สามารถโหลดรูปภาพจากลิงก์นี้ได้',
    open: 'เปิดลิงก์',
  },
  json: {
    invalid: 'ใส่ JSON ที่ถูกต้อง เป็นอ็อบเจ็กต์หรืออาร์เรย์',
  },
  field: {
    computed: 'คำนวณอัตโนมัติ',
  },
  table: {
    sortBy: 'เรียงตาม {field} — {direction}',
    sortAsc: 'น้อยไปมาก',
    sortDesc: 'มากไปน้อย',
    sortClear: 'ยกเลิกการเรียง',
    emptyTitle: 'ยังไม่มีข้อมูล',
    emptyDescription: 'รายการจะปรากฏที่นี่เมื่อมีการสร้างข้อมูล',
    retry: 'ลองอีกครั้ง',
  },
  form: {
    save: 'บันทึก',
    cancel: 'ยกเลิก',
    readonly: 'อ่านอย่างเดียว: คุณดูได้แต่แก้ไขรายการนี้ไม่ได้',
    conflict: 'รายการนี้ถูกแก้ไขโดยผู้ใช้อื่น กรุณาโหลดใหม่แล้วลองอีกครั้ง',
    invalid: 'ค่าบางส่วนไม่ถูกต้อง กรุณาตรวจสอบช่องที่มีข้อผิดพลาด',
  },
  detail: {
    fields: 'ข้อมูล',
    relations: 'รายการที่เชื่อมโยง',
    activity: 'ประวัติกิจกรรม',
    noLinks: 'ไม่มีรายการที่เชื่อมโยง',
    noActivity: 'ยังไม่มีกิจกรรม',
  },
  pagination: {
    label: 'การแบ่งหน้า',
    range: '{from}–{to} จาก {total} (หน้า {page} จาก {pages})',
    empty: 'ไม่มีข้อมูล',
    perPage: 'จำนวนแถวต่อหน้า',
    perPageOption: '{n} แถว',
    prev: 'หน้าก่อนหน้า',
    next: 'หน้าถัดไป',
  },
  dialog: {
    close: 'ปิดหน้าต่าง',
  },
  theme: {
    light: 'สว่าง',
    dark: 'มืด',
    system: 'ตามระบบ',
  },
  locale: {
    th: 'ไทย',
    en: 'English',
  },
};

export default th;
