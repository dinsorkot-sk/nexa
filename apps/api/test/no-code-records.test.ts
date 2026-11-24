import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { activateLang, currencyRate, getMenus, type Env } from '@nexa/engine';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/engine/auth.service';
import { EngineService } from '../src/engine/engine.service';

const TENANT = 'nocode';
const adminPassword = 'nocode-admin-password-unique';
const memberPassword = 'nocode-member-password-unique';
let app: INestApplication;
let base: URL;
let engine: EngineService;
let su: Env;
let memberUid: number;
let adminUid: number;

async function post(path: string, body?: unknown, token?: string) {
  const response = await fetch(new URL(`/api/${path}`, base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const content = await response.text();
  return { status: response.status, body: content ? JSON.parse(content) as Record<string, unknown> : {} };
}

async function session(login: string, password: string): Promise<string> {
  const result = await post('auth/login', { tenant: TENANT, login, password });
  expect(result.status).toBe(200);
  return result.body.accessToken as string;
}

beforeAll(async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXA_DATA_DIR', ':memory:');
  vi.stubEnv('NEXA_TENANTS', TENANT);
  vi.stubEnv('NEXA_MODULES', 'base');
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  await app.listen(0, '127.0.0.1');
  base = new URL(await app.getUrl());
  engine = app.get(EngineService);
  const auth = app.get(AuthService);
  su = (await engine.tenant(TENANT)).env({ uid: 1 });
  const [companyId] = (await su.model('res.company').search([], { limit: 1 })).ids;
  const [groupId] = (await su.model('res.groups').search([['code', '=', 'base.group_user']])).ids;
  [memberUid] = (await su.model('res.users').create({
    name: 'No-code member', login: 'member', company_id: companyId, company_ids: [companyId], group_ids: [groupId],
  })).ids as number[];
  [adminUid] = (await su.model('res.users').search([['login', '=', 'admin']])).ids as number[];
  await auth.provisionPassword(TENANT, 'admin', adminPassword);
  await auth.provisionPassword(TENANT, 'member', memberPassword);
}, 60_000);

afterAll(async () => {
  vi.useRealTimers();
  await app?.close();
  vi.unstubAllEnvs();
});

describe('server actions, automation, buttons and crons as records via the generic API', () => {
  it('lets an admin wire an automation and a button that a normal user then triggers', async () => {
    const admin = await session('admin', adminPassword);
    const member = await session('member', memberPassword);

    const autoAction = await post('model/ir.actions.server/create', { values: {
      key: 'nc.set_city', name: 'Set city', model_name: 'res.partner', type: 'update_record',
      values_json: JSON.stringify({ city: "'Auto City'" }),
    } }, admin);
    expect(autoAction.status).toBe(200);
    expect((await post('model/ir.actions.server/create', { values: {
      key: 'nc.vip', name: 'Make VIP', model_name: 'res.partner', type: 'update_record', values_json: JSON.stringify({ vat: "name + '-VIP'" }),
    } }, admin)).status).toBe(200);
    expect((await post('model/ir.automation/create', { values: {
      key: 'nc.partner_created', model_name: 'res.partner', trigger: 'on_create', action: 'nc.set_city',
    } }, admin)).status).toBe(200);
    expect((await post('model/ir.button/create', { values: {
      name: 'VIP', model_name: 'res.partner', action: 'nc.vip', guard: "city == 'Auto City'",
    } }, admin)).status).toBe(200);
    expect((await post('model/ir.cron/create', { values: {
      key: 'nc.nightly', interval_number: 1, interval_type: 'days', action: 'nc.set_city', user_id: memberUid, active: false,
    } }, admin)).status).toBe(200);

    // invalid definitions are rejected by the service validation (422), nothing is stored
    const bad = await post('model/ir.actions.server/create', { values: {
      key: 'nc.bad', model_name: 'res.partner', type: 'update_record', values_json: JSON.stringify({ no_such_field: '1' }),
    } }, admin);
    expect(bad.status).toBe(422);

    // the normal user creates a partner: the automation runs as them
    const created = await post('model/res.partner/create', { values: { name: 'Jane' } }, member);
    expect(created.status).toBe(200);
    const [partnerId] = created.body.ids as number[];
    const read = await post('model/res.partner/read', { ids: [partnerId], fields: ['city', 'vat'] }, member);
    expect(read.body.records).toEqual([expect.objectContaining({ city: 'Auto City', vat: null })]);

    // ... and presses the guarded button
    const pressed = await post('model/res.partner/button', { ids: [partnerId], action: 'nc.vip' }, member);
    expect(pressed.status).toBe(200);
    const after = await post('model/res.partner/read', { ids: [partnerId], fields: ['vat'] }, member);
    expect((after.body.records as Record<string, unknown>[])[0]!.vat).toBe('Jane-VIP');

    // admin edits the guard through the generic API; the runtime follows
    const buttons = await post('model/ir.button/search_read', { domain: [['action', '=', 'nc.vip']], fields: ['id'] }, admin);
    const buttonId = (buttons.body.records as { id: number }[])[0]!.id;
    expect((await post('model/ir.button/write', { ids: [buttonId], values: { guard: "city == 'Elsewhere'" } }, admin)).status).toBe(200);
    expect((await post('model/res.partner/button', { ids: [partnerId], action: 'nc.vip' }, member)).status).toBe(422);
    expect((await post('model/ir.button/write', { ids: [buttonId], values: { action: 'nc.set_city' } }, admin)).status).toBe(422);
  });

  it('forbids normal users to read, create, alter or delete actions, rules, buttons and jobs', async () => {
    const member = await session('member', memberPassword);
    const admin = await session('admin', adminPassword);
    for (const model of ['ir.actions.server', 'ir.automation', 'ir.button', 'ir.cron']) {
      expect((await post(`model/${model}/search_read`, { fields: ['id'] }, member)).status).toBe(403);
    }
    expect((await post('model/ir.actions.server/create', { values: { key: 'nc.evil', type: 'script', code: 'return 1' } }, member)).status).toBe(403);
    expect((await post('model/ir.automation/create', { values: {
      key: 'nc.evil_rule', model_name: 'res.partner', trigger: 'on_create', action: 'nc.vip',
    } }, member)).status).toBe(403);
    expect((await post('model/ir.button/create', { values: { model_name: 'res.partner', method: 'unlink' } }, member)).status).toBe(403);
    expect((await post('model/ir.cron/create', { values: { key: 'nc.evil_job', interval_number: 1, interval_type: 'days' } }, member)).status).toBe(403);

    const ids = async (model: string) => ((await post(`model/${model}/search_read`, { fields: ['id'], context: { activeTest: false } }, admin)).body.records as { id: number }[]).map((r) => r.id);
    const [actionId] = await ids('ir.actions.server');
    const [ruleId] = await ids('ir.automation');
    const [buttonId] = await ids('ir.button');
    const [cronId] = await ids('ir.cron');
    expect((await post('model/ir.actions.server/write', { ids: [actionId], values: { values_json: '{"vat":"\'x\'"}' } }, member)).status).toBe(403);
    expect((await post('model/ir.automation/write', { ids: [ruleId], values: { active: false } }, member)).status).toBe(403);
    expect((await post('model/ir.button/write', { ids: [buttonId], values: { guard: 'true' } }, member)).status).toBe(403);
    expect((await post('model/ir.cron/write', { ids: [cronId], values: { active: true } }, member)).status).toBe(403);
    expect((await post('model/ir.actions.server/unlink', { ids: [actionId] }, member)).status).toBe(403);
    // a non-button action cannot be run through the button endpoint
    expect((await post('model/res.partner/button', { ids: [1], action: 'nc.set_city' }, member)).status).toBe(403);
  });

  it('shows the Technical menus for actions and buttons to system users only', async () => {
    const tenant = await engine.tenant(TENANT);
    const flatten = (menus: { xmlId?: string; xml_id?: string; children?: unknown[] }[]): string[] =>
      menus.flatMap((m) => [String(m.xmlId ?? m.xml_id), ...flatten((m.children ?? []) as never)]);
    const adminMenus = flatten(await getMenus(tenant.env({ uid: adminUid })) as never);
    expect(adminMenus).toEqual(expect.arrayContaining(['base.menu_server_actions', 'base.menu_buttons']));
    const memberMenus = flatten(await getMenus(tenant.env({ uid: memberUid })) as never);
    expect(memberMenus).not.toContain('base.menu_server_actions');
    expect(memberMenus).not.toContain('base.menu_buttons');
  });
});

describe('user language and time zone', () => {
  it('reads translated fields in the user language unless the request sets an active language', async () => {
    await activateLang(su, 'fr_FR');
    const [countryId] = (await su.model('res.country').search([['code', '=', 'BE']])).ids;
    await su.withContext({ lang: 'fr_FR' }).model('res.country').browse(countryId!).write({ name: 'Belgique' });
    await su.model('res.users').browse(memberUid).write({ lang: 'fr_FR' });
    const member = await session('member', memberPassword);
    const read = (context?: Record<string, unknown>) => post('model/res.country/read', {
      ids: [countryId], fields: ['name'], ...(context ? { context } : {}),
    }, member);
    expect(((await read()).body.records as Record<string, unknown>[])[0]!.name).toBe('Belgique');
    expect(((await read({ lang: 'en_US' })).body.records as Record<string, unknown>[])[0]!.name).toBe('Belgium');
    const inactive = await read({ lang: 'de_DE' });
    expect(inactive.status).toBe(422);
    expect(JSON.stringify(inactive.body)).toMatch(/not active/);
    const admin = await session('admin', adminPassword);
    const adminRead = await post('model/res.country/read', { ids: [countryId], fields: ['name'] }, admin);
    expect((adminRead.body.records as Record<string, unknown>[])[0]!.name).toBe('Belgium');
  });

  it('uses the user time zone for today-dependent behavior such as currency rates', async () => {
    const [eur] = (await su.model('res.currency').search([['name', '=', 'EUR'], ['active', 'in', [true, false]]])).ids;
    await su.model('res.currency.rate').create([
      { currency_id: eur, name: '2026-03-01', rate: 1.1 },
      { currency_id: eur, name: '2026-03-02', rate: 1.2 },
    ]);
    await su.model('res.users').browse(memberUid).write({ tz: 'Asia/Bangkok' });
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-03-01T20:00:00Z') }); // 2026-03-02 03:00 in Bangkok
    try {
      const memberEnv = await engine.env(TENANT, memberUid);
      expect(memberEnv.context.tz).toBe('Asia/Bangkok');
      expect(await currencyRate(memberEnv, eur!)).toBe(1.2);
      expect(await currencyRate(await engine.env(TENANT, adminUid), eur!)).toBe(1.1); // no tz: UTC
      expect(await currencyRate(await engine.withRequestContext(memberEnv, { tz: 'UTC' }), eur!)).toBe(1.1);
      await expect(engine.withRequestContext(memberEnv, { tz: 'Mars/Olympus' })).rejects.toThrow(/Unknown time zone/);
      await expect(engine.withRequestContext(memberEnv, { lang: 'xx_XX' })).rejects.toThrow(/not active/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('applies the user language to data import and validates explicit import context', async () => {
    const member = await session('member', memberPassword);
    const bad = await post('model/res.partner/import', { header: ['name'], rows: [['X']], dryRun: true, context: { tz: 'Nowhere/Zone' } }, member);
    expect(bad.status).toBe(422);
    const ok = await post('model/res.partner/import', { header: ['name'], rows: [['X']], dryRun: true, context: { tz: 'Europe/Paris', lang: 'en_US' } }, member);
    expect(ok.status).toBe(200);
  });
});
