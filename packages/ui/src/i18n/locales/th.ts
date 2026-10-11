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
