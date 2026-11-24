import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EngineError, MissingRecordError, PgliteTenantManager, ValidationError, compileDomain, resolveModels,
  type Domain, type Env, type ModelDef,
} from '../src/index.js';

const models: ModelDef[] = [
  {
    name: 'res.country', origin: 'module', order: 'code asc',
    fields: { name: { type: 'char', required: true }, code: { type: 'char', unique: true } },
  },
  {
    name: 'res.partner', origin: 'module',
    fields: {
      name: { type: 'char', required: true },
      active: { type: 'boolean', default: true },
      credit_limit: { type: 'monetary' },
      kind: { type: 'selection', selection: [['person', 'Person'], ['company', 'Company']], default: 'person' },
      country_id: { type: 'many2one', comodel: 'res.country', ondelete: 'restrict' },
      tags: { type: 'json' },
    },
    methods: { greet: async (rs) => (await rs.read(['name'])).map((r) => `hi ${r.name}`) },
  },
  // extension from another "module" (Odoo _inherit same name)
  { name: 'res.partner', extends: ['res.partner'], origin: 'module', fields: { vat: { type: 'char' } } },
];

let mgr: PgliteTenantManager;
let env: Env;

beforeAll(async () => {
  mgr = new PgliteTenantManager({ models: async () => models });
  env = (await mgr.open('acme')).env({ uid: 1 });
}, 60_000);

afterAll(() => mgr.closeAll());

describe('registry', () => {
  it('merges extensions and adds magic fields', () => {
    const m = resolveModels(models).get('res.partner')!;
    expect([...m.fields.keys()]).toEqual(expect.arrayContaining(['id', 'create_date', 'name', 'vat']));
    expect(m.table).toBe('res_partner');
  });

  it('rejects duplicate definitions and unknown comodels', () => {
    expect(() => resolveModels([models[0], models[0]])).toThrow(EngineError);
    expect(() => resolveModels([{ name: 'a.b', origin: 'module', fields: { x: { type: 'many2one', comodel: 'nope' } } }]))
      .toThrow(/unknown model/);
  });
});

describe('domain compiler', () => {
  const all = resolveModels(models);
  const reg = { models: all, get: (n: string) => all.get(n)!, reload: async () => undefined };
  const m = all.get('res.partner')!;
  it('compiles polish notation with parameters', () => {
    const params: unknown[] = [];
    const sql = compileDomain(reg, m, ['|', ['name', 'ilike', "o'k%"], '!', ['kind', 'in', ['company']]], params);
    expect(sql).toBe('(t."name"::text ILIKE $1 OR (NOT COALESCE((t."kind" = ANY($2)), FALSE)))');
    expect(params).toEqual(["%o'k\\%%", ['company']]);
  });
  it('rejects unknown fields (no injection through identifiers)', () => {
    expect(() => compileDomain(reg, m, [['name"; drop', '=', 1]], [])).toThrow(/Unknown field/);
  });
});

