import { Body, Controller, HttpCode, Inject, Param, Post, UnauthorizedException } from '@nestjs/common';
import {
  DATA_TRANSFER_LIMITS, DataExportService, DataImportService, ExportTemplateService, SavedFilterService, parseCsv, toCsv,
  type Domain, type Env,
} from '@nexa/engine';
import { domainSchema } from '@nexa/shared';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { EngineService } from './engine.service';
import { CallerParam, type Caller } from './request-env';

const modelName = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/).max(120);
const fieldPath = z.string().min(1).max(300);
const cell = z.union([z.string().max(DATA_TRANSFER_LIMITS.maxCellChars), z.number(), z.boolean(), z.null()]);
const importContext = z.strictObject({
  lang: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/).optional(),
  tz: z.string().regex(/^[A-Za-z0-9_+/-]{1,64}$/).optional(),
  activeTest: z.boolean().optional(),
}).optional();

const exportRequest = z.strictObject({
  fields: z.array(fieldPath).min(1).max(DATA_TRANSFER_LIMITS.maxColumns),
  ids: z.array(z.number().int().positive()).min(1).max(DATA_TRANSFER_LIMITS.maxExportRecords).optional(),
  domain: domainSchema.optional(),
  order: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(DATA_TRANSFER_LIMITS.maxExportRecords).optional(),
  format: z.enum(['json', 'csv']).default('json'),
}).refine((b) => !(b.ids && b.domain), { message: 'Use either ids or domain' });

const importRequest = z.strictObject({
  header: z.array(fieldPath).min(1).max(DATA_TRANSFER_LIMITS.maxColumns).optional(),
  rows: z.array(z.array(cell).max(DATA_TRANSFER_LIMITS.maxColumns)).max(DATA_TRANSFER_LIMITS.maxRows).optional(),
  csv: z.string().max(DATA_TRANSFER_LIMITS.maxImportChars).optional(),
  dryRun: z.boolean().default(false),
  context: importContext,
}).refine((b) => (b.csv === undefined) !== (b.header === undefined && b.rows === undefined) && (b.csv !== undefined || (b.header && b.rows)), {
  message: 'Send either csv, or header and rows',
});

const templateCreate = z.strictObject({ name: z.string().trim().min(1).max(120), fields: z.array(fieldPath).min(1).max(DATA_TRANSFER_LIMITS.maxColumns) });
const filterContext = z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/), z.unknown())
  .refine((c) => Object.keys(c).length <= 50 && JSON.stringify(c).length <= 20_000, { message: 'Context is too large' });
const filterCreate = z.strictObject({
  name: z.string().trim().min(1).max(120),
  domain: domainSchema.default([]),
  context: filterContext.optional(),
  sort: z.string().max(200).nullable().optional(),
  shared: z.boolean().default(false),
  isDefault: z.boolean().default(false),
});
const filterUpdate = z.strictObject({
  name: z.string().trim().min(1).max(120).optional(),
  domain: domainSchema.optional(),
  context: filterContext.optional(),
  sort: z.string().max(200).nullable().optional(),
  isDefault: z.boolean().optional(),
});
const recordId = z.coerce.number().int().positive().max(2_147_483_647);

