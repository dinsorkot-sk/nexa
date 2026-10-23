import { afterEach, describe, expect, it, vi } from 'vitest';

import { activityKind, activityLabel, formatActivity, formatOccurredAt } from '../app/composables/useFormat';

describe('activityLabel', () => {
  it('shows the Thai label of the actions the server records', () => {
    expect(activityLabel('record.created')).toBe('สร้างรายการ');
    expect(activityLabel('record.updated')).toBe('แก้ไขรายการ');
    expect(activityLabel('record.deleted')).toBe('ลบรายการ');
  });

  it('keeps the raw action when the server records one the labels do not know', () => {
    expect(activityLabel('workflow.transitioned')).toBe('workflow.transitioned');
  });
});

describe('activityKind', () => {
  it('names the marker the renderer draws', () => {
    expect(activityKind('record.created')).toBe('create');
    expect(activityKind('record.updated')).toBe('update');
    expect(activityKind('record.deleted')).toBe('status');
  });

  it('leaves the marker to the renderer when the action is unknown', () => {
    expect(activityKind('workflow.transitioned')).toBeUndefined();
  });
});

describe('formatOccurredAt', () => {
  it('formats the instant in the long Thai date with the short time', () => {
    const shown = formatOccurredAt('2026-10-05T00:30:00Z');
    // `th-TH` resolves the Buddhist era on its own: 2026 is พ.ศ. 2569, however the reader's
    // timezone moves the day or the clock.
    expect(shown).toContain('ตุลาคม');
    expect(shown).toContain('2569');
    expect(shown).toMatch(/เวลา \d{1,2}:\d{2}/);
  });

  it('shows the raw value when the timestamp cannot be read', () => {
    expect(formatOccurredAt('not a date')).toBe('not a date');
  });
});

describe('formatActivity', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps one audit entry onto what the detail renderer shows', () => {
    const shown = formatActivity({ id: 'a1', action: 'record.created', actorName: 'Owner', occurredAt: '2026-10-05T00:30:00Z' });
    expect(shown).toMatchObject({ id: 'a1', actor: 'Owner', action: 'สร้างรายการ', kind: 'create' });
    expect(shown.time).toContain('2569');
  });

  it('asks the renderer for no marker when the action is one it does not know', () => {
    const shown = formatActivity({ id: 'a2', action: 'record.once', actorName: 'Owner', occurredAt: '2026-10-05T00:30:00Z' });
    expect(shown).toMatchObject({ id: 'a2', actor: 'Owner', action: 'record.once', kind: undefined });
  });
});
