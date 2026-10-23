import type { FieldDefinition } from '@nexa/meta';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { recordLabel, referenceLoader } from '../app/composables/useEntity';

/** Every option a definition's options object reads with a default, so the tests type-check against the real schema. */
function options(overrides: Partial<FieldDefinition['options']> = {}): FieldDefinition['options'] {
  return { required: false, unique: false, readonly: false, hidden: false, searchable: false, sortable: true, filterable: true, indexed: false, isStatus: false, ui: {}, ...overrides };
}

function record(id: string, data: Record<string, unknown>) {
  return { id, version: 1, data };
}

function page(items: Array<{ id: string; version: number; data: Record<string, unknown> }>) {
  return vi.fn(() => Promise.resolve(Response.json({ items })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('recordLabel', () => {
  it('shows the first non-empty string value', () => {
    expect(recordLabel({ id: 'r1', data: { code: '', name: 'Acme', count: 7 } })).toBe('Acme');
  });

  it('falls back to the id when no value is a string', () => {
    expect(recordLabel({ id: 'r2', data: { count: 7, flag: true } })).toBe('r2');
    expect(recordLabel({ id: 'r3', data: {} })).toBe('r3');
  });
});

describe('referenceLoader', () => {
  const field: FieldDefinition = {
    id: 'owner',
    entityId: 'task',
    name: 'owner',
    label: 'Owner',
    type: 'reference',
    position: 0,
    options: options({ referenceEntityId: 'contact' }),
  };

  function loaderTest(search: string, limit: number) {
    const controller = new AbortController();
    return referenceLoader('crm', field)(search, { limit, signal: controller.signal });
  }

  it('fetches one page of the target entity and narrows by the label in the browser', async () => {
    const fetch = page([
      record('c1', { name: 'Acme Co' }),
      record('c2', { name: 'Globex' }),
      record('c3', { name: 'acme group' }),
      record('c4', { name: '7' }),
    ]);
    vi.stubGlobal('fetch', fetch);

    await expect(loaderTest('acme', 25)).resolves.toEqual([
      { value: 'c1', label: 'Acme Co' },
      { value: 'c3', label: 'acme group' },
    ]);
    expect(fetch).toHaveBeenCalledWith('/v1/modules/crm/entities/contact/records?limit=25', expect.anything());
  });

  it('passes the empty search through as one unfiltered page', async () => {
    const fetch = page([record('c1', { name: 'Acme Co' })]);
    vi.stubGlobal('fetch', fetch);
    await expect(loaderTest('', 10)).resolves.toEqual([{ value: 'c1', label: 'Acme Co' }]);
    expect(fetch).toHaveBeenCalledWith('/v1/modules/crm/entities/contact/records?limit=10', expect.anything());
  });

  it('returns nothing without hitting the network when the field points at no entity', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const orphan: FieldDefinition = { ...field, options: options({}) };
    await expect(referenceLoader('crm', orphan)('acme', { limit: 5, signal: new AbortController().signal })).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('maps the labels again when a record has no text value', async () => {
    const fetch = page([record('c9', { count: 7 })]);
    vi.stubGlobal('fetch', fetch);
    await expect(loaderTest('', 5)).resolves.toEqual([{ value: 'c9', label: 'c9' }]);
  });
});
