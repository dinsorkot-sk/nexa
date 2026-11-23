import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { TENANT_HEADER, UID_HEADER } from '@nexa/shared';
import type { Request } from 'express';

export interface Caller {
  tenant: string;
  uid: number;
}

/**
 * DEVELOPMENT AUTHENTICATION: the caller is taken from the X-Nexa-Tenant / X-Nexa-Uid headers.
 * It is only accepted when NEXA_DEV_AUTH=1 (checked by the controllers via EngineService.config).
 * Real sessions/tokens replace this before any deployment.
 */
export function callerFrom(req: Request): Caller {
  const tenant = req.header(TENANT_HEADER);
  const rawUid = req.header(UID_HEADER);
  if (!tenant || !rawUid || !/^[1-9][0-9]{0,9}$/.test(rawUid)) {
    throw new UnauthorizedException(`Missing or invalid ${TENANT_HEADER} / ${UID_HEADER} headers`);
  }
  return { tenant, uid: Number(rawUid) };
}

export const CallerParam = createParamDecorator((_data: unknown, ctx: ExecutionContext): Caller =>
  callerFrom(ctx.switchToHttp().getRequest<Request>()));
