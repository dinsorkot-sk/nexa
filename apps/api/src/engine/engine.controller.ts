import { Body, Controller, Get, HttpCode, Inject, Param, Post, UnauthorizedException } from '@nestjs/common';
import { getAction, getMenus, getView, type Domain, type Env, type ViewType } from '@nexa/engine';
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
