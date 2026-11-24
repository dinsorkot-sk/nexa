import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { errorResponseSchema, TENANT_HEADER, UID_HEADER } from '@nexa/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { EngineService } from '../src/engine/engine.service';

let app: INestApplication;
let base: URL;
let admin: number;
let bob: number;

const call = async (method: 'GET' | 'POST', path: string, uid: number | null, body?: unknown, tenant = 't1') => {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (uid !== null) {
    headers[TENANT_HEADER] = tenant;
    headers[UID_HEADER] = String(uid);
  }
  const res = await fetch(new URL(path, base), { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const post = (path: string, uid: number | null, body: unknown = {}, tenant?: string) => call('POST', path, uid, body, tenant);
const errorType = (b: Record<string, unknown>) => errorResponseSchema.parse(b).error.type;

beforeAll(async () => {
  vi.stubEnv('NEXA_DATA_DIR', ':memory:');
  vi.stubEnv('NEXA_TENANTS', 't1');
  vi.stubEnv('NEXA_MODULES', 'base');
  vi.stubEnv('NEXA_DEV_AUTH', '1');
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  await app.listen(0, '127.0.0.1');
  base = new URL(await app.getUrl());
  const su = (await app.get(EngineService).tenant('t1')).env({ uid: 1 });
  [admin] = (await su.model('res.users').search([['login', '=', 'admin']])).ids;
}, 60_000);

afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});

describe('authentication (development headers)', () => {
  it('rejects missing headers, the superuser id, unknown users and unknown tenants', async () => {
    expect((await post('/api/model/res.users/search_read', null)).status).toBe(401);
    expect((await post('/api/model/res.users/search_read', 1)).status).toBe(403);
    expect((await post('/api/model/res.users/search_read', 99_999)).status).toBe(403);
    const other = await post('/api/model/res.users/search_read', admin, {}, 'nope');
    expect(other.status).toBe(403);
    expect(errorType(other.body)).toBe('access');
  });
});

describe('model RPC', () => {
  it('admin manages users; data comes back with length for paging', async () => {
    const groups = await post('/api/model/res.groups/search_read', admin, { domain: [['code', '=', 'base.group_user']], fields: ['code'] });
    expect(groups.status).toBe(200);
    const gid = (groups.body.records as { id: number }[])[0].id;
    const company = (await post('/api/model/res.company/search_read', admin, { fields: ['name'] })).body.records as { id: number }[];
    const created = await post('/api/model/res.users/create', admin, {
      values: { name: 'Bob', login: 'bob', company_id: company[0].id, group_ids: [gid] },
    });
    expect(created.status).toBe(200);
    [bob] = created.body.ids as number[];
    const page = await post('/api/model/res.users/search_read', admin, { fields: ['login'], limit: 1, order: 'login asc' });
    expect(page.body).toMatchObject({ records: [{ login: 'admin' }], length: 2 });
  });

  it('enforces engine access for normal users', async () => {
    const denied = await post('/api/model/res.company/create', bob, { values: { name: 'X' } });
    expect(denied.status).toBe(403);
    expect(errorType(denied.body)).toBe('access');
    const esc = await post('/api/model/res.users/write', bob, { ids: [bob], values: { group_ids: [1] } });
    expect(esc.status).toBe(403);
    expect((await post('/api/model/res.users/write', bob, { ids: [bob], values: { name: 'Bobby' } })).status).toBe(200);
    expect((await post('/api/model/res.users/write', bob, { ids: [admin], values: { name: 'x' } })).status).toBe(403);
  });

  it('review regressions: self-write limits, prototype methods, internal tables, error text, bounds', async () => {
    const login = await post('/api/model/res.users/write', bob, { ids: [bob], values: { login: 'admin2' } });
    expect([login.status, errorType(login.body)]).toEqual([403, 'access']);
    expect((await post('/api/model/res.users/write', bob, { ids: [bob], values: { active: false } })).status).toBe(403);
    const view = await call('GET', '/api/ui/view/res.users/form', bob);
    expect((view.body.fields as Record<string, { readonly: boolean }>).login.readonly).toBe(true);
    for (const m of ['constructor', 'toString', 'hasOwnProperty']) {
      expect((await post(`/api/model/res.users/call/${m}`, admin, {})).status).toBe(400);
    }
    expect((await post('/api/model/nx_access/search_read', admin, {})).status).toBe(400);
    expect((await post('/api/model/nx_rule/search_read', admin, {})).status).toBe(400);
    const dup = await post('/api/model/res.users/write', admin, { ids: [bob], values: { login: 'admin' } });
    expect(dup.status).toBe(422);
    expect(errorResponseSchema.parse(dup.body).error.message).toBe('Duplicate value for a unique field (login)');
    const big = await post('/api/model/res.users/search_read', admin, { domain: [['id', 'in', Array.from({ length: 5000 }, (_, i) => i + 1)]] });
    expect(big.status).toBe(400);
    expect((await post('/api/model/res.users/search_read', admin, { offset: 10_000_000 })).status).toBe(400);
  });

  it('maps validation, missing records, malformed requests and unknown methods', async () => {
    const v = await post('/api/model/res.company/create', admin, { values: { name: '' } });
    expect([v.status, errorType(v.body)]).toEqual([422, 'validation']);
    const m = await post('/api/model/res.company/read', admin, { ids: [987_654] });
    expect([m.status, errorType(m.body)]).toEqual([404, 'missing']);
    const b = await post('/api/model/res.company/search_read', admin, { limit: 5000 });
    expect([b.status, errorType(b.body)]).toEqual([400, 'bad_request']);
    const d = await post('/api/model/res.company/search_read', admin, { domain: [['id', '>', 0], '!'] });
    expect(d.status).toBe(400);
    expect((await post('/api/model/res.company/call/drop_everything', admin, {})).status).toBe(400);
    expect((await post('/api/model/no.such/search_read', admin, {})).status).toBe(400);
  });

  it('write, onchange and unlink round-trip', async () => {
    const [cid] = (await post('/api/model/res.company/create', admin, { values: { name: 'Branch' } })).body.ids as number[];
    expect((await post('/api/model/res.company/write', admin, { ids: [cid], values: { name: 'Branch 2' } })).status).toBe(200);
    expect((await post('/api/model/res.company/read', admin, { ids: [cid], fields: ['name'] })).body.records).toEqual([{ id: cid, name: 'Branch 2' }]);
    expect((await post('/api/model/res.company/onchange', admin, { values: { name: 'a' }, field: 'name' })).body).toEqual({ value: {} });
    expect((await post('/api/model/res.company/unlink', admin, { ids: [cid] })).status).toBe(200);
    expect((await post('/api/model/res.company/search_count', admin, { domain: [['id', '=', cid]] })).body).toEqual({ count: 0 });
  });

  it('serves ORM metadata, context defaults, display names, grouped reads and copies', async () => {
    const defaults = await post('/api/model/res.company/default_get', admin, {
      fields: ['name'], context: { defaults: { name: 'Team T16' } },
    });
    expect(defaults).toEqual({ status: 200, body: { values: { name: 'Team T16' } } });
    const created = await post('/api/model/res.company/create', admin, {
      values: {}, context: { defaults: { name: 'Team T16' } },
    });
    expect(created.status).toBe(200);
    const [id] = created.body.ids as number[];
    const copied = await post('/api/model/res.company/copy', admin, { id, defaults: { name: 'Team T16 Copy' } });
    expect(copied.status).toBe(200);
    const [copyId] = copied.body.ids as number[];
    expect(copyId).not.toBe(id);
    expect(await post('/api/model/res.company/name_search', admin, { name: 'Team T16' })).toMatchObject({
      status: 200, body: { records: expect.arrayContaining([
        { id, display_name: 'Team T16' }, { id: copyId, display_name: 'Team T16 Copy' },
      ]) },
    });
    expect(await post('/api/model/res.company/read_group', admin, {
      groupBy: ['name'], domain: [['id', 'in', [id, copyId]]], aggregates: [{ field: 'id', op: 'count' }],
    })).toMatchObject({
      status: 200, body: { groups: expect.arrayContaining([
        { name: 'Team T16', __count: 1, id_count: 1 }, { name: 'Team T16 Copy', __count: 1, id_count: 1 },
      ]) },
    });
    expect(await post('/api/model/res.company/read_group', admin, {
      domain: [['id', 'in', [id, copyId]]],
    })).toEqual({ status: 200, body: { groups: [{ __count: 2 }] } });
    const metadata = await post('/api/model/res.users/fields_get', bob, { fields: ['name', 'group_ids'] });
    expect(metadata).toMatchObject({ status: 200, body: { fields: { name: { type: 'char' } } } });
    expect(metadata.body.fields).not.toHaveProperty('group_ids');
    expect((await post('/api/model/res.company/read_group', admin, {
      aggregates: [{ field: 'id', op: 'median' }],
    })).status).toBe(400);
    expect((await post('/api/model/res.company/default_get', admin, {
      fields: ['name'], context: { uid: 1 },
    })).status).toBe(400);
    expect((await post('/api/model/res.company/copy', bob, { id })).status).toBe(403);
    expect((await post('/api/model/res.users/read_group', bob, {
      aggregates: [{ field: 'group_ids', op: 'count' }],
    })).status).toBe(403);
  });

  it('keeps archived rows out of search and count unless requested', async () => {
    expect((await post('/api/model/res.users/write', admin, { ids: [bob], values: { active: false } })).status).toBe(200);
    try {
      const query = { domain: [['id', '=', bob]], fields: ['display_name'] };
      expect(await post('/api/model/res.users/search_read', admin, query)).toEqual({
        status: 200, body: { records: [], length: 0 },
      });
      expect(await post('/api/model/res.users/search_read', admin, { ...query, context: { activeTest: false } })).toEqual({
        status: 200, body: { records: [{ id: bob, display_name: 'Bobby' }], length: 1 },
      });
      expect(await post('/api/model/res.users/read', admin, { ids: [bob], fields: ['active'] })).toEqual({
        status: 200, body: { records: [{ id: bob, active: false }] },
      });
      expect((await post('/api/model/res.users/search_count', admin, { domain: [['id', '=', bob], '!'] })).status).toBe(400);
    } finally {
      expect((await post('/api/model/res.users/write', admin, { ids: [bob], values: { active: true } })).status).toBe(200);
    }
  });
});

describe('UI metadata', () => {
  it('serves per-user menus and generated views', async () => {
    const adminMenus = await call('GET', '/api/ui/menus', admin);
    expect(adminMenus.status).toBe(200);
    const tree = (adminMenus.body.menus as { name: string; children: { name: string }[] }[]).map((m) => [m.name, m.children.map((c) => c.name)]);
    expect(tree).toEqual([['Settings', ['Users', 'Groups', 'Companies']]]);
    expect((await call('GET', '/api/ui/menus', bob)).body.menus).toEqual([]); // Settings is for base.group_system
    const view = await call('GET', '/api/ui/view/res.users/form', bob);
    expect(view.status).toBe(200);
    expect(Object.keys(view.body.fields as object)).not.toContain('group_ids'); // restricted field hidden
    expect((await call('GET', '/api/ui/view/res.users/nonsense', admin)).status).toBe(400);
  });
});

describe('no-code Studio', () => {
  it('limits Studio to Settings admins and creates a model, field, and view usable by the generic API', async () => {
    const denied = await call('GET', '/api/studio/models', bob);
    expect([denied.status, errorType(denied.body)]).toEqual([403, 'access']);

    const created = await post('/api/studio/model', admin, { name: 'x_studio_task', description: 'Tasks' });
    expect(created.status).toBe(200);
    expect(await post('/api/studio/field', admin, {
      model: 'x_studio_task', name: 'x_title', type: 'char', label: 'Title', translate: true,
    })).toMatchObject({ status: 200, body: { field: 'x_title' } });
    expect(await post('/api/studio/field', admin, {
      model: 'x_studio_task', name: 'x_cost', type: 'float', digits: [9, 2], copy: false, aggregator: 'sum',
    })).toMatchObject({ status: 200 });
    const studioModels = await call('GET', '/api/studio/models', admin);
    expect(studioModels.body.models).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'x_studio_task',
        fields: expect.arrayContaining([
          expect.objectContaining({ name: 'x_cost', digits: [9, 2], copy: false, aggregator: 'sum' }),
        ]),
      }),
    ]));
    const view = await post('/api/studio/view', admin, {
      model: 'x_studio_task', name: 'x_task_list', type: 'list',
      arch: { tag: 'list', children: [{ tag: 'field', attrs: { name: 'x_title' } }] },
    });
    expect(view).toMatchObject({ status: 200, body: { xmlId: 'studio.x_task_list' } });
    const duplicate = await post('/api/studio/view', admin, {
      model: 'x_studio_task', name: 'x_second_list', type: 'list',
      arch: { tag: 'list', children: [{ tag: 'field', attrs: { name: 'x_title' } }] },
    });
    expect([duplicate.status, errorType(duplicate.body)]).toEqual([422, 'validation']);
    const generated = await call('GET', '/api/ui/view/x_studio_task/list', admin);
    expect(generated.body).toMatchObject({ xmlId: 'studio.x_task_list' });
    const [id] = (await post('/api/model/x_studio_task/create', admin, { values: { x_title: 'Draft' } })).body.ids as number[];
    expect(await post('/api/model/x_studio_task/write', admin, {
      ids: [id], values: { x_title: 'ร่าง' }, context: { lang: 'th_TH' },
    })).toEqual({ status: 200, body: { ok: true } });
    expect(await post('/api/model/x_studio_task/read', admin, {
      ids: [id], fields: ['x_title'], context: { lang: 'th_TH' },
    })).toEqual({ status: 200, body: { records: [{ id, x_title: 'ร่าง' }] } });
    expect((await post('/api/model/x_studio_task/read', admin, { ids: [id], fields: ['x_title'] })).body.records)
      .toEqual([{ id, x_title: 'Draft' }]);
    expect((await post('/api/model/x_studio_task/read', admin, {
      ids: [id], fields: ['x_title'], context: { lang: 'a'.repeat(33) },
    })).status).toBe(400);
  });

  it('rejects malformed Studio views without storing them and checks tenant access', async () => {
    const invalid = await post('/api/studio/view', admin, {
      model: 'x_studio_task', name: 'x_invalid', type: 'list',
      arch: { tag: 'list', children: [{ tag: 'field', attrs: { name: 'missing' } }] },
    });
    expect([invalid.status, errorType(invalid.body)]).toEqual([422, 'validation']);
    const unchanged = await call('GET', '/api/ui/view/x_studio_task/list', admin);
    expect(unchanged.body).toMatchObject({ xmlId: 'studio.x_task_list' });
    expect(await post('/api/studio/model', admin, { name: 'x_other' }, 'unknown')).toMatchObject({ status: 403 });
  });
});
