/**
 * Sample data for the redesigned mockups. Shapes mirror what the real API returns
 * (ModuleDefinition, EntityDefinition, RelationDefinition, audit entries, operations stats);
 * values are fabricated. Nothing here implies a real server operation succeeded.
 *
 * Deliberately absent: entity counts on the modules list. `GET /v1/modules` returns modules only,
 * so the index must not show counts the API does not provide. Counts appear on module detail,
 * where the entities request supplies them.
 */
import type { EntityDefinition, ModuleStatus, RelationDefinition } from '@nexa/meta';

export interface SampleModule {
  id: string;
  name: string;
  description: string;
  version: string;
  status: ModuleStatus;
  updatedAt: string;
}

export const sampleModules: SampleModule[] = [
  { id: 'fleet', name: 'Fleet Management', description: 'Vehicles, maintenance schedules, and rentals.', version: '1.2.0', status: 'enabled', updatedAt: '2026-10-11T09:30:00.000Z' },
  { id: 'crm', name: 'Customer Relations', description: 'Customers, contacts, and sales activity.', version: '1.0.0', status: 'enabled', updatedAt: '2026-10-09T14:05:00.000Z' },
  { id: 'inventory', name: 'Inventory', description: 'Stock, warehouses, and stock movements.', version: '0.4.0', status: 'review', updatedAt: '2026-10-10T08:12:00.000Z' },
  { id: 'hr', name: 'People Operations', description: 'Team directory and employee lifecycle.', version: '0.1.0', status: 'draft', updatedAt: '2026-10-07T16:40:00.000Z' },
  { id: 'assets', name: 'Asset Register', description: 'Equipment ownership and service history.', version: '2.0.1', status: 'disabled', updatedAt: '2026-09-28T11:00:00.000Z' },
  { id: 'legacy', name: 'Legacy Orders', description: 'Retired order tracking kept for reference.', version: '3.1.0', status: 'archived', updatedAt: '2026-08-02T10:00:00.000Z' },
];

export const sampleEntities: Array<EntityDefinition & { fieldCount: number }> = [
  { id: 'vehicle', moduleId: 'fleet', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles', description: 'Fleet vehicles available for rental.', settings: {}, fieldCount: 9 },
  { id: 'maintenance', moduleId: 'fleet', name: 'maintenance', label: 'Maintenance', pluralLabel: 'Maintenance jobs', description: 'Service and repair history per vehicle.', settings: {}, fieldCount: 6 },
  { id: 'rental', moduleId: 'fleet', name: 'rental', label: 'Rental', pluralLabel: 'Rentals', description: 'Customer rentals and return dates.', settings: {}, fieldCount: 7 },
];

export const sampleRelations: RelationDefinition[] = [
  { id: 'vehicle-maintenance', name: 'Maintenance history', sourceEntityId: 'vehicle', targetEntityId: 'maintenance', type: 'oneToMany', onDelete: 'restrict', reverseName: 'Vehicle' },
  { id: 'vehicle-rental', name: 'Rentals', sourceEntityId: 'vehicle', targetEntityId: 'rental', type: 'oneToMany', onDelete: 'restrict', reverseName: 'Vehicle' },
];

export const relationTypeLabel: Record<RelationDefinition['type'], string> = {
  oneToOne: 'One to one',
  oneToMany: 'One to many',
  manyToOne: 'Many to one',
  manyToMany: 'Many to many',
};

/** Sample workflows for the module detail mockup. Not an API response. */
export const sampleWorkflows = [
  { id: 'wf-booking', name: 'Vehicle booking', entity: 'Vehicle', field: 'status', steps: 4 },
  { id: 'wf-service', name: 'Service approval', entity: 'Maintenance', field: 'stage', steps: 3 },
];

/** Sample automations for the module detail mockup. Not an API response. */
export const sampleAutomations = [
  { id: 'notify-service-due', name: 'Notify service due', trigger: 'Record updated', action: 'Notification', failures: 2 },
  { id: 'sync-rate-webhook', name: 'Sync daily rate', trigger: 'Workflow transition', action: 'Webhook', failures: 0 },
];

/** Shape of `GET /v1/operations/stats`. */
export const sampleStats = { modules: 6, records: 1284, auditEntries: 412, events: 96, failedAutomations: [{ automationId: 'notify-service-due', failures: 2 }] };

/** `GET /v1/audit` items, with actor names resolved the way the web app will resolve them from `/members`. */
export const sampleAudit = [
  { id: 'a1', actor: 'Nok', action: 'record.updated', entity: 'Vehicle', ref: 'กข-1234', occurredAt: '2026-10-12T08:40:00.000Z' },
  { id: 'a2', actor: 'Somchai', action: 'record.created', entity: 'Rental', ref: 'R-2041', occurredAt: '2026-10-12T07:55:00.000Z' },
  { id: 'a3', actor: 'Sakda K.', action: 'module.updated', entity: 'Inventory', ref: 'v0.4.0', occurredAt: '2026-10-11T16:20:00.000Z' },
  { id: 'a4', actor: 'Nok', action: 'record.deleted', entity: 'Maintenance', ref: 'M-0087', occurredAt: '2026-10-11T13:02:00.000Z' },
  { id: 'a5', actor: 'Somchai', action: 'record.created', entity: 'Vehicle', ref: 'กข-9001', occurredAt: '2026-10-10T10:15:00.000Z' },
];

export const sampleMembers = [
  { userId: 'u1', displayName: 'Sakda K.', email: 'sakda@example.com', roleId: 'owner' },
  { userId: 'u2', displayName: 'Nok', email: 'nok@example.com', roleId: 'admin' },
  { userId: 'u3', displayName: 'Somchai', email: 'somchai@example.com', roleId: 'member' },
  { userId: 'u4', displayName: 'Mali', email: 'mali@example.com', roleId: 'viewer' },
];

export function relativeTime(iso: string, now = '2026-10-12T09:00:00.000Z'): string {
  const minutes = Math.max(0, Math.round((Date.parse(now) - Date.parse(iso)) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / 1440)} d ago`;
}
