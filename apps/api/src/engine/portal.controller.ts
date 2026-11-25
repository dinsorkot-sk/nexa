import {
  Body, Controller, Header, Headers, HttpCode, Inject, NotFoundException, Post, UnauthorizedException,
} from '@nestjs/common';
import { AccessError, MailThreadService, MissingRecordError, ValidationError, userSecurity } from '@nexa/engine';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { EngineService } from './engine.service';
import { PortalTokenStore } from './portal-token.store';
import { CallerParam, type Caller } from './request-env';

const credential = /^Bearer nxp1\.([a-z0-9][a-z0-9_-]{0,62})\.([A-Za-z0-9_-]{43})$/i;
const positiveId = z.number().int().positive().max(2_147_483_647);
const issueRequest = z.strictObject({
  model: z.string().max(120).regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/),
  recordId: positiveId,
  fields: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,62}$/)).min(1).max(25),
  includeChatter: z.boolean().default(false),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});
const linkRequest = z.strictObject({ id: positiveId });
const portableTypes = new Set(['char', 'text', 'integer', 'float', 'monetary', 'boolean', 'date', 'datetime', 'selection']);
const privateModels = new Set(['res.users', 'res.groups', 'res.company']);

@Controller('api/portal')
export class PortalController {
  constructor(
    @Inject(EngineService) private readonly engine: EngineService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Post('links')
  @Header('Cache-Control', 'no-store')
  async issue(@CallerParam() caller: Caller, @Body() body: unknown) {
    const identity = await this.session(caller);
    const request = issueRequest.parse(body);
    const fields = [...new Set(request.fields)];
    const { recordCreatedAt } = await this.document(identity.tenant, identity.uid, { ...request, fields });
    const store = new PortalTokenStore((await this.engine.tenant(identity.tenant)).driver);
    const { id, secret, expiresAt } = await store.issue({
      ...request, fields, issuerUid: identity.uid, recordCreatedAt,
    });
    return { id, token: `nxp1.${identity.tenant}.${secret}`, expiresAt };
  }

  @Post('links/revoke')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async revoke(@CallerParam() caller: Caller, @Body() body: unknown) {
    const identity = await this.session(caller);
    const { id } = linkRequest.parse(body);
    const store = new PortalTokenStore((await this.engine.tenant(identity.tenant)).driver);
    if (!(await store.revoke(id, identity.uid))) throw new NotFoundException('Portal link unavailable');
    return { ok: true };
  }

  @Post('read')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async read(@Headers('authorization') authorization?: string) {
    const match = credential.exec(authorization ?? '');
    if (!match || !this.engine.config.tenants.has(match[1])) throw new NotFoundException('Portal link unavailable');
    const [, tenant, secret] = match;
    const store = new PortalTokenStore((await this.engine.tenant(tenant)).driver);
    const link = await store.find(secret);
    if (!link) throw new NotFoundException('Portal link unavailable');
    try {
      const { values, messages } = await this.document(tenant, link.issuerUid, link);
      return { model: link.model, id: link.recordId, values, messages };
    } catch (error) {
      if (error instanceof AccessError || error instanceof MissingRecordError || error instanceof ValidationError) {
        throw new NotFoundException('Portal link unavailable');
      }
      throw error;
    }
  }

  private async session(caller: Caller) {
    if (!caller.bearerToken) throw new UnauthorizedException('A login session is required');
    const identity = await this.auth.authenticate(caller.bearerToken);
    if (identity.kind !== 'session') throw new UnauthorizedException('A login session is required');
    return identity;
  }

  private async document(tenant: string, uid: number, link: {
    model: string; recordId: number; fields: readonly string[]; includeChatter: boolean; recordCreatedAt?: string;
  }) {
    const { model, recordId, fields } = link;
    const env = await this.engine.env(tenant, uid);
    return env.transaction(async (tx) => {
      const engineEnv = tx as Parameters<typeof userSecurity>[0];
      const security = await userSecurity(engineEnv);
      if (!security.groups.has('base.group_system')) throw new AccessError('Only settings administrators can share documents');
      if (!this.engine.config.portalModels.has(model) || privateModels.has(model) || /^(?:ir|nx|mail)\./.test(model)) {
        throw new AccessError('Model sharing is disabled');
      }
      const target = engineEnv.registry.models.get(model);
      if (!target?.table || target.def.transient) throw new AccessError('Model sharing is disabled');
      for (const field of fields) {
        const definition = target.fields.get(field);
        if (!definition || !portableTypes.has(definition.type) || definition.groups?.length ||
            definition.related || definition.compute || definition.computeExpr || definition.delegated ||
            field === 'create_uid' || field === 'write_uid') {
          throw new ValidationError(`Field '${field}' cannot be shared`);
        }
      }
      const records = tx.model(model);
      if (!(await records.search([['id', '=', recordId]], { limit: 1 })).ids.length) throw new MissingRecordError('Document unavailable');
      const [row] = await records.browse(recordId).read([...new Set([...fields, 'create_date'])]);
      const createdAt = row?.create_date;
      if (!(createdAt instanceof Date)) throw new MissingRecordError('Document unavailable');
      const recordCreatedAt = createdAt.toISOString();
      if (link.recordCreatedAt !== undefined && link.recordCreatedAt !== recordCreatedAt) throw new MissingRecordError('Document unavailable');
      const values = Object.fromEntries(fields.map((field) => [field, row[field]]));
      const messages = link.includeChatter ? await new MailThreadService(tx).portalMessages(model, recordId) : [];
      return { recordCreatedAt, values, messages };
    });
  }
}
