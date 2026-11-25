import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessError, ModuleCatalog, PgliteTenantManager, ValidationError, baseModule, type Env, type ModuleManifest } from '../src/index.js';
import { mailModule } from '../src/mail/index.js';
import { ReportService, reportModule, type PdfRenderer } from '../src/report/index.js';

const reportFixture: ModuleManifest = {
  name: 'report_test',
  version: '1.0.0',
  depends: ['report'],
  models: [{
    name: 'x.report.document',
    origin: 'module',
    fields: { name: { type: 'char', required: true }, secret: { type: 'char', groups: ['base.group_system'] } },
  }],
  access: [{ model: 'x.report.document', group: 'base.group_user', perms: { read: true, write: true, create: true, unlink: false } }],
  rules: [{ name: 'x_report_document_visible', model: 'x.report.document', groups: ['base.group_user'], perms: { read: true, write: false, create: false, unlink: false }, domain: [['name', '!=', 'Private']] }],
};

let manager: PgliteTenantManager;
let root: Env;
let user: Env;
let reportId: number;
let readableId: number;
let restrictedId: number;

beforeAll(async () => {
  manager = new PgliteTenantManager({ catalog: new ModuleCatalog([baseModule, mailModule, reportModule, reportFixture]) });
  const tenant = await manager.create('reports', ['report_test']);
  root = tenant.env({ uid: 1 });
  const companyId = (await root.model('res.company').search([])).ids[0]!;
  const groupId = (await root.model('res.groups').search([['code', '=', 'base.group_user']])).ids[0]!;
  const [uid] = (await root.model('res.users').create({
    name: 'Report reader', login: 'report-reader', company_id: companyId, company_ids: [{ op: 'set', ids: [companyId] }],
    group_ids: [{ op: 'set', ids: [groupId] }],
  })).ids;
  user = tenant.env({ uid: uid! });
  [readableId, restrictedId] = (await root.model('x.report.document').create([
    { name: '<Account & Co>', secret: 'classified' },
    { name: 'Private' },
  ])).ids;
  [reportId] = (await root.model('ir.actions.report').create({
    name: 'Document summary', model_name: 'x.report.document', body_html: '<h1>{{ name }}</h1><img src="https://example.test/pixel">',
  })).ids;
}, 120_000);

afterAll(async () => { await manager.closeAll(); });

describe('report definitions and rendering', () => {
  it('registers a report module with readable internal definitions and admin-only writes', async () => {
    expect(reportModule.depends).toContain('mail');
    await expect(user.model('ir.actions.report').browse(reportId!).write({ name: 'Changed' })).rejects.toThrow(AccessError);
    expect(await user.model('ir.actions.report').browse(reportId!).read(['name'])).toMatchObject([{ name: 'Document summary' }]);
  });

  it('renders escaped HTML through caller document permissions and removes external images', async () => {
    const output = await new ReportService(user).render(reportId!, [readableId!]);
    expect(output).toEqual([{
      res_id: readableId,
      format: 'html',
      contentType: 'text/html',
      content: '<h1>&lt;Account &amp; Co&gt;</h1>',
    }]);
    await expect(new ReportService(user).render(reportId!, [restrictedId!])).rejects.toThrow(AccessError);
  });

  it('validates templates on write and caps record batches', async () => {
    await expect(root.model('ir.actions.report').browse(reportId!).write({ body_html: '{{ name' })).rejects.toThrow(ValidationError);
    await expect(new ReportService(root).render(reportId!, Array(101).fill(readableId))).rejects.toThrow(ValidationError);
    await expect(new ReportService(root).render(reportId!, [readableId!, readableId!])).rejects.toThrow(ValidationError);
    await expect(new ReportService(root).render(reportId!, [, readableId!] as number[])).rejects.toThrow(ValidationError);
  });

  it('requires and uses an explicitly injected PDF renderer', async () => {
    await expect(new ReportService(root).render(reportId!, [readableId!], 'pdf')).rejects.toThrow(ValidationError);
    const renderer: PdfRenderer = { render: async (html) => new TextEncoder().encode(`%PDF-fake:${html}`) };
    const [result] = await new ReportService(root, renderer).render(reportId!, [readableId!], 'pdf');
    expect(result).toMatchObject({ res_id: readableId, format: 'pdf', contentType: 'application/pdf' });
    expect(Buffer.from(result!.content, 'base64').toString()).toContain('%PDF-fake:<h1>');
    await expect(new ReportService(root, { render: async () => new Uint8Array([1, 2, 3, 4, 5]) })
      .render(reportId!, [readableId!], 'pdf')).rejects.toThrow(ValidationError);
  });
});
