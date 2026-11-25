import { afterAll, describe, expect, it } from 'vitest';
import { MetadataStore, ModuleCatalog, ModuleService, baseModule, type ModuleManifest } from '../../src/index.js';
import type { PgTenantManager } from '../../src/tenant/pg.js';
import { pgManager, pgUrl, sleep, uniquePrefix } from './helpers.js';

/** Install windows [start, end] per module, recorded by the hooks of each install transaction. */
const windows = new Map<string, { start: number; end: number }>();

function slowModule(name: string): ModuleManifest {
  return {
    name, version: '1.0.0', depends: ['base'],
    models: [{ name: `${name}.item`, origin: 'module', fields: { name: { type: 'char' } } }],
    hooks: {
      preInit: async () => {
        windows.set(name, { start: Date.now(), end: Infinity });
        await sleep(300); // long enough that an unserialized second installer would overlap
      },
      postInit: async () => { windows.get(name)!.end = Date.now(); },
    },
  };
}

const catalog = () => new ModuleCatalog([baseModule, slowModule('sl_a'), slowModule('sl_b'), slowModule('sl_c')]);

describe.skipIf(!pgUrl)('real PostgreSQL: cross-process schema lock', () => {
  const managers: PgTenantManager[] = [];
  afterAll(async () => { for (const m of managers) await m.closeAll(); });

  it('serializes schema changes of two managers (processes) on one tenant', async () => {
    const prefix = uniquePrefix();
    const m1 = pgManager({ catalog: catalog(), dbPrefix: prefix });
    const m2 = pgManager({ catalog: catalog(), dbPrefix: prefix });
    managers.push(m1, m2);
    // concurrent first open (bootstrap) of a brand-new tenant database
    const [h1, h2] = await Promise.all([m1.create('shared', []), m2.create('shared', [])]);

    // different modules, plus both "processes" installing the same one
    await Promise.all([
      ModuleService.for(h1).install(['sl_a']),
      ModuleService.for(h2).install(['sl_b']),
      ModuleService.for(h2).install(['sl_c']),
      ModuleService.for(h1).install(['sl_c']),
    ]);
    const spans = ['sl_a', 'sl_b', 'sl_c'].map((n) => windows.get(n)!).sort((x, y) => x.start - y.start);
    for (let i = 1; i < spans.length; i++) expect(spans[i]!.start).toBeGreaterThanOrEqual(spans[i - 1]!.end);

    const mods = await h1.driver.query<{ name: string }>({ text: `SELECT name FROM nx_module WHERE state='installed' AND name LIKE 'sl_%' ORDER BY name`, params: [] });
    expect(mods.map((r) => r.name)).toEqual(['sl_a', 'sl_b', 'sl_c']);

    // metadata changes from both processes at once (custom models + fields), interleaved with an install check
    await Promise.all([
      MetadataStore.for(h1).createModel({ name: 'x_sl_one', fields: { x_name: { type: 'char' } } }),
      MetadataStore.for(h2).createModel({ name: 'x_sl_two', fields: { x_name: { type: 'char' } } }),
      MetadataStore.for(h1).addField('sl_a.item', 'x_note', { type: 'char' }),
      MetadataStore.for(h2).addField('sl_b.item', 'x_note', { type: 'char' }),
    ]);
    // each process sees the other's committed schema after reopening (fresh registry)
    const m3 = pgManager({ catalog: catalog(), dbPrefix: prefix });
    managers.push(m3);
    const env = (await m3.open('shared')).env({ uid: 1 });
    await env.model('x_sl_one').create({ x_name: 'a' });
    await env.model('x_sl_two').create({ x_name: 'b' });
    await env.model('sl_a.item').create({ name: 'a', x_note: 'n' });
    await env.model('sl_b.item').create({ name: 'b', x_note: 'n' });
  });
});
