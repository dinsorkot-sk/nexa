import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { TENANT_HEADER, UID_HEADER } from '@nexa/shared';
import type { Request } from 'express';

export interface Caller {
  tenant?: string;
  uid?: number;
  bearerToken?: string;
}

/** Bearer credentials take precedence. Development identity headers are parsed only as a fallback. */
export function callerFrom(req: Request): Caller {
  const authorization = req.header('authorization');
  if (authorization !== undefined) {
    const match = /^Bearer (nx1\.[a-z0-9][a-z0-9_-]{0,62}\.[A-Za-z0-9_-]{43})$/i.exec(authorization);
    if (!match) throw new UnauthorizedException('Invalid bearer token');
    return { bearerToken: match[1] };
  }
  const tenant = req.header(TENANT_HEADER);
  const rawUid = req.header(UID_HEADER);
  if (!tenant || !rawUid || !/^[1-9][0-9]{0,9}$/.test(rawUid)) {
    throw new UnauthorizedException(`Missing or invalid ${TENANT_HEADER} / ${UID_HEADER} headers`);
  }
  return { tenant, uid: Number(rawUid) };
}

export const CallerParam = createParamDecorator((_data: unknown, ctx: ExecutionContext): Caller =>
  callerFrom(ctx.switchToHttp().getRequest<Request>()));
