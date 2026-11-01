export interface AuditEntry {
  id: string;
  tenantId: string;
  entity: string;
  recordId: string;
  action: 'create' | 'update' | 'delete';
  userId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

/** Group audit entries by record for a timeline view. */
export function groupAuditByRecord(entries: AuditEntry[]): Map<string, AuditEntry[]> {
  const map = new Map<string, AuditEntry[]>();
  for (const e of entries) {
    const key = `${e.entity}:${e.recordId}`;
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }
  return map;
}

/** Filter audit entries by action. */
export function filterAuditByAction(entries: AuditEntry[], action: AuditEntry['action']): AuditEntry[] {
  return entries.filter((e) => e.action === action);
}