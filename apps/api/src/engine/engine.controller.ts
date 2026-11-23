import { Body, Controller, Get, HttpCode, Inject, Param, Post, UnauthorizedException } from '@nestjs/common';
import { AccessError, getAction, getMenus, getView, MetadataStore, userSecurity, ValidationError, type Domain, type Env, type FieldDef, type ViewNode, type ViewType } from '@nexa/engine';
import {
  callRequestSchema, createRequestSchema, onchangeRequestSchema, readRequestSchema, searchCountRequestSchema,
  searchReadRequestSchema, unlinkRequestSchema, writeRequestSchema,
} from '@nexa/shared';
import { z } from 'zod';
import { EngineService } from './engine.service';
import { CallerParam, type Caller } from './request-env';

const modelName = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/).max(120);
const methodName = z.string().regex(/^[a-z][a-zA-Z0-9_]*$/).max(80);
const viewType = z.enum(['list', 'form', 'kanban', 'search', 'calendar', 'pivot', 'graph']);
const xmlId = z.string().regex(/^[a-z][a-z0-9_]*\.[a-z0-9_]+$/).max(200);
const studioModel = z.object({
  name: z.string().regex(/^x_[a-z0-9_]+$/).max(63),
  description: z.string().max(200).optional(),
});
const studioField = z.object({
  model: modelName,
  name: z.string().regex(/^x_[a-z0-9_]+$/).max(63),
  type: z.enum(['char', 'text', 'integer', 'float', 'boolean', 'date', 'datetime', 'selection', 'json', 'many2one', 'many2many']),
  label: z.string().max(120).optional(),
  required: z.boolean().optional(),
  comodel: modelName.optional(),
  inverseName: z.string().regex(/^x_[a-z0-9_]+$/).max(63).optional(),
  selection: z.array(z.tuple([z.string().min(1).max(40), z.string().min(1).max(80)])).min(1).max(50).optional(),
}).superRefine((field, ctx) => {
  if (['many2one', 'many2many'].includes(field.type) && !field.comodel) {
    ctx.addIssue({ code: 'custom', path: ['comodel'], message: 'Relation fields require a related model.' });
  }
  if (field.type === 'selection' && !field.selection) {
    ctx.addIssue({ code: 'custom', path: ['selection'], message: 'Selection fields require at least one choice.' });
  }
});
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
 * Generic engine API (ADR 0001): every operation runs as the authenticated user through the engine,
 * which enforces ACL, record rules and field groups. All endpoints are POST + JSON except UI reads.
 */
@Controller('api')
export class EngineController {
  // explicit token: test runners (esbuild) do not emit decorator metadata
  constructor(@Inject(EngineService) private readonly engine: EngineService) {}

  private async env(caller: Caller): Promise<Env> {
    if (!this.engine.config.devAuth) throw new UnauthorizedException('Authentication is not configured (set NEXA_DEV_AUTH=1 for development)');
    return this.engine.env(caller.tenant, caller.uid);
  }

  private async model(caller: Caller, model: string) {
    return (await this.env(caller)).model(modelName.parse(model));
  }

  private async studio(caller: Caller) {
    const env = await this.env(caller);
    if (!env.su && !(await userSecurity(env as Parameters<typeof userSecurity>[0])).groups.has('base.group_system')) {
      throw new AccessError('Only Settings administrators can use the Studio');
    }
    return { env, handle: await this.engine.tenant(caller.tenant) };
  }

  @Post('studio/model')
  @HttpCode(200)
  async createStudioModel(@CallerParam() c: Caller, @Body() body: unknown) {
    const req = studioModel.parse(body);
    const { handle } = await this.studio(c);
    const key = req.name;
    try {
      await MetadataStore.for(handle).createModel(
        { name: req.name, ...(req.description ? { description: req.description } : {}) },
        async (tx) => {
      await tx.query({
        text: `INSERT INTO nx_action (module, xml_id, type, name, model, view_types) VALUES ('studio', $1, 'window', $2, $3, ARRAY['list','form'])`,
        params: [`studio.action_${key}`, req.description || req.name, req.name],
      });
      await tx.query({
        text: `INSERT INTO nx_menu (module, xml_id, name, parent, action, sequence, groups) VALUES ('studio', $1, $2, 'base.menu_settings', $3, 50, ARRAY['base.group_system'])`,
        params: [`studio.menu_${key}`, req.description || req.name, `studio.action_${key}`],
      });
      await tx.query({
        text: `INSERT INTO nx_access (module, model, group_code, perm_read, perm_write, perm_create, perm_unlink) VALUES ('studio', $1, 'base.group_system', true, true, true, true)`,
        params: [req.name],
      });
        },
      );
    } catch (err) {
      if (typeof err === 'object' && err !== null && 'code' in err && err.code === '23505') {
        throw new ValidationError(`Model '${req.name}' or its Studio identifiers already exist`);
      }
      throw err;
    }
    return { model: req.name };
  }

  @Get('studio/models')
  async studioModels(@CallerParam() c: Caller) {
    const { handle } = await this.studio(c);
    return { models: (await MetadataStore.for(handle).list()).map(({ name, description, fields }) => ({
      name, description, fields: Object.entries(fields).map(([field, def]) => ({
        name: field, type: def.type, string: def.string ?? field, comodel: def.comodel,
      })),
    })) };
  }

  @Post('studio/field')
  @HttpCode(200)
  async createStudioField(@CallerParam() c: Caller, @Body() body: unknown) {
    const req = studioField.parse(body);
    const { handle } = await this.studio(c);
    const field: FieldDef = {
      type: req.type,
      ...(req.label ? { string: req.label } : {}),
      ...(req.required ? { required: true } : {}),
      ...(req.comodel ? { comodel: req.comodel } : {}),
      ...(req.inverseName ? { inverseName: req.inverseName } : {}),
      ...(req.selection ? { selection: req.selection } : {}),
    };
    await MetadataStore.for(handle).addField(req.model, req.name, field);
    return { model: req.model, field: req.name };
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
    const m = await this.model(c, model);
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
    return { count: await (await this.model(c, model)).searchCount(req.domain as Domain) };
  }

  @Post('model/:model/read')
  @HttpCode(200)
  async read(@CallerParam() c: Caller, @Param('model') model: string, @Body() body: unknown) {
    const req = readRequestSchema.parse(body);
    return { records: await (await this.model(c, model)).browse(req.ids).read(req.fields) };
  }

  @Post('model/:model/create')
  @HttpCode(200)
  async create(@CallerParam() c: Caller, @Param('model') model: string, @Body() body: unknown) {
    const req = createRequestSchema.parse(body);
    return { ids: (await (await this.model(c, model)).create(req.values)).ids };
  }

  @Post('model/:model/write')
  @HttpCode(200)
  async write(@CallerParam() c: Caller, @Param('model') model: string, @Body() body: unknown) {
    const req = writeRequestSchema.parse(body);
    await (await this.model(c, model)).browse(req.ids).write(req.values);
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
    return { value: await (await this.model(c, model)).onchange(req.values, req.field) };
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
