import type { NxMetaDetailActivity } from '@nexa/ui';

/** The kind the renderer's marker draws. */
export type ActivityKind = NonNullable<NxMetaDetailActivity['kind']>;

/** What the trail shows for one audit entry, before the labels and the date are applied. */
export interface RawActivityEntry {
  id: string;
  action: string;
  actorName: string;
  occurredAt: string;
}

/** The labels the record page shows for the actions the server records, with the marker's kind. */
const activityLabels: Record<string, { label: string; kind: ActivityKind }> = {
  'record.created': { label: 'สร้างรายการ', kind: 'create' },
  'record.updated': { label: 'แก้ไขรายการ', kind: 'update' },
  'record.deleted': { label: 'ลบรายการ', kind: 'status' },
};

/** The trail's label in Thai; an action the server records outside the three above stays as it came. */
export function activityLabel(action: string): string {
  return activityLabels[action]?.label ?? action;
}

/** The icon the trail's marker draws. There is no delete marker in the renderer's contract, so a deletion takes the status one. */
export function activityKind(action: string): ActivityKind | undefined {
  return activityLabels[action]?.kind;
}

/**
 * The instant an audit entry happened, as the long Thai date with the short time — the Buddhist
 * era `th-TH` resolves on its own, the way the library's own date display does. A value the
 * formatter cannot read is shown as it came, rather than hidden.
 */
export function formatOccurredAt(value: string): string {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return value;
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeStyle: 'short' }).format(instant);
}

/** Maps one server audit entry onto what `NxMetaDetail` shows. */
export function formatActivity(entry: RawActivityEntry): NxMetaDetailActivity {
  return { id: entry.id, actor: entry.actorName, action: activityLabel(entry.action), time: formatOccurredAt(entry.occurredAt), kind: activityKind(entry.action) };
}
