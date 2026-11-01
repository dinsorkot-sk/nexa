import type { FieldSpec } from '@nexa/types';

export interface FixtureRecord {
  id: string;
  version: number;
  status?: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

const vehicleFields: FieldSpec[] = [
  { id: 'f_code', name: 'code', label: 'เลขที่ยานพาหนะ', logicalType: 'autoNumber', readOnly: true, required: true },
  { id: 'f_plate', name: 'plateNo', label: 'ทะเบียน', logicalType: 'text', required: true, unique: true, minLength: 1, maxLength: 20 },
  { id: 'f_brand', name: 'brand', label: 'ยี่ห้อ', logicalType: 'text', required: true, maxLength: 60 },
  { id: 'f_model', name: 'model', label: 'รุ่น', logicalType: 'text', required: true, maxLength: 60 },
  { id: 'f_year', name: 'year', label: 'ปี', logicalType: 'integer', required: true, minLength: 1900, maxLength: 2100 },
  { id: 'f_engine', name: 'engineSize', label: 'ขนาดเครื่องยนต์ (ลิตร)', logicalType: 'decimal', scale: 1, precision: 3 },
  { id: 'f_price', name: 'price', label: 'ราคาซื้อ', logicalType: 'currency', scale: 2 },
  { id: 'f_tax', name: 'taxRate', label: 'อัตราภาษี', logicalType: 'percentage', scale: 2 },
  { id: 'f_active', name: 'active', label: 'ใช้งานอยู่', logicalType: 'boolean' },
  { id: 'f_purchase', name: 'purchaseDate', label: 'วันที่ซื้อ', logicalType: 'date' },
  { id: 'f_lastService', name: 'lastServiceAt', label: 'เข้าศูนย์ครั้งล่าสุด', logicalType: 'datetime' },
  { id: 'f_serviceTime', name: 'serviceTime', label: 'เวลานัดหมาย', logicalType: 'time' },
  { id: 'f_fuelType', name: 'fuelType', label: 'เชื้อเพลิง', logicalType: 'select', required: true, options: [
    { value: 'petrol', label: 'เบนซิน', color: 'warning' },
    { value: 'diesel', label: 'ดีเซล', color: 'secondary' },
    { value: 'electric', label: 'ไฟฟ้า', color: 'primary' },
    { value: 'hybrid', label: 'ไฮบริด', color: 'info' },
  ] },
  { id: 'f_features', name: 'features', label: 'อุปกรณ์เสริม', logicalType: 'multiSelect', options: [
    { value: 'gps', label: 'GPS' }, { value: 'camera', label: 'กล้องถอย' }, { value: 'cruise', label: 'ครูซคอนโทรล' }, { value: 'abs', label: 'ABS' },
  ] },
  { id: 'f_status', name: 'status', label: 'สถานะ', logicalType: 'select', required: true, options: [
    { value: 'available', label: 'ว่าง', color: 'primary' },
    { value: 'reserved', label: 'จองแล้ว', color: 'warning' },
    { value: 'in_service', label: 'ใช้งานอยู่', color: 'success' },
    { value: 'maintenance', label: 'ซ่อมบำรุง', color: 'error' },
    { value: 'retired', label: 'ปลดประจำการ', color: 'neutral' },
  ] },
  { id: 'f_driver', name: 'assignedDriverId', label: 'คนขับประจำ', logicalType: 'reference', referenceEntity: 'driver' },
  { id: 'f_insurance', name: 'insuranceDoc', label: 'เอกสารประกัน', logicalType: 'file' },
  { id: 'f_image', name: 'image', label: 'รูปภาพ', logicalType: 'image' },
  { id: 'f_meta', name: 'metadata', label: 'เมตาดาต้า', logicalType: 'json' },
  { id: 'f_age', name: 'ageYears', label: 'อายุรถ (ปี)', logicalType: 'formula', readOnly: true, formula: 'YEAR(TODAY()) - {year}' },
  { id: 'f_value', name: 'currentValue', label: 'มูลค่าปัจจุบัน', logicalType: 'computed', readOnly: true, formula: '{price} * (1 - {taxRate}) ^ {ageYears}' },
  { id: 'f_notes', name: 'notes', label: 'หมายเหตุ', logicalType: 'longText' },
  { id: 'f_email', name: 'contactEmail', label: 'อีเมลผู้ติดต่อ', logicalType: 'email' },
  { id: 'f_phone', name: 'contactPhone', label: 'เบอร์ผู้ติดต่อ', logicalType: 'phone' },
  { id: 'f_url', name: 'manualUrl', label: 'คู่มือออนไลน์', logicalType: 'url' },
];

const driverFields: FieldSpec[] = [
  { id: 'f_d_code', name: 'code', label: 'รหัสคนขับ', logicalType: 'autoNumber', readOnly: true, required: true },
  { id: 'f_d_name', name: 'name', label: 'ชื่อ-นามสกุล', logicalType: 'text', required: true, maxLength: 100 },
  { id: 'f_d_license', name: 'licenseNo', label: 'ใบขับขี่', logicalType: 'text', required: true, unique: true, pattern: '^[0-9]{10}$' },
  { id: 'f_d_expiry', name: 'licenseExpiry', label: 'ใบขับขี่หมดอายุ', logicalType: 'date' },
  { id: 'f_d_phone', name: 'phone', label: 'เบอร์โทร', logicalType: 'phone', required: true },
  { id: 'f_d_email', name: 'email', label: 'อีเมล', logicalType: 'email' },
  { id: 'f_d_status', name: 'status', label: 'สถานะ', logicalType: 'select', required: true, options: [
    { value: 'available', label: 'ว่าง', color: 'primary' },
    { value: 'busy', label: 'มีงาน', color: 'warning' },
    { value: 'off', label: 'ลาพักร้อน', color: 'neutral' },
  ] },
  { id: 'f_d_hire', name: 'hireDate', label: 'วันเริ่มงาน', logicalType: 'date' },
  { id: 'f_d_salary', name: 'salary', label: 'เงินเดือน', logicalType: 'currency', scale: 2 },
  { id: 'f_d_address', name: 'address', label: 'ที่อยู่', logicalType: 'longText' },
  { id: 'f_d_avatar', name: 'avatar', label: 'รูปประจำตัว', logicalType: 'image' },
  { id: 'f_d_notes', name: 'notes', label: 'หมายเหตุ', logicalType: 'longText' },
];

const maintenanceFields: FieldSpec[] = [
  { id: 'f_m_code', name: 'code', label: 'เลขที่งาน', logicalType: 'autoNumber', readOnly: true, required: true },
  { id: 'f_m_vehicle', name: 'vehicleId', label: 'ยานพาหนะ', logicalType: 'reference', referenceEntity: 'vehicle', required: true },
  { id: 'f_m_driver', name: 'driverId', label: 'คนขับ', logicalType: 'reference', referenceEntity: 'driver' },
  { id: 'f_m_type', name: 'type', label: 'ประเภท', logicalType: 'select', required: true, options: [
    { value: 'repair', label: 'ซ่อม', color: 'error' },
    { value: 'service', label: 'service', color: 'info' },
    { value: 'inspection', label: 'ตรวจเช็ค', color: 'secondary' },
    { value: 'accident', label: 'อุบัติเหตุ', color: 'warning' },
  ] },
  { id: 'f_m_status', name: 'status', label: 'สถานะ', logicalType: 'select', required: true, options: [
    { value: 'pending', label: 'รอดำเนินการ', color: 'warning' },
    { value: 'in_progress', label: 'กำลังดำเนินการ', color: 'info' },
    { value: 'done', label: 'เสร็จแล้ว', color: 'success' },
    { value: 'cancelled', label: 'ยกเลิก', color: 'neutral' },
  ] },
  { id: 'f_m_cost', name: 'cost', label: 'ค่าใช้จ่าย', logicalType: 'currency', scale: 2 },
  { id: 'f_m_odo', name: 'odometer', label: 'เลขไมล์', logicalType: 'integer' },
  { id: 'f_m_started', name: 'startedAt', label: 'เริ่ม', logicalType: 'datetime' },
  { id: 'f_m_finished', name: 'finishedAt', label: 'เสร็จ', logicalType: 'datetime' },
  { id: 'f_m_duration', name: 'durationHours', label: 'ระยะเวลา (ชม.)', logicalType: 'number', scale: 1 },
  { id: 'f_m_parts', name: 'parts', label: 'อะไหล่', logicalType: 'json' },
  { id: 'f_m_tax', name: 'vatRate', label: 'ภาษีมูลค่าเพิ่ม', logicalType: 'percentage', scale: 2 },
  { id: 'f_m_invoice', name: 'invoice', label: 'ใบแจ้งหนี้', logicalType: 'file' },
  { id: 'f_m_notes', name: 'notes', label: 'หมายเหตุ', logicalType: 'longText' },
];

const fuelFields: FieldSpec[] = [
  { id: 'f_f_code', name: 'code', label: 'เลขที่บันทึก', logicalType: 'autoNumber', readOnly: true, required: true },
  { id: 'f_f_vehicle', name: 'vehicleId', label: 'ยานพาหนะ', logicalType: 'reference', referenceEntity: 'vehicle', required: true },
  { id: 'f_f_driver', name: 'driverId', label: 'คนขับ', logicalType: 'reference', referenceEntity: 'driver' },
  { id: 'f_f_date', name: 'date', label: 'วันที่เติม', logicalType: 'date', required: true },
  { id: 'f_f_odo', name: 'odometer', label: 'เลขไมล์', logicalType: 'integer' },
  { id: 'f_f_liters', name: 'liters', label: 'ปริมาณ (ลิตร)', logicalType: 'decimal', scale: 2 },
  { id: 'f_f_price', name: 'pricePerLiter', label: 'ราคา/ลิตร', logicalType: 'currency', scale: 2 },
  { id: 'f_f_total', name: 'total', label: 'รวม', logicalType: 'computed', readOnly: true, formula: '{liters} * {pricePerLiter}' },
  { id: 'f_f_station', name: 'station', label: 'ปั๊ม', logicalType: 'text' },
  { id: 'f_f_receipt', name: 'receipt', label: 'ใบเสร็จ', logicalType: 'image' },
  { id: 'f_f_note', name: 'note', label: 'หมายเหตุ', logicalType: 'longText' },
];

const now = '2026-10-15T10:42:00Z';

export function fixtureVehicleEntity() {
  return {
    id: 'ent_vehicle',
    module: 'vehicle',
    name: 'vehicle',
    label: 'ยานพาหนะ',
    tableName: 'vehicle',
    displayField: 'plateNo',
    statusField: 'status',
    recordCount: 342,
    fields: vehicleFields,
    records: [
      { id: 'rec_vh1', version: 13, code: 'VH-0001', plateNo: 'กข 1234', brand: 'Ford', model: 'Ranger', year: 2018, engineSize: 2.2, price: 985000, taxRate: 7, active: true, purchaseDate: '2018-03-15', lastServiceAt: '2026-09-28T09:30:00Z', serviceTime: '09:30', fuelType: 'diesel', features: ['gps', 'camera', 'abs'], assignedDriverId: 'rec_d1', insuranceDoc: 'https://cdn.example.com/ins/vh-0001.pdf', image: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800', metadata: { color: 'ขาว', gear: 'auto' }, ageYears: 8, currentValue: 512000, notes: 'รถประจำฝ่ายขาย', contactEmail: 'fleet@loghoizon.co.th', contactPhone: '0812345678', manualUrl: 'https://example.com/manuals/ranger', status: 'in_service', createdAt: now, updatedAt: now },
      { id: 'rec_vh2', version: 7, code: 'VH-0002', plateNo: 'กข 1235', brand: 'Toyota', model: 'Revo', year: 2020, engineSize: 2.4, price: 1120000, taxRate: 7, active: true, purchaseDate: '2020-06-01', lastServiceAt: '2026-10-01T14:00:00Z', serviceTime: '14:00', fuelType: 'diesel', features: ['gps', 'cruise'], assignedDriverId: 'rec_d2', insuranceDoc: 'https://cdn.example.com/ins/vh-0002.pdf', image: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800', metadata: { color: 'เงิน' }, ageYears: 6, currentValue: 790000, notes: '', contactEmail: '', contactPhone: '', manualUrl: '', status: 'available', createdAt: now, updatedAt: now },
      { id: 'rec_vh3', version: 21, code: 'VH-0003', plateNo: 'กทม 9999', brand: 'Honda', model: 'City', year: 2022, engineSize: 1.5, price: 789000, taxRate: 7, active: true, purchaseDate: '2022-01-20', lastServiceAt: '2026-08-15T10:00:00Z', serviceTime: '10:00', fuelType: 'petrol', features: ['gps'], assignedDriverId: 'rec_d3', insuranceDoc: '', image: 'https://images.unsplash.com/photo-1590362891991-f776e747a588?w=800', metadata: { color: 'ขาว' }, ageYears: 4, currentValue: 612000, notes: 'รถผู้จัดการ', contactEmail: 'office@loghoizon.co.th', contactPhone: '021234567', manualUrl: '', status: 'reserved', createdAt: now, updatedAt: now },
      { id: 'rec_vh4', version: 3, code: 'VH-0004', plateNo: 'กข 5678', brand: 'BYD', model: 'ATTO 3', year: 2023, engineSize: 0, price: 1199900, taxRate: 7, active: true, purchaseDate: '2023-07-11', lastServiceAt: '2026-10-10T08:00:00Z', serviceTime: '08:00', fuelType: 'electric', features: ['gps', 'camera'], assignedDriverId: '', insuranceDoc: '', image: 'https://images.unsplash.com/photo-1617788138017-80ad40651399?w=800', metadata: { battery: '60kWh' }, ageYears: 3, currentValue: 1020000, notes: 'EV ทดลองใช้', contactEmail: '', contactPhone: '', manualUrl: 'https://example.com/byd-att0', status: 'in_service', createdAt: now, updatedAt: now },
      { id: 'rec_vh5', version: 45, code: 'VH-0005', plateNo: 'กข 9999', brand: 'Isuzu', model: 'D-Max', year: 2015, engineSize: 1.9, price: 640000, taxRate: 7, active: false, purchaseDate: '2015-11-30', lastServiceAt: '2025-12-20T11:00:00Z', serviceTime: '11:00', fuelType: 'diesel', features: ['abs'], assignedDriverId: '', insuranceDoc: '', image: '', metadata: {}, ageYears: 11, currentValue: 190000, notes: 'ปลดประจำการ', contactEmail: '', contactPhone: '', manualUrl: '', status: 'retired', createdAt: now, updatedAt: now },
      { id: 'rec_vh6', version: 2, code: 'VH-0006', plateNo: 'กพ 1234', brand: 'Mitsubishi', model: 'Triton', year: 2021, engineSize: 2.4, price: 985000, taxRate: 7, active: true, purchaseDate: '2021-04-05', lastServiceAt: '2026-09-10T16:30:00Z', serviceTime: '16:30', fuelType: 'diesel', features: ['gps', 'camera', 'cruise', 'abs'], assignedDriverId: 'rec_d4', insuranceDoc: 'https://cdn.example.com/ins/vh-0006.pdf', image: 'https://images.unsplash.com/photo-1606016159991-dfe4f2746ad5?w=800', metadata: { color: 'ดำ' }, ageYears: 5, currentValue: 720000, notes: '', contactEmail: '', contactPhone: '', manualUrl: '', status: 'maintenance', createdAt: now, updatedAt: now },
      { id: 'rec_vh7', version: 9, code: 'VH-0007', plateNo: 'กฉ 7890', brand: 'Toyota', model: 'Camry Hybrid', year: 2024, engineSize: 2.5, price: 1599000, taxRate: 7, active: true, purchaseDate: '2024-02-14', lastServiceAt: '2026-10-12T09:00:00Z', serviceTime: '09:00', fuelType: 'hybrid', features: ['gps', 'camera', 'cruise'], assignedDriverId: 'rec_d5', insuranceDoc: '', image: 'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=800', metadata: { color: 'ดำ' }, ageYears: 2, currentValue: 1420000, notes: 'รถกรรมการ', contactEmail: 'ceo@loghoizon.co.th', contactPhone: '0810000000', manualUrl: '', status: 'available', createdAt: now, updatedAt: now },
      { id: 'rec_vh8', version: 1, code: 'VH-0008', plateNo: 'กข 2468', brand: 'MG', model: 'VS HEV', year: 2023, engineSize: 1.5, price: 899000, taxRate: 7, active: true, purchaseDate: '2023-09-01', lastServiceAt: '2026-07-22T13:00:00Z', serviceTime: '13:00', fuelType: 'hybrid', features: ['gps'], assignedDriverId: '', insuranceDoc: '', image: '', metadata: {}, ageYears: 3, currentValue: 760000, notes: '', contactEmail: '', contactPhone: '', manualUrl: '', status: 'available', createdAt: now, updatedAt: now },
    ] as FixtureRecord[],
  };
}

export function fixtureDriverEntity() {
  return {
    id: 'ent_driver',
    module: 'vehicle',
    name: 'driver',
    label: 'คนขับ',
    tableName: 'driver',
    displayField: 'name',
    statusField: 'status',
    recordCount: 24,
    fields: driverFields,
    records: [
      { id: 'rec_d1', version: 5, code: 'DR-0001', name: 'สมชาย ใจดี', licenseNo: '1001234567', licenseExpiry: '2027-05-31', phone: '0811111111', email: 'somchai@loghoizon.co.th', status: 'available', hireDate: '2019-03-01', salary: 24500, address: '123 ถนนสุขุมวิท กรุงเทพฯ', avatar: '', notes: 'ขับรถบรรทุกได้', createdAt: now, updatedAt: now },
      { id: 'rec_d2', version: 2, code: 'DR-0002', name: 'นัฐพงษ์ พันธุ์ดี', licenseNo: '1001234568', licenseExpiry: '2026-12-31', phone: '0812222222', email: 'nattapong@loghoizon.co.th', status: 'busy', hireDate: '2020-07-15', salary: 23000, address: '456 ถนนพระราม 4', avatar: '', notes: '', createdAt: now, updatedAt: now },
      { id: 'rec_d3', version: 8, code: 'DR-0003', name: 'สุนทร รักไทย', licenseNo: '1001234569', licenseExpiry: '2028-01-15', phone: '0813333333', email: 'sunthorn@loghoizon.co.th', status: 'available', hireDate: '2018-11-20', salary: 26000, address: '789 ถนนสีลม', avatar: '', notes: '', createdAt: now, updatedAt: now },
      { id: 'rec_d4', version: 1, code: 'DR-0004', name: 'มานี สุขใจ', licenseNo: '1001234570', licenseExpiry: '2026-08-30', phone: '0814444444', email: 'manee@loghoizon.co.th', status: 'off', hireDate: '2021-05-10', salary: 22000, address: '101 ถนนข้าวสาร', avatar: '', notes: 'ลาพักร้อน', createdAt: now, updatedAt: now },
      { id: 'rec_d5', version: 12, code: 'DR-0005', name: 'ประเสริฐ มั่นคง', licenseNo: '1001234571', licenseExpiry: '2029-03-10', phone: '0815555555', email: 'prasert@loghoizon.co.th', status: 'busy', hireDate: '2017-09-01', salary: 28000, address: '202 ถนนเจริญกรุง', avatar: '', notes: '', createdAt: now, updatedAt: now },
      { id: 'rec_d6', version: 4, code: 'DR-0006', name: 'วรรณนา กล้าหาญ', licenseNo: '1001234572', licenseExpiry: '2027-11-30', phone: '0816666666', email: 'wanna@loghoizon.co.th', status: 'available', hireDate: '2022-01-16', salary: 21000, address: '303 ถนนรัชดา', avatar: '', notes: '', createdAt: now, updatedAt: now },
    ] as FixtureRecord[],
  };
}

export function fixtureMaintenanceEntity() {
  return {
    id: 'ent_maintenance',
    module: 'vehicle',
    name: 'maintenance',
    label: 'งานซ่อมบำรุง',
    tableName: 'maintenance',
    displayField: 'code',
    statusField: 'status',
    recordCount: 128,
    fields: maintenanceFields,
    records: [
      { id: 'rec_mt1', version: 6, code: 'MT-0001', vehicleId: 'rec_vh1', driverId: 'rec_d1', type: 'service', status: 'done', cost: 4500, odometer: 85000, startedAt: '2026-09-28T09:00:00Z', finishedAt: '2026-09-28T12:30:00Z', durationHours: 3.5, parts: [{ name: 'ถ่ายน้ำมันเครื่อง', qty: 1 }], vatRate: 7, invoice: 'https://cdn.example.com/inv/mt-0001.pdf', notes: 'ถ่ายน้ำมันตามระยะ', createdAt: now, updatedAt: now },
      { id: 'rec_mt2', version: 2, code: 'MT-0002', vehicleId: 'rec_vh6', driverId: 'rec_d4', type: 'repair', status: 'in_progress', cost: 18500, odometer: 120000, startedAt: '2026-10-14T08:00:00Z', finishedAt: '', durationHours: 0, parts: [{ name: 'ผ้าเบรกหน้า', qty: 1 }, { name: 'จานเบรก', qty: 2 }], vatRate: 7, invoice: '', notes: 'เบรกหน้าสึก', createdAt: now, updatedAt: now },
      { id: 'rec_mt3', version: 1, code: 'MT-0003', vehicleId: 'rec_vh2', driverId: '', type: 'inspection', status: 'pending', cost: 0, odometer: 64000, startedAt: '', finishedAt: '', durationHours: 0, parts: [], vatRate: 7, invoice: '', notes: 'ตรวจเช็คประจำปี', createdAt: now, updatedAt: now },
      { id: 'rec_mt4', version: 9, code: 'MT-0004', vehicleId: 'rec_vh3', driverId: 'rec_d3', type: 'accident', status: 'done', cost: 52000, odometer: 31000, startedAt: '2026-08-02T10:00:00Z', finishedAt: '2026-08-20T17:00:00Z', durationHours: 12, parts: [{ name: 'กันชนหน้า', qty: 1 }, { name: 'ไฟหน้า', qty: 2 }], vatRate: 7, invoice: 'https://cdn.example.com/inv/mt-0004.pdf', notes: 'อุบัติเหตุชนด้านหน้า', createdAt: now, updatedAt: now },
      { id: 'rec_mt5', version: 3, code: 'MT-0005', vehicleId: 'rec_vh7', driverId: 'rec_d5', type: 'service', status: 'pending', cost: 3200, odometer: 15000, startedAt: '', finishedAt: '', durationHours: 0, parts: [], vatRate: 7, invoice: '', notes: 'ตรวจเช็คระยะ 15,000 กม.', createdAt: now, updatedAt: now },
    ] as FixtureRecord[],
  };
}

export function fixtureFuelEntity() {
  return {
    id: 'ent_fuel',
    module: 'vehicle',
    name: 'fuel',
    label: 'บันทึกน้ำมัน',
    tableName: 'fuel_log',
    displayField: 'code',
    recordCount: 611,
    fields: fuelFields,
    records: [
      { id: 'rec_fu1', version: 1, code: 'FU-0001', vehicleId: 'rec_vh1', driverId: 'rec_d1', date: '2026-10-10', odometer: 85200, liters: 48.5, pricePerLiter: 31.95, total: 1549.58, station: 'ปั๊ม ปตท. สุขุมวิท', receipt: '', note: '', createdAt: now, updatedAt: now },
      { id: 'rec_fu2', version: 1, code: 'FU-0002', vehicleId: 'rec_vh2', driverId: 'rec_d2', date: '2026-10-11', odometer: 63800, liters: 42.0, pricePerLiter: 31.95, total: 1341.9, station: 'ปั๊ม เชลล์ พระราม 4', receipt: 'https://cdn.example.com/receipts/fu-0002.jpg', note: '', createdAt: now, updatedAt: now },
      { id: 'rec_fu3', version: 2, code: 'FU-0003', vehicleId: 'rec_vh6', driverId: 'rec_d4', date: '2026-10-12', odometer: 119800, liters: 55.0, pricePerLiter: 30.95, total: 1702.25, station: 'ปั๊ม ปตท. บางนา', receipt: '', note: 'เติมก่อนวิ่งทางไกล', createdAt: now, updatedAt: now },
      { id: 'rec_fu4', version: 1, code: 'FU-0004', vehicleId: 'rec_vh4', driverId: '', date: '2026-10-13', odometer: 12400, liters: 0, pricePerLiter: 0, total: 0, station: 'ชาร์จไฟ DC Fast', receipt: '', note: 'ชาร์จไฟฟ้า 45 kWh', createdAt: now, updatedAt: now },
    ] as FixtureRecord[],
  };
}

export function fixtureModules() {
  const vehicle = fixtureVehicleEntity();
  const driver = fixtureDriverEntity();
  const maintenance = fixtureMaintenanceEntity();
  const fuel = fixtureFuelEntity();
  return [
    {
      id: 'mod_vehicle', key: 'vehicle', name: 'บริหารยานพาหนะ', icon: 'i-lucide-truck',
      description: 'จัดการยานพาหนะ คนขับ งานซ่อมบำรุง และบันทึกน้ำมัน',
      version: '1.2.0', status: 'enabled' as const, owner: 'Loghoizon', updatedAt: now,
      entities: [vehicle, driver, maintenance, fuel],
    },
    {
      id: 'mod_inventory', key: 'inventory', name: 'สินค้าคงคลัง', icon: 'i-lucide-package',
      description: 'จัดการสินค้าคงคลังและคลังสินค้า', version: '2.0.1', status: 'published' as const, owner: 'Loghoizon', updatedAt: now,
      entities: [],
    },
    {
      id: 'mod_sales', key: 'sales', name: 'การขาย', icon: 'i-lucide-shopping-cart',
      description: 'ใบสั่งขายและลูกค้า', version: '0.3.0', status: 'draft' as const, owner: 'Loghoizon', updatedAt: now,
      entities: [],
    },
    {
      id: 'mod_accounting', key: 'accounting', name: 'การบัญชี', icon: 'i-lucide-book-open',
      description: 'สมุดรายวันและภาษี', version: '1.0.0', status: 'enabled' as const, owner: 'Loghoizon', updatedAt: now,
      entities: [],
    },
  ];
}

export const fixtureOrganizations = [
  { id: 'org_loghoizon', slug: 'loghoizon', name: 'Loghoizon', memberCount: 24, moduleCount: 12, current: true },
  { id: 'org_yic', slug: 'yic', name: 'YIC Transport', memberCount: 8, moduleCount: 3, current: false },
];

export const fixtureMemberships = [
  { organizationId: 'org_loghoizon', organizationName: 'Loghoizon', role: 'owner', memberCount: 24, moduleCount: 12, current: true },
  { organizationId: 'org_yic', organizationName: 'YIC Transport', role: 'admin', memberCount: 8, moduleCount: 3, current: false },
];

export const fixtureNotifications = [
  { id: 'ntf1', kind: 'automation', title: 'ระบบอัตโนมัติ: แจ้งเตือนประกันหมดอายุ', body: 'VH-0001 ประกันหมดอายุใน 30 วัน', actor: 'ระบบอัตโนมัติ', read: false, createdAt: now },
  { id: 'ntf2', kind: 'invitation', title: 'คำเชิญเข้าองค์กร', body: 'คุณได้รับเชิญเข้า YIC Transport ในบทบาท admin', actor: 'Nattapong P.', read: false, createdAt: now },
  { id: 'ntf3', kind: 'sync', title: 'การ sync ล้มเหลว', body: 'เชื่อมต่อ API ภายนอกไม่สำเร็จ (ลองใหม่ 3/5)', actor: 'ระบบ', read: true, createdAt: now },
  { id: 'ntf4', kind: 'import', title: 'นำเข้า CSV เสร็จสิ้น', body: 'นำเข้าคนขับ 124 รายการสำเร็จ, ล้มเหลว 2 รายการ', actor: 'ระบบ', read: true, createdAt: now },
];

export const fixtureActivity = [
  { id: 'act1', kind: 'transition', user: 'Somchai J.', summary: 'เปลี่ยนสถานะ ว่าง → จองแล้ว', record: 'VH-0001', createdAt: now },
  { id: 'act2', kind: 'update', user: 'Nattapong P.', summary: 'แก้ไข mileage: 84,200 → 85,000', record: 'VH-0001', createdAt: now },
  { id: 'act3', kind: 'automation', user: 'ระบบอัตโนมัติ', summary: 'ส่งแจ้งเตือน: ประกันหมดอายุใน 30 วัน', record: 'VH-0001', createdAt: now },
  { id: 'act4', kind: 'comment', user: 'Manee S.', summary: 'ความคิดเห็น: นัดศูนย์วันพฤหัส', record: 'VH-0001', createdAt: now },
  { id: 'act5', kind: 'update', user: 'Somchai J.', summary: 'แก้ไข hidden field (ซ่อนไว้)', record: 'VH-0001', createdAt: now },
];

export const fixtureWorkflow = {
  id: 'wf_vehicle_status',
  name: 'สถานะยานพาหนะ',
  field: 'status',
  forwardOnly: true,
  states: ['available', 'reserved', 'in_service', 'maintenance', 'retired'],
  transitions: [
    { from: 'available', to: 'reserved', roles: ['admin', 'member'], guard: null, guardReason: null, actions: ['updateRecord', 'notification'], recordCount: 12 },
    { from: 'reserved', to: 'in_service', roles: ['admin', 'member'], guard: '{assignedDriverId} != null', guardReason: 'Assign a driver first', actions: ['updateRecord', 'notification', 'webhook'], recordCount: 5 },
    { from: 'in_service', to: 'maintenance', roles: ['admin'], guard: null, guardReason: null, actions: ['updateRecord'], recordCount: 3 },
    { from: 'maintenance', to: 'in_service', roles: ['admin'], guard: null, guardReason: null, actions: ['updateRecord', 'notification'], recordCount: 2 },
    { from: 'in_service', to: 'retired', roles: ['owner'], guard: null, guardReason: null, actions: ['updateRecord', 'webhook'], recordCount: 1 },
  ],
};

export const fixturePermissions = {
  roles: [
    { id: 'owner', name: 'owner', count: 1, description: 'สิทธิ์ทั้งหมด' },
    { id: 'admin', name: 'admin', count: 3, description: 'จัดการองค์กรและโมดูล' },
    { id: 'member', name: 'member', count: 18, description: 'ใช้งานทั่วไป' },
    { id: 'viewer', name: 'viewer', count: 2, description: 'อ่านอย่างเดียว' },
  ],
  permissions: ['read', 'create', 'update', 'delete', 'import', 'export', 'transition', 'action:execute', 'report'],
  matrix: {
    owner: { read: 'allowed', create: 'allowed', update: 'allowed', delete: 'allowed', import: 'allowed', export: 'allowed', transition: 'allowed', 'action:execute': 'allowed', report: 'allowed' },
    admin: { read: 'allowed', create: 'allowed', update: 'allowed', delete: 'allowed', import: 'allowed', export: 'allowed', transition: 'allowed', 'action:execute': 'allowed', report: 'allowed' },
    member: { read: 'allowed', create: 'allowed', update: 'allowed', delete: 'denied', import: 'allowed', export: 'denied', transition: 'allowed', 'action:execute': 'denied', report: 'denied' },
    viewer: { read: 'allowed', create: 'denied', update: 'denied', delete: 'denied', import: 'denied', export: 'denied', transition: 'denied', 'action:execute': 'denied', report: 'locked' },
  },
  fieldLevel: [
    { field: 'price', owner: 'allowed', admin: 'allowed', member: 'allowed', viewer: 'locked' },
    { field: 'cost', owner: 'allowed', admin: 'allowed', member: 'denied', viewer: 'locked' },
    { field: 'salary', owner: 'allowed', admin: 'allowed', member: 'denied', viewer: 'locked' },
  ],
};

export const fixtureVersions = [
  { version: 'working copy', status: 'draft', changes: 4, note: 'แก้ไข field 2, เพิ่ม workflow 1, ลบ automation 1' },
  { version: '1.2.0', status: 'published', changes: 11, note: '' },
  { version: '1.1.0', status: 'published', changes: 6, note: '' },
  { version: '1.0.0', status: 'published', changes: 34, note: '' },
];

export const fixturePackageDiff = [
  { kind: 'added', path: 'entity.maintenance.field.nextServiceAt', detail: 'date' },
  { kind: 'changed', path: 'entity.vehicle.field.price', detail: 'currency scale 2' },
  { kind: 'removed', path: 'entity.vehicle.field.oldTag', detail: 'text (ค่าที่เก็บไว้จะถูกซ่อน)' },
];

export const fixtureAudit = [
  { id: 'aud1', at: now, actor: 'Somchai J.', action: 'update', target: 'vehicle VH-0001', version: '12 → 13', requestId: 'req_01hzx8demo' },
  { id: 'aud2', at: now, actor: 'Nattapong P.', action: 'transition', target: 'vehicle VH-0003', version: '6 → 7', requestId: 'req_01hzx9demo' },
  { id: 'aud3', at: now, actor: 'ระบบอัตโนมัติ', action: 'create', target: 'maintenance MT-0005', version: '—', requestId: 'req_01hzxadem0' },
];

export const fixtureEvents = [
  { id: 'evt1', type: 'vehicle.reserved', module: 'vehicle', record: 'VH-0001', actor: 'Somchai J.', forwarded: 'notification', at: now },
  { id: 'evt2', type: 'record.created', module: 'vehicle', record: 'VH-0008', actor: 'Nattapong P.', forwarded: '—', at: now },
  { id: 'evt3', type: 'webhook.failed', module: 'vehicle', record: 'VH-0004', actor: 'outbox', forwarded: 'retry 3/5', at: now },
  { id: 'evt4', type: 'invitation.accepted', module: 'platform', record: 'u_01hz', actor: 'Manee S.', forwarded: '—', at: now },
];

export const fixtureAutomations = [
  { id: 'aut1', name: 'แจ้งเตือนประกันหมดอายุ', trigger: 'record.updated', condition: 'insuranceExpiry <= TODAY()+30d', actions: ['notification → role member (in-app, email)'], enabled: true, lastRun: now },
  { id: 'aut2', name: 'ซิงค์ไปภายนอก', trigger: 'workflow.transition', condition: 'status = in_service', actions: ['webhook → https://hooks.example.com/nexa', 'updateRecord'], enabled: true, lastRun: now },
  { id: 'aut3', name: 'ออกเอกสารประจำปี', trigger: 'event vehicle.retired', condition: '', actions: ['notification → role admin'], enabled: false, lastRun: '' },
];

export const fixtureAutomationRuns = [
  { id: 'run1', status: 'success', trigger: 'workflow.transition', count: 12, error: '', deliveryId: 'dlv_01hz', at: now },
  { id: 'run2', status: 'failed', trigger: 'record.updated', count: 3, error: 'ECONNREFUSED hooks.example.com', deliveryId: 'dlv_01hzx', at: now },
  { id: 'run3', status: 'pending', trigger: 'event', count: 1, error: '', deliveryId: 'dlv_01hzy', at: now },
];

export const fixtureDashboardWidgets = [
  { id: 'w1', kind: 'stat', title: 'ยานพาหนะทั้งหมด', value: 342, trend: { dir: 'up', text: '+4 vs last month' }, report: 'rep_vehicle_count', span: 3 },
  { id: 'w2', kind: 'stat', title: 'ใช้งานอยู่', value: 289, trend: { dir: 'up', text: '+1.2%' }, report: 'rep_active', span: 3 },
  { id: 'w3', kind: 'stat', title: 'ซ่อมบำรุง', value: 41, trend: { dir: 'down', text: '-8%' }, report: 'rep_maintenance', span: 3 },
  { id: 'w4', kind: 'stat', title: 'ปลดประจำการ', value: 12, trend: { dir: 'none', text: '0%' }, report: 'rep_retired', span: 3 },
  { id: 'w5', kind: 'bar', title: 'ตามยี่ห้อ', series: ['Ford', 'Toyota', 'Honda', 'BYD', 'Isuzu', 'Mitsubishi', 'MG'], values: [96, 88, 64, 32, 28, 22, 12], span: 6 },
  { id: 'w6', kind: 'donut', title: 'ตามสถานะ', series: ['ใช้งานอยู่', 'ว่าง', 'จองแล้ว', 'ซ่อมบำรุง', 'ปลดประจำการ'], values: [289, 12, 5, 24, 12], span: 6 },
];

export const fixtureCsv = {
  fileName: 'vehicles.csv',
  rows: 128,
  sizeKb: 42,
  columns: [
    { csv: 'plate', sample: 'กข 1234', field: 'plateNo', status: 'ready' },
    { csv: 'brand', sample: 'Ford', field: 'brand', status: 'ready' },
    { csv: 'model', sample: 'Ranger', field: 'model', status: 'ready' },
    { csv: 'year', sample: '2561', field: 'year', status: 'warning', note: 'ตีความปีเป็น พ.ศ. → 2018' },
    { csv: 'driver', sample: 'สมชาย ใจดี', field: 'assignedDriverId', status: 'ready', note: 'match by name' },
    { csv: 'unused', sample: '-', field: null, status: 'skipped' },
  ],
  preview: {
    total: 128,
    ready: 121,
    issues: [
      { row: 3, issue: 'ทะเบียนซ้ำ', detail: 'กข 1234 ถูกใช้โดย VH-0001', code: 409 },
      { row: 7, issue: 'ฟิลด์บังคับว่าง', detail: 'brand', code: 400 },
      { row: 42, issue: 'ทะเบียนซ้ำ', detail: 'กข 9999 ถูกใช้โดย VH-0005', code: 409 },
      { row: 88, issue: 'ฟิลด์บังคับว่าง', detail: 'fuelType', code: 400 },
    ],
  },
  result: { success: 124, skipped: 2, failed: 2, durationMs: 3200 },
};

export const fixtureHome = {
  greeting: 'สวัสดีตอนเช้า',
  pendingCount: 5,
  recentRecords: [
    { id: 'rec_vh1', entity: 'vehicle', label: 'VH-0001 · กข 1234', at: now },
    { id: 'rec_d1', entity: 'driver', label: 'DR-0001 · สมชาย ใจดี', at: now },
    { id: 'rec_mt2', entity: 'maintenance', label: 'MT-0002 · VH-0006', at: now },
  ],
  pending: [
    { id: 'p1', kind: 'maintenance', label: 'MT-0002 ซ่อมเบรกหน้า VH-0006', at: now },
    { id: 'p2', kind: 'approval', label: 'อนุมัติค่าใช้จ่าย MT-0004 (52,000 บาท)', at: now },
    { id: 'p3', kind: 'import', label: 'นำเข้า CSV คนขับมี 2 แถวล้มเหลว', at: now },
    { id: 'p4', kind: 'insurance', label: 'ประกัน VH-0001 หมดอายุใน 30 วัน', at: now },
    { id: 'p5', kind: 'review', label: 'โมดูล inventory v2.0.1 รอตรวจทาน', at: now },
  ],
  shortcuts: [
    { label: 'เพิ่มยานพาหนะ', icon: 'i-lucide-plus', to: '/m/vehicle/vehicle/new' },
    { label: 'นำเข้า CSV', icon: 'i-lucide-upload', to: '/m/vehicle/vehicle/import' },
    { label: 'เปิด Builder', icon: 'i-lucide-hammer', to: '/builder/modules' },
    { label: 'แดชบอร์ด', icon: 'i-lucide-layout-dashboard', to: '/dashboards/dash_vehicle' },
  ],
};

export const fixtureCommandPalette = {
  commands: [
    { id: 'cmd_new_vehicle', label: 'สร้างยานพาหนะ', shortcut: 'N then V', run: '/m/vehicle/vehicle/new' },
    { id: 'cmd_toggle_theme', label: 'สลับธีม', shortcut: 'Ctrl Shift L' },
    { id: 'cmd_go_records', label: 'ไปยังเรคคอร์ด', shortcut: 'Ctrl K' },
  ],
  records: [
    { id: 'rec_vh1', module: 'vehicle', entity: 'vehicle', label: 'VH-0001 · กข 1234', to: '/m/vehicle/vehicle/rec_vh1' },
    { id: 'rec_d1', module: 'vehicle', entity: 'driver', label: 'DR-0001 · สมชาย ใจดี', to: '/m/vehicle/driver/rec_d1' },
  ],
};

export const fixtureSettings = {
  language: 'th',
  calendar: 'buddhist',
  numberFormat: 'th-TH',
  theme: 'system',
  displayName: 'Somchai J.',
  email: 'somchai@loghoizon.local',
  defaultOrg: 'Loghoizon',
  formDensity: 'comfortable',
  compactTable: false,
};

export const fixtureOrganization = {
  logoUrl: '',
  name: 'Loghoizon',
  slug: 'loghoizon',
  defaultLanguage: 'th',
  timezone: 'Asia/Bangkok',
  dateFormat: 'buddhist',
  currency: 'THB',
  quota: { members: { used: 24, limit: 50 }, modules: { used: 6, limit: 20 }, records: { used: 18200, limit: 100000 } },
};

export const fixtureRoles = [
  { id: 'owner', name: 'owner', count: 1, description: 'สิทธิ์ทั้งหมด' },
  { id: 'admin', name: 'admin', count: 3, description: 'จัดการองค์กรและโมดูล' },
  { id: 'member', name: 'member', count: 18, description: 'ใช้งานทั่วไป' },
  { id: 'viewer', name: 'viewer', count: 2, description: 'อ่านอย่างเดียว' },
];

export const fixtureMembers = [
  { id: 'u1', name: 'Somchai J.', email: 'somchai@loghoizon.local', role: 'owner', status: 'active', modules: 'ทั้งหมด', lastActive: now },
  { id: 'u2', name: 'Nattapong P.', email: 'nattapong@loghoizon.local', role: 'admin', status: 'active', modules: 'vehicle, inventory', lastActive: now },
  { id: 'u3', name: 'Manee S.', email: 'manee@loghoizon.local', role: 'member', status: 'active', modules: 'vehicle', lastActive: now },
  { id: 'u4', name: 'Pongsak R.', email: 'pongsak@loghoizon.local', role: 'viewer', status: 'invited', modules: '—', lastActive: '' },
];

export const fixtureInvitations = [
  { id: 'inv1', email: 'newuser@loghoizon.co.th', role: 'member', expiresIn: '6 วัน' },
  { id: 'inv2', email: 'guest@yic.example.com', role: 'viewer', expiresIn: '3 วัน' },
  { id: 'inv3', email: 'ops@loghoizon.co.th', role: 'admin', expiresIn: '5 วัน' },
];

export const fixtureUser = {
  id: 'u_01hzdemo0000000000000001',
  name: 'Somchai J.',
  email: 'somchai@loghoizon.local',
  initials: 'SJ',
  role: 'admin',
  organization: 'Loghoizon',
};

export const fixtureFieldPickerTypes = [
  ...vehicleFields.map((f) => ({ type: f.logicalType, label: f.label })),
];
