import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { EngineService } from '../src/engine/engine.service';

let app: INestApplication;
let base: URL;
let admin: number;

const request = async (method: 'GET' | 'POST', path: string, body?: unknown) => {
  const response = await fetch(new URL(path, base), {
    method,
    headers: { 'content-type': 'application/json', 'x-nexa-tenant': 'demo', 'x-nexa-uid': String(admin) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
};

beforeAll(async () => {
  vi.stubEnv('NEXA_DATA_DIR', ':memory:');
  vi.stubEnv('NEXA_TENANTS', 'demo');
  vi.stubEnv('NEXA_MODULES', 'base,sales_lite');
  vi.stubEnv('NEXA_DEV_AUTH', '1');
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  await app.listen(0, '127.0.0.1');
  base = new URL(await app.getUrl());
  const superuser = (await app.get(EngineService).tenant('demo')).env({ uid: 1 });
  [admin] = (await superuser.model('res.users').search([['login', '=', 'admin']])).ids;
}, 60_000);

afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});

describe('optional sales demonstration modules', () => {
  it('installs contacts and sales data for the generic model and metadata APIs', async () => {
    const contacts = await request('POST', '/api/model/res.partner/search_read', { fields: ['name', 'email'] });
    expect(contacts.status).toBe(200);
    expect(contacts.body.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Nexa Systems', email: 'hello@nexa.example' }),
      expect.objectContaining({ name: 'Mali Chaiyaporn' }),
    ]));

    const orders = await request('POST', '/api/model/sale.order/search_read', { fields: ['name', 'partner_id', 'state', 'amount_total'] });
    expect(orders.status).toBe(200);
    expect(orders.body.records).toEqual([expect.objectContaining({ name: 'SO0001', state: 'sale', amount_total: 125000 })]);

    const created = await request('POST', '/api/model/sale.order/create', {
      values: { name: 'SO0002', partner_id: (contacts.body.records as { id: number; name: string }[]).find((r) => r.name === 'Mali Chaiyaporn')?.id },
    });
    expect(created.status).toBe(200);
    const [id] = created.body.ids as number[];
    const line = await request('POST', '/api/model/sale.order.line/create', {
      values: { order_id: id, name: 'Training', quantity: 2, unit_price: 250 },
    });
    expect(line.status).toBe(200);
    const total = await request('POST', '/api/model/sale.order/read', { ids: [id], fields: ['amount_total'] });
    expect(total.body.records).toEqual([{ id, amount_total: 500 }]);
    const written = await request('POST', '/api/model/sale.order/write', { ids: [id], values: { state: 'sent' } });
    expect(written.status).toBe(200);

    const view = await request('GET', '/api/ui/view/sale.order/form');
    expect(view.status).toBe(200);
    expect((view.body.fields as Record<string, unknown>).partner_id).toBeDefined();
    const menus = await request('GET', '/api/ui/menus');
    expect(menus.status).toBe(200);
    expect(JSON.stringify(menus.body)).toContain('Sales');
  });
});
