import { Body, Controller, Get, Header, HttpCode, Inject, Param, Post, StreamableFile, UnauthorizedException, Req } from '@nestjs/common';
import { AccessError, ButtonService, getAction, getMenus, getView, MailAliasService, MailQueueService, MailTemplateService, MetadataStore, ReportService, userSecurity, ValidationError, type Domain, type Env, type TenantHandle, type ViewNode, type ViewType } from '@nexa/engine';
import {
  callRequestSchema, copyRequestSchema, createRequestSchema, defaultGetRequestSchema, fieldsGetRequestSchema,
  nameSearchRequestSchema, onchangeRequestSchema, readGroupRequestSchema, readRequestSchema, searchCountRequestSchema,
  searchReadRequestSchema, unlinkRequestSchema, writeRequestSchema, type ModelRequestContext,
} from '@nexa/shared';
import { z } from 'zod';
import { EngineService } from './engine.service';
import { assertStudioTarget, createStudioField, createStudioModel, modelName, studioExpressions, studioField, studioModel } from './studio-ops';
import { CallerParam, type Caller } from './request-env';
import { AuthService, type AuthenticatedToken } from './auth.service';
import { ReportPdfService } from './report-pdf.service';
import { SmtpMailService } from './smtp-mail.service';
import { applyPackRequest, PacksService } from './packs.service';
import type { Request } from 'express';

const loginRequest = z.object({
  tenant: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,62}$/),
  login: z.string().min(1).max(120),
  password: z.string().min(1).max(1024),
});
const apiKeyRequest = z.object({
  name: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(1024),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});
const changePasswordRequest = z.strictObject({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(1).max(1024),
});
const setPasswordRequest = z.strictObject({ password: z.string().min(1).max(1024) });
const revokeKeyRequest = z.object({ id: z.number().int().positive() });
const pathRecordId = z.string().regex(/^[1-9][0-9]{0,9}$/).transform(Number).pipe(z.number().max(2_147_483_647));
const reportPdfRequest = z.strictObject({ recordId: z.number().int().positive().max(2_147_483_647) });

const mailRecordBody = z.strictObject({ recordId: z.number().int().positive().max(2_147_483_647) });
const mailTemplateQueueBody = mailRecordBody.extend({ requestId: z.uuid() });
const mailQueueBody = z.strictObject({ limit: z.number().int().min(1).max(5).default(1) });
const aliasAddress = z.string().trim().min(3).max(254);
const mailAliasBody = mailRecordBody.extend({ alias: aliasAddress, model: modelName });
const inboundMailBody = z.strictObject({
  alias: aliasAddress,
  messageId: z.string().min(1).max(254),
  from: z.string().trim().min(3).max(254),
  subject: z.string().max(500).optional(),
  text: z.string().max(45_000),
});
const methodName = z.string().regex(/^[a-z][a-zA-Z0-9_]*$/).max(80);
const buttonRequest = z.strictObject({
  ids: z.array(z.number().int().positive()).min(1).max(1000),
  action: z.string().regex(/^[a-z][a-z0-9_.-]{0,127}$/).optional(),
  method: methodName.optional(),
  args: z.array(z.unknown()).max(20).optional(),
}).refine((b) => (b.action === undefined) !== (b.method === undefined), { message: 'Exactly one of action or method is required' })
  .refine((b) => b.args === undefined || b.method !== undefined, { message: 'args only apply to method buttons' });
const viewType = z.enum(['list', 'form', 'kanban', 'search', 'calendar', 'pivot', 'graph']);
const xmlId = z.string().regex(/^[a-z][a-z0-9_]*\.[a-z0-9_]+$/).max(200);
const mixinName = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/).max(120);
const studioMixin = z.strictObject({ model: modelName, mixin: mixinName });
const studioMixinDetach = z.strictObject({ model: modelName, mixin: mixinName, confirmDestructive: z.boolean().optional() });
/** Models Studio must not reshape (security, configuration, mail internals); abstract models are refused too. */
const viewNodeSchema: z.ZodType<ViewNode> = z.lazy(() => z.object({
  tag: z.string().regex(/^[a-z][a-z0-9_-]*$/).max(40),
  attrs: z.record(z.string(), z.unknown()).optional(),
  children: z.array(viewNodeSchema).max(100).optional(),
}));
const studioView = z.object({
  model: modelName,
  name: z.string().regex(/^x_[a-z0-9_]+$/).max(80),
  type: z.enum(['list', 'form', 'search']),
  arch: viewNodeSchema,
});