describe('recordset CRUD on PGlite', () => {
  it('creates, reads, searches, writes, unlinks', async () => {
    const th = await env.model('res.country').create({ name: 'Thailand', code: 'TH' });
    const p = await env.model('res.partner').create([
      { name: 'Somchai', country_id: th.ids[0], credit_limit: 1500.5, tags: { vip: true } },
      { name: 'Acme Co', kind: 'company', vat: '0105' },
    ]);
    expect(p.ids).toHaveLength(2);

    const [a] = await p.browse(p.ids[0]).read();
    expect(a).toMatchObject({ name: 'Somchai', active: true, kind: 'person', country_id: th.ids[0], credit_limit: 1500.5, tags: { vip: true } });
    expect(a.create_uid).toBe(1);

    const companies = await env.model('res.partner').searchRead([['kind', '=', 'company']], ['name', 'vat']);
    expect(companies).toEqual([{ id: p.ids[1], name: 'Acme Co', vat: '0105' }]);
    expect(await env.model('res.partner').searchCount([['country_id', '=', false]])).toBe(1);

    await p.browse(p.ids[0]).write({ name: 'Somchai J.' });
    expect((await p.browse(p.ids[0]).read(['name']))[0].name).toBe('Somchai J.');

    expect(await p.browse(p.ids[0]).call('greet')).toEqual(['hi Somchai J.']);

    await p.unlink();
    expect(await env.model('res.partner').searchCount([])).toBe(0);
  });

  it('validates input', async () => {
    const partner = env.model('res.partner');
    await expect(partner.create({})).rejects.toThrow(ValidationError);
    await expect(partner.create({ name: 'x', kind: 'alien' })).rejects.toThrow(/selection/);
    await expect(partner.create({ name: 'x', nope: 1 })).rejects.toThrow(/Unknown field/);
    await expect(partner.create({ name: 'x', id: 5 })).rejects.toThrow(/managed by the engine/);
    await expect(partner.browse(999_999).read()).rejects.toThrow(MissingRecordError);
    await expect(partner.search([], { order: 'name; drop table x' })).rejects.toThrow(/Invalid order/);
  });

  it('rolls back a failed transaction', async () => {
    await expect(env.transaction(async (tx) => {
      await tx.model('res.partner').create({ name: 'ghost' });
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(await env.model('res.partner').searchCount([['name', '=', 'ghost']])).toBe(0);
  });

  it('batch create is atomic', async () => {
    await expect(env.model('res.partner').create([{ name: 'ok' }, { name: '' }])).rejects.toThrow(ValidationError);
    expect(await env.model('res.partner').searchCount([['name', '=', 'ok']])).toBe(0);
  });

  it('enforces ondelete restrict at the database', async () => {
    const c = await env.model('res.country').create({ name: 'Japan', code: 'JP' });
    await env.model('res.partner').create({ name: 'Taro', country_id: c.ids[0] });
    await expect(c.unlink()).rejects.toThrow();
  });

  it('respects order, limit and offset', async () => {
    await env.model('res.country').create([{ name: 'Laos', code: 'LA' }, { name: 'Cambodia', code: 'KH' }]);
    const rows = await env.model('res.country').searchRead([], ['code'], { limit: 2, offset: 1 });
    expect(rows.map((r) => r.code)).toEqual(['KH', 'LA']);
  });

  it('nested transaction rolls back only its own writes (savepoint)', async () => {
    await env.transaction(async (tx) => {
      await tx.model('res.partner').create({ name: 'outer-kept' });
      await expect(tx.transaction(async (inner) => {
        await inner.model('res.partner').create({ name: 'inner-lost' });
        throw new Error('inner');
      })).rejects.toThrow('inner');
    });
    expect(await env.model('res.partner').searchCount([['name', '=', 'outer-kept']])).toBe(1);
    expect(await env.model('res.partner').searchCount([['name', '=', 'inner-lost']])).toBe(0);
  });

  it('concurrent sibling nested transactions roll back independently', async () => {
    await env.transaction(async (tx) => {
      await Promise.allSettled([
        tx.transaction(async (a) => {
          await a.model('res.partner').create({ name: 'sib-a' });
          throw new Error('a fails');
        }),
        tx.transaction(async (b) => {
          await b.model('res.partner').create({ name: 'sib-b' });
        }),
      ]);
    });
    expect(await env.model('res.partner').searchCount([['name', '=', 'sib-a']])).toBe(0);
    expect(await env.model('res.partner').searchCount([['name', '=', 'sib-b']])).toBe(1);
  });

  it('outer env used inside a transaction joins it (no deadlock) and rolls back', async () => {
    await expect(env.transaction(async () => {
      await env.model('res.partner').create({ name: 'via-outer' });
      throw new Error('stop');
    })).rejects.toThrow('stop');
    expect(await env.model('res.partner').searchCount([['name', '=', 'via-outer']])).toBe(0);
  });

  it('write failure inside a caught nested tx leaves no partial update', async () => {
    const [p] = (await env.model('res.partner').create({ name: 'keep-me' })).ids;
    await env.transaction(async (tx) => {
      await tx.model('res.partner').browse([p, 987_654]).write({ name: 'changed' }).catch(() => undefined);
    });
    expect((await env.model('res.partner').browse(p).read(['name']))[0].name).toBe('keep-me');
  });

  it('unlink invalidates rows changed by FK cascade/set null', async () => {
    const c = await env.model('res.country').create({ name: 'Vietnam', code: 'VN' });
    const p = await env.model('res.partner').create({ name: 'Linh', country_id: c.ids[0] });
    await env.model('res.partner').browse(p.ids[0]).read(['country_id']); // warm cache
    await env.model('res.partner').browse(p.ids[0]).unlink();
    await c.unlink();
    await expect(env.model('res.partner').browse(p.ids[0]).read()).rejects.toThrow(MissingRecordError);
  });

  it('applies Odoo NULL semantics in domains', async () => {
    await env.model('res.partner').create([
      { name: 'n-null', kind: 'person' },
      { name: 'n-vat', vat: 'X1' },
    ]);
    // boolean false matches NULL
    await env.model('res.partner').create({ name: 'n-flag', active: false });
    const names = async (d: Domain, activeTest = false) =>
      (await env.withContext({ activeTest }).model('res.partner').searchRead(d, ['name']))
        .map((r) => r.name).filter((n) => String(n).startsWith('n-'));
    expect(await names([['vat', 'not in', ['X1']]])).toEqual(['n-null', 'n-flag']);
    expect(await names([['vat', 'not ilike', 'x']])).toEqual(['n-null', 'n-flag']);
    expect(await names([['vat', 'in', ['X1', false]]])).toEqual(['n-null', 'n-vat', 'n-flag']);
    expect(await names([['active', '=', false]], true)).toEqual(['n-flag']);
    expect(await names([['active', '!=', false]], true)).toEqual(['n-null', 'n-vat']);
    await expect(env.model('res.partner').search([['credit_limit', '>', false]])).rejects.toThrow(/needs a value/);
  });

  it('rejects unsafe table and tenant names', async () => {
    expect(() => resolveModels([{ name: 'x.y', table: 'x"; drop', origin: 'module', fields: {} }])).toThrow(/table name/);
    await expect(mgr.open('con')).rejects.toThrow(/Invalid tenant/);
  });

  it('isolates tenants', async () => {
    const other = (await mgr.open('globex')).env({ uid: 1 });
    expect(await other.model('res.country').searchCount([])).toBe(0);
    await expect(mgr.open('../evil')).rejects.toThrow(/Invalid tenant/);
  });
});
