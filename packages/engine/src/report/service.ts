import { AccessError, ValidationError, type Env } from '../contracts/index.js';
import type { EnvImpl } from '../orm/env.js';
import { MailTemplateService, sanitizeHtml, TEMPLATE_LIMITS, validateTemplate } from '../mail/index.js';

export type ReportFormat = 'html' | 'pdf';

export interface RenderedReport {
  res_id: number;
  format: ReportFormat;
  contentType: 'text/html' | 'application/pdf';
  content: string;
}

export interface PdfRenderer {
  /** Render already-sanitized HTML without network access to untrusted URLs. */
  render(html: string): Promise<Uint8Array>;
}

const MAX_PDF_BYTES = 20 * 1024 * 1024;

/** Renders stored report templates under the caller's report and document permissions. */
export class ReportService {
  constructor(private readonly env: Env, private readonly pdfRenderer?: PdfRenderer) {}

  async render(reportId: number, ids: number[], format: ReportFormat = 'html'): Promise<RenderedReport[]> {
    if (!Number.isSafeInteger(reportId) || reportId <= 0) throw new ValidationError('Report id must be a positive integer');
    if (format !== 'html' && format !== 'pdf') throw new ValidationError('Report format must be html or pdf');
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > TEMPLATE_LIMITS.maxRecords ||
        !Array.from({ length: ids.length }, (_, index) => Object.hasOwn(ids, index) && Number.isSafeInteger(ids[index]) && ids[index]! > 0).every(Boolean)) {
      throw new ValidationError(`Render 1 to ${TEMPLATE_LIMITS.maxRecords} records`);
    }
    if (new Set(ids).size !== ids.length) throw new ValidationError('Report record ids must be unique');
    if (format === 'pdf' && !this.pdfRenderer) throw new ValidationError('PDF renderer is not configured');

    const reports = this.env.model('ir.actions.report');
    await reports.checkAccess('read');
    const [report] = await reports.browse(reportId).read(['name', 'model_name', 'body_html', 'active']);
    if (!report || report.active !== true) throw new AccessError('Report is unavailable');
    if (typeof report.model_name !== 'string' || typeof report.body_html !== 'string') {
      throw new ValidationError('Report definition is invalid');
    }
    const registry = (this.env as EnvImpl).registry;
    const model = registry.models.get(report.model_name);
    if (!model?.table || model.def.transient) throw new ValidationError('Report model is unavailable');
    validateTemplate({ body_html: report.body_html });

    const rendered = await new MailTemplateService(this.env).renderInline(report.model_name, ids, { body_html: report.body_html });
    const output: RenderedReport[] = [];
    for (const item of rendered) {
      const html = sanitizeHtml(item.body_html, { allowImages: false });
      if (format === 'html') {
        output.push({ res_id: item.res_id, format, contentType: 'text/html', content: html });
        continue;
      }
      const bytes = await this.pdfRenderer!.render(html);
      if (!(bytes instanceof Uint8Array) || bytes.length < 5 || bytes.length > MAX_PDF_BYTES ||
          Buffer.from(bytes.subarray(0, 5)).toString('ascii') !== '%PDF-') {
        throw new ValidationError('PDF renderer returned an invalid document');
      }
      output.push({ res_id: item.res_id, format, contentType: 'application/pdf', content: Buffer.from(bytes).toString('base64') });
    }
    return output;
  }
}
