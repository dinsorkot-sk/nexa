import { ValidationError, type AccessRule, type ModelDef, type ModuleManifest, type Recordset } from '../contracts/index.js';
import type { EnvImpl } from '../orm/env.js';
import { TEMPLATE_LIMITS, validateTemplate } from '../mail/template.js';
import { ReportService } from './service.js';

const SYSTEM = 'base.group_system';
const USER = 'base.group_user';
const all = { read: true, write: true, create: true, unlink: true };
const readOnly = { read: true, write: false, create: false, unlink: false };

async function validateReports(records: Recordset): Promise<void> {
  const rows = await records.env.sudo().model('ir.actions.report').browse([...records.ids]).read(['name', 'model_name', 'body_html']);
  const registry = (records.env as EnvImpl).registry;
  for (const row of rows) {
    if (typeof row.name !== 'string' || !row.name.trim() || row.name.length > 200) throw new ValidationError('Report name is required');
    if (typeof row.model_name !== 'string' || !registry.models.get(row.model_name)?.table || registry.models.get(row.model_name)?.def.transient) {
      throw new ValidationError(`Report model '${String(row.model_name)}' is unavailable`);
    }
    if (typeof row.body_html !== 'string') throw new ValidationError('Report template must be text');
    validateTemplate({ body_html: row.body_html });
  }
}

async function renderHtml(records: Recordset, ...args: unknown[]): Promise<unknown> {
  const ids = args[0];
  if (records.ids.length !== 1 || args.length !== 1 || !Array.isArray(ids) ||
      ids.length < 1 || ids.length > TEMPLATE_LIMITS.maxRecords ||
      !Array.from({ length: ids.length }, (_, index) => Object.hasOwn(ids, index) && Number.isSafeInteger(ids[index]) && ids[index] > 0).every(Boolean)) {
    throw new ValidationError(`render_html requires one report and a list of 1 to ${TEMPLATE_LIMITS.maxRecords} document ids`);
  }
  const reportId = records.ids[0]!;
  return new ReportService(records.env).render(reportId, ids as number[], 'html');
}

export const reportModels: ModelDef[] = [{
  name: 'ir.actions.report',
  origin: 'module' as const,
  module: 'report',
  order: 'name asc, id asc',
  description: 'Report',
  fields: {
    name: { type: 'char' as const, required: true, string: 'Report Name' },
    model_name: { type: 'char' as const, required: true, string: 'Model' },
    body_html: { type: 'html' as const, required: true, string: 'HTML Template' },
    active: { type: 'boolean' as const, default: true },
  },
  constraints: [{ name: 'report_template_valid', check: validateReports, fields: ['name', 'model_name', 'body_html'] }],
  methods: { render_html: renderHtml },
}];

export const reportAccess: AccessRule[] = [
  { model: 'ir.actions.report', group: USER, perms: readOnly },
  { model: 'ir.actions.report', group: SYSTEM, perms: all },
];

export const reportRules = [];

export const reportModule: ModuleManifest = {
  name: 'report',
  version: '1.0.0',
  summary: 'HTML report definitions and pluggable PDF rendering',
  depends: ['mail'],
  models: reportModels,
  access: reportAccess,
  rules: reportRules,
};