/**
 * Fields a mixin contributes to a model that neither the model's own (custom metadata) definition
 * nor its other parents provide: the columns a detach drops.
 */
async function mixinOwnFields(handle: TenantHandle, model: string, mixin: string): Promise<string[]> {
  const registry = handle.registry;
  const target = registry.models.get(model);
  const parent = registry.models.get(mixin);
  if (!target || !parent) return [];
  const custom = (await MetadataStore.for(handle).list()).find((d) => d.name === model);
  const others = new Set<string>(Object.keys(custom?.fields ?? {}));
  for (const other of target.def.extends ?? []) {
    if (other === mixin || other === model) continue;
    for (const name of registry.models.get(other)?.fields.keys() ?? []) others.add(name);
  }
  return [...parent.fields.keys()].filter((name) => target.fields.has(name) && !others.has(name)).sort();
}

/**
 * Generic engine API (ADR 0001): every operation runs as the authenticated user through the engine,
 * which enforces ACL, record rules and field groups. All endpoints are POST + JSON except UI reads.
 */
@Controller('api')
export class EngineController {
  // explicit token: test runners (esbuild) do not emit decorator metadata
  constructor(
    @Inject(EngineService) private readonly engine: EngineService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ReportPdfService) private readonly reportsPdf: ReportPdfService,
    @Inject(SmtpMailService) private readonly smtpMail: SmtpMailService,
    @Inject(PacksService) private readonly packs: PacksService,
  ) {}

  private async resolveCaller(caller: Caller): Promise<{ tenant: string; uid: number }> {
    if (caller.bearerToken) {
      const authenticated = await this.auth.authenticate(caller.bearerToken);
      return { tenant: authenticated.tenant, uid: authenticated.uid };
    }
    if (!this.engine.config.devAuth || caller.tenant === undefined || caller.uid === undefined) {
      throw new UnauthorizedException('A valid bearer token is required');
    }
    return { tenant: caller.tenant, uid: caller.uid };
  }

  private async env(caller: Caller): Promise<Env> {
    const identity = await this.resolveCaller(caller);
    return this.engine.env(identity.tenant, identity.uid);
  }

  private async tokenCaller(caller: Caller): Promise<AuthenticatedToken> {
    if (!caller.bearerToken) throw new UnauthorizedException('A bearer token is required');
    return this.auth.authenticate(caller.bearerToken);
  }

  @Post('auth/login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async login(@Body() body: unknown, @Req() request: Request) {
    const req = loginRequest.parse(body);
    const clientKey = request.socket.remoteAddress ?? 'unknown';
    const result = await this.auth.login(req.tenant, req.login, req.password, clientKey);
    return { tokenType: 'Bearer', accessToken: result.token, expiresAt: result.expiresAt };
  }

  @Post('auth/logout')
  @HttpCode(200)
  async logout(@CallerParam() caller: Caller) {
    await this.auth.logout(await this.tokenCaller(caller));
    return { ok: true };
  }

  @Post('auth/api-keys')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async createApiKey(@CallerParam() caller: Caller, @Body() body: unknown, @Req() request: Request) {
    const req = apiKeyRequest.parse(body);
    const token = await this.tokenCaller(caller);
    if (token.kind !== 'session') throw new UnauthorizedException('A login session is required');
    this.auth.validateApiKeyRequest(req.name, req.expiresInDays);
    const result = await this.auth.createApiKey(
      token, req.password, req.name, request.socket.remoteAddress ?? 'unknown', req.expiresInDays,
    );
    return { id: result.id, name: result.name, token: result.token, expiresAt: result.expiresAt };
  }

  @Post('auth/password')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async changePassword(@CallerParam() caller: Caller, @Body() body: unknown, @Req() request: Request) {
    const req = changePasswordRequest.parse(body);
    const token = await this.tokenCaller(caller);
    await this.auth.changePassword(token, req.currentPassword, req.newPassword, request.socket.remoteAddress ?? 'unknown');
    return { ok: true };
  }

  @Post('auth/users/:id/password')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async setUserPassword(@CallerParam() caller: Caller, @Param('id') rawId: string, @Body() body: unknown) {
    const id = pathRecordId.parse(rawId);
    const req = setPasswordRequest.parse(body);
    const token = await this.tokenCaller(caller);
    await this.auth.setUserPassword(token, id, req.password);
    return { ok: true };
  }

  @Post('auth/api-keys/:id/revoke')
  @HttpCode(200)
  async revokeApiKey(@CallerParam() caller: Caller, @Param('id') rawId: string) {
    const id = revokeKeyRequest.parse({ id: Number(rawId) }).id;
    const token = await this.tokenCaller(caller);
    await this.auth.revokeApiKey(token, id);
    return { ok: true };
  }

  private async model(caller: Caller, model: string, context?: ModelRequestContext) {
    const env = await this.env(caller);
    const name = modelName.parse(model);
    if (!context) return env.model(name);
    const { lang, activeTest, defaults } = context;
    const fieldDefaults = Object.fromEntries(Object.entries(defaults ?? {}).map(([field, value]) => [`default_${field}`, value]));
    // an explicit request language (validated: active) overrides the user's preference
    return (await this.engine.withRequestContext(env, { lang })).withContext({
      ...(activeTest !== undefined ? { activeTest } : {}),
      ...fieldDefaults,
    }).model(name);
  }

  private async studio(caller: Caller) {
    const env = await this.env(caller);
    if (!env.su && !(await userSecurity(env as Parameters<typeof userSecurity>[0])).groups.has('base.group_system')) {
      throw new AccessError('Only Settings administrators can use the Studio');
    }
    const identity = await this.resolveCaller(caller);
    return { env, handle: await this.engine.tenant(identity.tenant) };
  }

  @Post('studio/model')
  @HttpCode(200)
  async createStudioModel(@CallerParam() c: Caller, @Body() body: unknown) {
    const req = studioModel.parse(body);
    const { handle } = await this.studio(c);
    return createStudioModel(handle, req);
  }

  @Get('studio/models')
  async studioModels(@CallerParam() c: Caller) {
    const { handle } = await this.studio(c);
    return { models: (await MetadataStore.for(handle).list()).map(({ name, description, fields, onchange, constraints }) => ({
      name, description, onchange, constraints, fields: Object.entries(fields).map(([field, def]) => ({
        name: field, type: def.type, string: def.string ?? field, comodel: def.comodel,
        required: !!def.required, translate: def.translate, digits: def.digits, copy: def.copy, aggregator: def.aggregator, currencyField: def.currencyField,
        computeExpr: def.computeExpr, defaultExpr: def.defaultExpr, store: def.store, depends: def.depends,
        default: def.default, help: def.help, readonly: def.readonly, index: def.index, unique: def.unique, ondelete: def.ondelete,
        checkCompany: def.checkCompany, writeGroups: def.writeGroups, ratchet: def.ratchet,
      })),
    })) };
  }

  @Post('studio/field')
  @HttpCode(200)
  async createStudioField(@CallerParam() c: Caller, @Body() body: unknown) {
    const { env, handle } = await this.studio(c);
    return createStudioField(env, handle, studioField.parse(body));
  }

  /** Built-in starter packs (Settings administrators). */
  @Get('packs')
  async listPacks(@CallerParam() c: Caller) {
    await this.studio(c);
    return { packs: await this.packs.list() };
  }

  /** Apply a starter pack with the caller's rights; idempotent (see PacksService). */
  @Post('packs/:name/apply')
  @HttpCode(200)
  async applyPack(@CallerParam() c: Caller, @Param('name') name: string, @Body() body: unknown) {
    const req = applyPackRequest.parse(body ?? {});
    const { env, handle } = await this.studio(c);
    const pack = await this.packs.load(name);
    // records are created in the target company (which must be one of the caller's allowed companies)
    const companies = req.params.company !== undefined ? [req.params.company] : undefined;
    return this.packs.apply(handle, () => this.engine.env(env.tenant, env.uid, companies), pack, req.params);
  }

  /** Abstract module mixins that can be attached, and the mixins attached through metadata per model. */
  @Get('studio/mixins')
  async studioMixins(@CallerParam() c: Caller) {
    const { handle } = await this.studio(c);
    const available = [...handle.registry.models.values()]
      .filter((m) => m.def.abstract && m.def.origin === 'module')
      .map((m) => ({ name: m.name, description: m.def.description ?? m.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { available, attached: await MetadataStore.for(handle).listMixins() };
  }

  /** Attach an abstract mixin as the caller (actor); the store re-checks the caller is an administrator. */
  @Post('studio/mixin/attach')
  @HttpCode(200)
  async attachStudioMixin(@CallerParam() c: Caller, @Body() body: unknown) {
    const { env, handle } = await this.studio(c);
    const req = studioMixin.parse(body);
    assertStudioTarget(handle, req.model);
    await MetadataStore.for(handle).addMixin(req.model, req.mixin, { actor: env });
    // a fresh env sees the rebuilt registry
    const fresh = await this.engine.env(env.tenant, env.uid);
    return { model: req.model, mixin: req.mixin, fields: await fresh.model(req.model).fieldsGet() };
  }

  /** Detach a mixin: drops the columns it added, so an explicit confirmation is required. */
  @Post('studio/mixin/detach')
  @HttpCode(200)
  async detachStudioMixin(@CallerParam() c: Caller, @Body() body: unknown) {
    const { env, handle } = await this.studio(c);
    const req = studioMixinDetach.parse(body);
    if (req.confirmDestructive !== true) {
      const dropped = await mixinOwnFields(handle, req.model, req.mixin);
      throw new ValidationError(
        `Detaching '${req.mixin}' from '${req.model}' drops the fields: ${dropped.join(', ') || '(none)'}; set confirmDestructive: true`,
      );
    }
    await MetadataStore.for(handle).removeMixin(req.model, req.mixin, { allowDestructive: true, actor: env });
    const fresh = await this.engine.env(env.tenant, env.uid);
    return { model: req.model, mixin: req.mixin, fields: await fresh.model(req.model).fieldsGet() };
  }

  @Post('studio/expressions')
  @HttpCode(200)
  async setStudioExpressions(@CallerParam() c: Caller, @Body() body: unknown) {
    const { model, onchange, constraints } = studioExpressions.parse(body);
    const { handle } = await this.studio(c);
    await MetadataStore.for(handle).setModelExpressions(model, { onchange, constraints });
    return { model };
  }

  @Post('studio/view')
  @HttpCode(200)
  async createStudioView(@CallerParam() c: Caller, @Body() body: unknown) {
    const req = studioView.parse(body);
    const { env, handle } = await this.studio(c);
    const modelDef = handle.registry.models.get(req.model);
    if (!modelDef?.def || !modelDef.def.origin || modelDef.def.origin !== 'custom') {
      throw new ValidationError('Studio views can only be added to custom models');
    }
    const model = env.model(req.model);
    await model.checkAccess('read');
    const meta = handle.registry.get(req.model);
    const visit = (node: ViewNode) => {
      if (!['field', 'group', 'notebook', 'page', 'separator', 'label', req.type].includes(node.tag)) {
        throw new ValidationError(`Unsupported Studio view element '${node.tag}'`);
      }
      if (node.tag === 'field') {
        const field = node.attrs?.name;
        if (typeof field !== 'string' || !meta.fields.has(field)) throw new ValidationError(`Unknown field '${String(field)}' on '${req.model}'`);
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(req.arch);
    if (req.arch.tag !== req.type) throw new ValidationError(`View root must be '${req.type}'`);
    const xmlId = `studio.${req.name}`;
    try {
      await handle.driver.transaction(async (tx) => {
        const existing = await tx.query({
          text: `SELECT 1 FROM nx_view WHERE model = $1 AND type = $2 AND inherit_from IS NULL`,
          params: [req.model, req.type],
        });
        if (existing.length) throw new ValidationError(`A primary ${req.type} view already exists for '${req.model}'`);
        const duplicate = await tx.query({ text: `SELECT 1 FROM nx_view WHERE xml_id = $1`, params: [xmlId] });
        if (duplicate.length) throw new ValidationError(`View '${xmlId}' already exists`);
        await tx.query({
          text: `INSERT INTO nx_view (module, xml_id, model, type, priority, arch) VALUES ('studio', $1, $2, $3, 16, $4::jsonb)`,
          params: [xmlId, req.model, req.type, JSON.stringify(req.arch)],
        });
      });
    } catch (err) {
      if (typeof err === 'object' && err !== null && 'code' in err && err.code === '23505') {
        throw new ValidationError(`View '${xmlId}' already exists`);
      }
      throw err;
    }
    return { xmlId };
  }

  @Post('model/:model/search_read')
  @HttpCode(200)
  async searchRead(@CallerParam() c: Caller, @Param('model') model: string, @Body() body: unknown) {
    const req = searchReadRequestSchema.parse(body ?? {});
    const m = await this.model(c, model, req.context);
    const opts = { offset: req.offset, limit: req.limit, ...(req.order ? { order: req.order } : {}) };
    const [records, length] = await Promise.all([
      m.searchRead(req.domain as Domain, req.fields, opts),
      m.searchCount(req.domain as Domain),
    ]);
    return { records, length };
  }

  @Post('model/:model/search_count')
  @HttpCode(200)
  async searchCount(@CallerParam() c: Caller, @Param('model') model: string, @Body() body: unknown) {
    const req = searchCountRequestSchema.parse(body ?? {});
    return { count: await (await this.model(c, model, req.context)).searchCount(req.domain as Domain) };
  }

  @Post('model/:model/read')
  @HttpCode(200)
  async read(@CallerParam() c: Caller, @Param('model') model: string, @Body() body: unknown) {
    const req = readRequestSchema.parse(body);
    return { records: await (await this.model(c, model, req.context)).browse(req.ids).read(req.fields) };
  }

  @Post('model/:model/create')
  @HttpCode(200)
  async create(@CallerParam() c: Caller, @Param('model') model: string, @Body() body: unknown) {
    const req = createRequestSchema.parse(body);
    return { ids: (await (await this.model(c, model, req.context)).create(req.values)).ids };
  }

  @Post('model/:model/name_search')
  @HttpCode(200)
  async nameSearch(@CallerParam() c: Caller, @Param('model') model: string, @Body() body: unknown) {
    const req = nameSearchRequestSchema.parse(body ?? {});
    const records = await (await this.model(c, model, req.context)).nameSearch(req.name, req.domain as Domain, { limit: req.limit });
    return { records };
  }

  @Post('model/:model/read_group')
  @HttpCode(200)
  async readGroup(@CallerParam() c: Caller, @Param('model') model: string, @Body() body: unknown) {
    const req = readGroupRequestSchema.parse(body ?? {});
    const groups = await (await this.model(c, model, req.context)).readGroup(req.domain as Domain, req.groupBy, req.aggregates, {
      limit: req.limit, offset: req.offset,
    });
    return { groups };
  }

  @Post('model/:model/fields_get')
  @HttpCode(200)
  async fieldsGet(@CallerParam() c: Caller, @Param('model') model: string, @Body() body: unknown) {
    const req = fieldsGetRequestSchema.parse(body ?? {});
    return { fields: await (await this.model(c, model, req.context)).fieldsGet(req.fields) };
  }

  @Post('model/:model/default_get')
  @HttpCode(200)
  async defaultGet(@CallerParam() c: Caller, @Param('model') model: string, @Body() body: unknown) {
    const req = defaultGetRequestSchema.parse(body);
    return { values: await (await this.model(c, model, req.context)).defaultGet(req.fields) };
  }

  @Post('model/:model/copy')
  @HttpCode(200)
  async copy(@CallerParam() c: Caller, @Param('model') model: string, @Body() body: unknown) {
    const req = copyRequestSchema.parse(body);
    return { ids: (await (await this.model(c, model, req.context)).browse(req.id).copy(req.defaults)).ids };
  }

  @Post('model/:model/write')
  @HttpCode(200)
  async write(@CallerParam() c: Caller, @Param('model') model: string, @Body() body: unknown) {
    const req = writeRequestSchema.parse(body);
    await (await this.model(c, model, req.context)).browse(req.ids).write(req.values);
    return { ok: true };
  }

  @Post('model/:model/unlink')
  @HttpCode(200)
  async unlink(@CallerParam() c: Caller, @Param('model') model: string, @Body() body: unknown) {
    const req = unlinkRequestSchema.parse(body);
    await (await this.model(c, model)).browse(req.ids).unlink();
    return { ok: true };
  }

  @Post('model/:model/onchange')
  @HttpCode(200)
  async onchange(@CallerParam() c: Caller, @Param('model') model: string, @Body() body: unknown) {
    const req = onchangeRequestSchema.parse(body);
    return { value: await (await this.model(c, model, req.context)).onchange(req.values, req.field) };
  }

  /**
   * Calls a method declared in the model definition (own ModelDef.methods entries only).
   * Methods run as the caller: they must use env operations (never sudo on user input) to stay safe.
   */
  @Post('model/:model/call/:method')
  @HttpCode(200)
  async call(@CallerParam() c: Caller, @Param('model') model: string, @Param('method') method: string, @Body() body: unknown) {
    const req = callRequestSchema.parse(body ?? {});
    const m = await this.model(c, model);
    await m.checkAccess('read');
    // the target records must exist and pass the user's read rules before any method runs on them
    if (req.ids.length) await m.browse(req.ids).read(['id']);
    return { result: await m.browse(req.ids).call(methodName.parse(method), ...req.args) };
  }

  @Post('reports/:id/pdf')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async reportPdf(@CallerParam() caller: Caller, @Param('id') id: string, @Body() body: unknown) {
    const report = pathRecordId.parse(id);
    const { recordId } = reportPdfRequest.parse(body);
    const service = new ReportService(await this.env(caller), this.reportsPdf);
    const [file] = await service.render(report, [recordId], 'pdf');
    if (!file) throw new ValidationError('Report output is unavailable');
    return new StreamableFile(Buffer.from(file.content, 'base64'), {
      type: 'application/pdf',
      disposition: `attachment; filename="report-${report}-${recordId}.pdf"`,
    });
  }

  @Post('mail/templates/:id/queue')
  @HttpCode(201)
  async queueMail(@CallerParam() caller: Caller, @Param('id') id: string, @Body() body: unknown) {
    const { recordId, requestId } = mailTemplateQueueBody.parse(body);
    const result = await new MailTemplateService(await this.env(caller)).queue(pathRecordId.parse(id), recordId, requestId);
    return { messageId: result };
  }

  @Post('mail/queue/process')
  @HttpCode(200)
  async processMail(@CallerParam() caller: Caller, @Body() body: unknown) {
    const { limit } = mailQueueBody.parse(body ?? {});
    const env = await this.env(caller);
    if (!(await userSecurity(env as Parameters<typeof userSecurity>[0])).groups.has('base.group_system')) {
      throw new AccessError('Only settings administrators can process outgoing mail');
    }
    return new MailQueueService(env, this.smtpMail.transportFor(env.tenant)).process(limit);
  }

  @Post('mail/aliases')
  @HttpCode(201)
  async defineMailAlias(@CallerParam() caller: Caller, @Body() body: unknown) {
    await new MailAliasService(await this.env(caller)).define(mailAliasBody.parse(body));
    return { ok: true };
  }

  @Post('mail/aliases/remove')
  @HttpCode(200)
  async removeMailAlias(@CallerParam() caller: Caller, @Body() body: unknown) {
    const { alias } = z.strictObject({ alias: aliasAddress }).parse(body);
    await new MailAliasService(await this.env(caller)).remove(alias);
    return { ok: true };
  }

  @Post('mail/inbound')
  @HttpCode(200)
  async routeInboundMail(@CallerParam() caller: Caller, @Body() body: unknown) {
    return new MailAliasService(await this.env(caller)).route(inboundMailBody.parse(body));
  }

  /**
   * Runs a button on records as the caller: a registered server action (`action`) or a model method
   * (`method`). Button guards (NX-Expr) must hold for every record; failures roll back the whole call.
   */
  @Post('model/:model/button')
  @HttpCode(200)
  async button(@CallerParam() c: Caller, @Param('model') model: string, @Body() body: unknown) {
    const req = buttonRequest.parse(body ?? {});
    const env = await this.env(c);
    const result = await new ButtonService(env).execute(modelName.parse(model), req.ids, {
      ...(req.action !== undefined ? { action: req.action } : {}),
      ...(req.method !== undefined ? { method: req.method, args: req.args ?? [] } : {}),
    });
    return { result };
  }

  @Get('ui/view/:model/:type')
  async view(@CallerParam() c: Caller, @Param('model') model: string, @Param('type') type: string) {
    return getView(await this.env(c), modelName.parse(model), viewType.parse(type) as ViewType);
  }

  @Get('ui/action/:xmlId')
  async action(@CallerParam() c: Caller, @Param('xmlId') id: string) {
    return getAction(await this.env(c), xmlId.parse(id));
  }

  @Get('ui/menus')
  async menus(@CallerParam() c: Caller) {
    return { menus: await getMenus(await this.env(c)) };
  }
}
