/**
 * Shared fixture for the mockup stories. Everything here is fabricated sample data
 * for visual review only — no real user, tenant, or record data. The mockups exercise
 * the real `@nexa/ui` primitives and metadata renderers so reviewers see exactly what
 * the rebuilt web app will render.
 */
import type { FieldDefinition, FormDefinition } from '@nexa/meta';
import type { MetaTablePage, MetaTableRow, MetaTableSort } from '../components/table';

/** Builds a stored field definition the way the API returns it. */
export function field(
  id: string,
  name: string,
  label: string,
  type: FieldDefinition['type'],
  options: Partial<FieldDefinition['options']> = {},
  position = 0,
  entityId = 'vehicle',
): FieldDefinition {
  return {
    id,
    entityId,
    name,
    label,
    type,
    position,
    options: {
      required: false,
      unique: false,
      readonly: false,
      hidden: false,
      searchable: false,
      sortable: true,
      filterable: true,
      indexed: false,
      isStatus: false,
      ui: {},
      ...options,
    },
  };
}

/** A plausible vehicle-fleet module: the same shape the inventory template ships. */
export const vehicleFields: FieldDefinition[] = [
  field('plate', 'plate', 'Plate', 'text', { required: true, unique: true, searchable: true }, 0),
  field('make', 'make', 'Make', 'text', { searchable: true }, 1),
  field('model', 'model', 'Model', 'text', {}, 2),
  field('year', 'year', 'Year', 'integer', { min: 1900, max: 2100 }, 3),
  field('status', 'status', 'Status', 'select', {
    isStatus: true,
    choices: [
      { value: 'available', label: 'Available' },
      { value: 'rented', label: 'Rented' },
      { value: 'maintenance', label: 'Maintenance' },
    ],
  }, 4),
  field('dailyRate', 'dailyRate', 'Daily rate', 'currency', {}, 5),
  field('mileage', 'mileage', 'Mileage (km)', 'integer', { min: 0 }, 6),
  field('lastService', 'lastService', 'Last service', 'date', {}, 7),
  field('active', 'active', 'Active', 'boolean', {}, 8),
];

export const vehicleForm: FormDefinition = {
  id: 'vehicle-form',
  entityId: 'vehicle',
  name: 'Vehicle',
  sections: [
    { id: 'identity', label: 'Vehicle', fieldIds: ['plate', 'make', 'model', 'year'], columns: 2, visibility: {} },
    { id: 'operations', label: 'Operations', fieldIds: ['status', 'dailyRate', 'mileage', 'lastService', 'active'], columns: 2, visibility: {} },
  ],
  settings: {},
};

export interface MockRecord {
  id: string;
  version: number;
  data: Record<string, unknown>;
}

const record = (
  id: string,
  data: Record<string, unknown>,
  version = 1,
): MockRecord => ({ id, version, data });

export const vehicleRows: MockRecord[] = [
  record('r-1001', { plate: 'กข-1234', make: 'Toyota', model: 'Altis', year: 2021, status: 'available', dailyRate: 1200, mileage: 45230, lastService: '2026-09-18', active: true }, 3),
  record('r-1002', { plate: 'กข-1001', make: 'Honda', model: 'City', year: 2020, status: 'rented', dailyRate: 1000, mileage: 88100, lastService: '2026-08-30', active: true }, 7),
  record('r-1003', { plate: 'กข-5520', make: 'Mazda', model: '2', year: 2022, status: 'maintenance', dailyRate: 1400, mileage: 21000, lastService: '2026-10-02', active: true }, 1),
  record('r-1004', { plate: 'กข-8841', make: 'Toyota', model: 'Vios', year: 2019, status: 'available', dailyRate: 900, mileage: 120450, lastService: '2026-07-11', active: false }, 12),
  record('r-1005', { plate: 'กข-2290', make: 'MG', model: 'ZS', year: 2023, status: 'rented', dailyRate: 1100, mileage: 9800, lastService: '2026-10-05', active: true }, 2),
  record('r-1006', { plate: 'กข-3007', make: 'Nissan', model: 'Almera', year: 2021, status: 'available', dailyRate: 950, mileage: 67400, lastService: '2026-09-01', active: true }, 5),
  record('r-1007', { plate: 'กข-6112', make: 'Mazda', model: '3', year: 2020, status: 'available', dailyRate: 1050, mileage: 54900, lastService: '2026-06-24', active: true }, 1),
  record('r-1008', { plate: 'กข-9455', make: 'Honda', model: 'Jazz', year: 2018, status: 'maintenance', dailyRate: 800, mileage: 153200, lastService: '2026-10-08', active: true }, 4),
  record('r-1009', { plate: 'กข-4771', make: 'Toyota', model: 'Corolla Cross', year: 2024, status: 'available', dailyRate: 1600, mileage: 3200, lastService: '2026-10-01', active: true }, 1),
  record('r-1010', { plate: 'กข-7338', make: 'Ford', model: 'Focus', year: 2017, status: 'rented', dailyRate: 750, mileage: 178900, lastService: '2026-05-19', active: false }, 9),
  record('r-1011', { plate: 'กข-1556', make: 'Mazda', model: 'CX-30', year: 2022, status: 'available', dailyRate: 1350, mileage: 30100, lastService: '2026-09-27', active: true }, 2),
  record('r-1012', { plate: 'กข-0194', make: 'Honda', model: 'HR-V', year: 2023, status: 'available', dailyRate: 1250, mileage: 18450, lastService: '2026-10-06', active: true }, 6),
];

export const firstPage: MetaTablePage = {
  items: vehicleRows.slice(0, 8),
  total: vehicleRows.length,
  limit: 25,
  offset: 0,
};

export const secondPage: MetaTablePage = {
  items: vehicleRows.slice(8),
  total: vehicleRows.length,
  limit: 25,
  offset: 8,
};

export const emptyPage: MetaTablePage = { items: [], total: 0, limit: 25, offset: 0 };

export const sampleSort: MetaTableSort = { fieldId: 'plate', direction: 'asc' };
