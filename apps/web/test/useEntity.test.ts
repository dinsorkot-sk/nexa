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

/** A one-shot fetch implementation answering the JSON body once. */
function fetchOnce(value: unknown) {
  return vi.fn(() => Promise.resolve(Response.json(value)));
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

  function recordsOf(...records: Array<ReturnType<typeof record>>) {
    return vi.fn(() => Promise.resolve(Response.json({ items: records })));
  }

  it('sends the search to the server when the target has a searchable, non-hidden field', async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json({ items: [record('c1', { name: 'Acme Co' })] })));
    fetch.mockImplementationOnce((path: string) => {
      expect(path).toBe('/v1/modules/crm/fields?entityId=contact');
      return Promise.resolve(Response.json([
        { id: 'code', entityId: 'contact', name: 'code', label: 'Code', type: 'text', position: 0, options: options({ hidden: true, searchable: true }) },
        { id: 'name', entityId: 'contact', name: 'name', label: 'Name', type: 'text', position: 1, options: options({ searchable: true }) },
      ]));
    });
    vi.stubGlobal('fetch', fetch);

    const loader = referenceLoader('crm', field);
    const narrowed = await loader('acme', { limit: 25, signal: new AbortController().signal });
    expect(narrowed).toEqual([{ value: 'c1', label: 'Acme Co' }]);
    expect(fetch).toHaveBeenCalledWith('/v1/modules/crm/entities/contact/records?limit=25&search=acme', expect.anything());
  });

  it('stays on the one-page fallback and narrows in the browser without a searchable field', async () => {
    const fetch = vi.fn()
      .mockImplementationOnce((path: string) => {
        expect(path).toBe('/v1/modules/crm/fields?entityId=contact');
        return Promise.resolve(Response.json([
          { id: 'name', entityId: 'contact', name: 'name', label: 'Name', type: 'text', position: 0, options: options({ hidden: true, searchable: true }) },
          { id: 'count', entityId: 'contact', name: 'count', label: 'Count', type: 'integer', position: 1, options: options() },
        ]));
      })
      .mockImplementationOnce(() => Promise.resolve(Response.json({ items: [
        record('c1', { name: 'Acme Co' }),
        record('c2', { name: 'Globex' }),
        record('c3', { name: 'acme group' }),
      ] })));
    vi.stubGlobal('fetch', fetch);

    const loader = referenceLoader('crm', field);
    await expect(loader('acme', { limit: 25, signal: new AbortController().signal })).resolves.toEqual([
      { value: 'c1', label: 'Acme Co' },
      { value: 'c3', label: 'acme group' },
    ]);
    expect(fetch).toHaveBeenCalledWith('/v1/modules/crm/entities/contact/records?limit=25', expect.anything());
  });

  it('reads the target fields once per loader, then searches again', async () => {
    const fields = fetchOnce([
      { id: 'name', entityId: 'contact', name: 'name', label: 'Name', type: 'text', position: 0, options: options({ searchable: true }) },
    ]);
    const fetch = vi.fn()
      .mockImplementationOnce(fields)
      .mockImplementationOnce(() => Promise.resolve(Response.json({ items: [record('c1', { name: 'Acme Co' })] })))
      .mockImplementationOnce(() => Promise.resolve(Response.json({ items: [record('c2', { name: 'Globex' })] })));
    vi.stubGlobal('fetch', fetch);

    const loader = referenceLoader('crm', field);
    await expect(loader('ac', { limit: 10, signal: new AbortController().signal })).resolves.toEqual([{ value: 'c1', label: 'Acme Co' }]);
    await expect(loader('gl', { limit: 10, signal: new AbortController().signal })).resolves.toEqual([{ value: 'c2', label: 'Globex' }]);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenLastCalledWith('/v1/modules/crm/entities/contact/records?limit=10&search=gl', expect.anything());
  });

  it('keeps the fallback when the target fields cannot be read', async () => {
    const fetch = vi.fn()
      .mockImplementationOnce(() => Promise.resolve(new Response('database is down', { status: 503 })))
      .mockImplementationOnce(() => Promise.resolve(Response.json({ items: [record('c2', { name: 'Globex' })] })));
    vi.stubGlobal('fetch', fetch);

    const loader = referenceLoader('crm', field);
    await expect(loader('gl', { limit: 10, signal: new AbortController().signal })).resolves.toEqual([{ value: 'c2', label: 'Globex' }]);
    expect(fetch).toHaveBeenCalledWith('/v1/modules/crm/entities/contact/records?limit=10', expect.anything());
  });

  it('hands the context signal to the records request', async () => {
    const fetch = vi.fn()
      .mockImplementationOnce(() => Promise.resolve(Response.json([
        { id: 'name', entityId: 'contact', name: 'name', label: 'Name', type: 'text', position: 0, options: options({ searchable: true }) },
      ])))
      .mockImplementationOnce(recordsOf(record('c1', { name: 'Acme Co' })));
    vi.stubGlobal('fetch', fetch);

    const controller = new AbortController();
    await referenceLoader('crm', field)('ac', { limit: 5, signal: controller.signal });
    expect(fetch).toHaveBeenCalledWith(
      '/v1/modules/crm/entities/contact/records?limit=5&search=ac',
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('returns nothing without hitting the network when the field points at no entity', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const orphan: FieldDefinition = { ...field, options: options({}) };
    await expect(referenceLoader('crm', orphan)('acme', { limit: 5, signal: new AbortController().signal })).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('maps the labels again when a record has no text value', async () => {
    const fields = fetchOnce([
      { id: 'name', entityId: 'contact', name: 'name', label: 'Name', type: 'text', position: 0, options: options({ searchable: true }) },
    ]);
    const fetch = vi.fn().mockImplementationOnce(fields).mockImplementationOnce(recordsOf(record('c9', { count: 7 })));
    vi.stubGlobal('fetch', fetch);
    await expect(referenceLoader('crm', field)('', { limit: 5, signal: new AbortController().signal })).resolves.toEqual([{ value: 'c9', label: 'c9' }]);
  });
});