/** Import/export, export templates and saved filters. Every call runs as the authenticated user. */
@Controller('api')
export class DataTransferController {
  constructor(
    @Inject(EngineService) private readonly engine: EngineService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  private async env(caller: Caller): Promise<Env> {
    if (caller.bearerToken) {
      const authenticated = await this.auth.authenticate(caller.bearerToken);
      return this.engine.env(authenticated.tenant, authenticated.uid);
    }
    if (!this.engine.config.devAuth || caller.tenant === undefined || caller.uid === undefined) {
      throw new UnauthorizedException('A valid bearer token is required');
    }
    return this.engine.env(caller.tenant, caller.uid);
  }

  @Post('model/:model/export')
  @HttpCode(200)
  async export(@CallerParam() c: Caller, @Param('model') model: string, @Body() body: unknown) {
    const name = modelName.parse(model);
    const req = exportRequest.parse(body);
    const env = await this.env(c);
    const result = await new DataExportService(env).exportData(name, req.fields, {
      ...(req.ids ? { ids: req.ids } : {}),
      ...(req.domain ? { domain: req.domain as Domain } : {}),
      ...(req.order ? { order: req.order } : {}),
      ...(req.limit ? { limit: req.limit } : {}),
    });
    return req.format === 'csv' ? { csv: toCsv(result.header, result.rows) } : result;
  }

  @Post('model/:model/import')
  @HttpCode(200)
  async import(@CallerParam() c: Caller, @Param('model') model: string, @Body() body: unknown) {
    const name = modelName.parse(model);
    const req = importRequest.parse(body);
    // explicit lang / tz are validated (active language, known zone) and override the user's preferences
    const env = await this.engine.withRequestContext(await this.env(c), { lang: req.context?.lang, tz: req.context?.tz });
    const { header, rows } = req.csv !== undefined ? parseCsv(req.csv) : { header: req.header!, rows: req.rows! };
    const activeTest = req.context?.activeTest;
    return new DataImportService(env).load(name, header, rows, {
      dryRun: req.dryRun, ...(activeTest !== undefined ? { context: { activeTest } } : {}),
    });
  }

  @Post('model/:model/export_templates/list')
  @HttpCode(200)
  async listTemplates(@CallerParam() c: Caller, @Param('model') model: string) {
    const name = modelName.parse(model);
    return { templates: await new ExportTemplateService(await this.env(c)).list(name) };
  }

  @Post('model/:model/export_templates/create')
  @HttpCode(200)
  async createTemplate(@CallerParam() c: Caller, @Param('model') model: string, @Body() body: unknown) {
    const name = modelName.parse(model);
    const req = templateCreate.parse(body);
    return { id: await new ExportTemplateService(await this.env(c)).save(name, req.name, req.fields) };
  }

  @Post('export_templates/:id/delete')
  @HttpCode(200)
  async deleteTemplate(@CallerParam() c: Caller, @Param('id') rawId: string) {
    const id = recordId.parse(rawId);
    await new ExportTemplateService(await this.env(c)).remove(id);
    return { ok: true };
  }

  @Post('model/:model/filters/list')
  @HttpCode(200)
  async listFilters(@CallerParam() c: Caller, @Param('model') model: string) {
    const name = modelName.parse(model);
    return { filters: await new SavedFilterService(await this.env(c)).list(name) };
  }

  @Post('model/:model/filters/create')
  @HttpCode(200)
  async createFilter(@CallerParam() c: Caller, @Param('model') model: string, @Body() body: unknown) {
    const name = modelName.parse(model);
    const req = filterCreate.parse(body);
    const id = await new SavedFilterService(await this.env(c)).create({
      name: req.name, model: name, domain: req.domain as Domain, shared: req.shared, isDefault: req.isDefault,
      ...(req.context ? { context: req.context } : {}), ...(req.sort !== undefined ? { sort: req.sort } : {}),
    });
    return { id };
  }

  @Post('filters/:id/update')
  @HttpCode(200)
  async updateFilter(@CallerParam() c: Caller, @Param('id') rawId: string, @Body() body: unknown) {
    const id = recordId.parse(rawId);
    const req = filterUpdate.parse(body);
    await new SavedFilterService(await this.env(c)).update(id, {
      ...(req.name !== undefined ? { name: req.name } : {}),
      ...(req.domain !== undefined ? { domain: req.domain as Domain } : {}),
      ...(req.context !== undefined ? { context: req.context } : {}),
      ...(req.sort !== undefined ? { sort: req.sort } : {}),
      ...(req.isDefault !== undefined ? { isDefault: req.isDefault } : {}),
    });
    return { ok: true };
  }

  @Post('filters/:id/delete')
  @HttpCode(200)
  async deleteFilter(@CallerParam() c: Caller, @Param('id') rawId: string) {
    const id = recordId.parse(rawId);
    await new SavedFilterService(await this.env(c)).remove(id);
    return { ok: true };
  }
}
