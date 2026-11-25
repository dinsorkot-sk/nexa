import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Env } from '@nexa/engine';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/engine/auth.service';
import { EngineService } from '../src/engine/engine.service';
import { ReportPdfService } from '../src/engine/report-pdf.service';

const TENANT = 'reports';
const adminPassword = 'reports-test-admin-password-unique';
const memberPassword = 'reports-test-member-password-unique';
let app: INestApplication;
let base: URL;
let engine: EngineService;
let su: Env;
let partnerId: number;

async function post(path: string, body?: unknown, token?: string) {
  const response = await fetch(new URL(`/api/${path}`, base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) as Record<string, unknown> : {} };
}

async function postBinary(path: string, body: unknown, token?: string) {
  const response = await fetch(new URL(`/api/${path}`, base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    contentType: response.headers.get('content-type'),
    disposition: response.headers.get('content-disposition'),
    bytes: new Uint8Array(await response.arrayBuffer()),
  };
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
  vi.stubEnv('NEXA_MODULES', 'base,contacts,report');
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  await app.listen(0, '127.0.0.1');
  base = new URL(await app.getUrl());
  engine = app.get(EngineService);
  const auth = app.get(AuthService);
  su = (await engine.tenant(TENANT)).env({ uid: 1 });
  const [companyId] = (await su.model('res.company').search([], { limit: 1 })).ids;
  const [groupId] = (await su.model('res.groups').search([['code', '=', 'base.group_user']])).ids;
  await su.model('res.users').create({
    name: 'Report member', login: 'report-member', company_id: companyId, company_ids: [companyId], group_ids: [groupId],
  });
  [partnerId] = (await su.model('res.partner').create({ name: 'Ada & Sons', email: 'ada@example.test' })).ids;
  await auth.provisionPassword(TENANT, 'admin', adminPassword);
  await auth.provisionPassword(TENANT, 'report-member', memberPassword);
  if (process.env.NEXA_TEST_REAL_PDF !== '1') {
    vi.spyOn(app.get(ReportPdfService), 'render').mockResolvedValue(
      new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'),
    );
  }
}, 60_000);

afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});

describe('HTML reports through the generic API', () => {
  it('renders a bounded report as the caller and escapes record values', async () => {
    const admin = await session('admin', adminPassword);
    const created = await post('model/ir.actions.report/create', { values: {
      name: 'Partner summary',
      model_name: 'res.partner',
      body_html: '<h1>{{ name }}</h1><p>{{ email }}</p>',
    } }, admin);
    expect(created.status).toBe(200);
    const [reportId] = created.body.ids as number[];

    const result = await post('model/ir.actions.report/call/render_html', {
      ids: [reportId], args: [[partnerId]],
    }, admin);
    expect(result.status).toBe(200);
    expect(result.body.result).toEqual([{
      res_id: partnerId,
      format: 'html',
      contentType: 'text/html',
      content: '<h1>Ada &amp; Sons</h1><p>ada@example.test</p>',
    }]);
  });

  it('checks report and source-record permissions for every caller', async () => {
    const admin = await session('admin', adminPassword);
    const member = await session('report-member', memberPassword);
    const created = await post('model/ir.actions.report/create', { values: {
      name: 'Partner summary',
      model_name: 'res.partner',
      body_html: '<p>{{ name }}</p>',
    } }, admin);
    expect(created.status).toBe(200);
    const [reportId] = created.body.ids as number[];

    const deniedWrite = await post('model/ir.actions.report/write', {
      ids: [reportId], values: { name: 'Changed by member' },
    }, member);
    expect(deniedWrite.status).toBe(403);

    const rendered = await post('model/ir.actions.report/call/render_html', {
      ids: [reportId], args: [[partnerId]],
    }, member);
    expect(rendered.status).toBe(200);
    expect(rendered.body.result).toEqual([expect.objectContaining({ content: '<p>Ada &amp; Sons</p>' })]);

    const missingRecord = await post('model/ir.actions.report/call/render_html', {
      ids: [reportId], args: [[2_000_000_000]],
    }, member);
    expect(missingRecord.status).toBeGreaterThanOrEqual(400);
  });
});

describe('PDF reports through the API', () => {
  it('returns a PDF attachment with a valid PDF signature', async () => {
    const admin = await session('admin', adminPassword);
    const created = await post('model/ir.actions.report/create', { values: {
      name: 'Partner PDF',
      model_name: 'res.partner',
      body_html: '<h1>{{ name }}</h1><p>{{ email }}</p>',
    } }, admin);
    expect(created.status).toBe(200);
    const [reportId] = created.body.ids as number[];

    const denied = await postBinary(`reports/${reportId}/pdf`, { recordId: partnerId });
    expect(denied.status).toBe(401);
    const response = await postBinary(`reports/${reportId}/pdf`, { recordId: partnerId }, admin);
    expect(response.status).toBe(200);
    expect(response.contentType).toContain('application/pdf');
    expect(response.disposition).toMatch(/^attachment; filename="report-\d+-\d+\.pdf"$/);
    expect(new TextDecoder().decode(response.bytes.slice(0, 5))).toBe('%PDF-');
    expect(response.bytes.length).toBeGreaterThan(100);
  }, 30_000);
});
