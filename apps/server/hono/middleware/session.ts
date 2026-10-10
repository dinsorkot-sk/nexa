import type { Context, Next } from 'hono';
import { authRepository, createTenantContext, identityRepository } from '@nexa/db';
import { digestSessionToken } from '../../../../packages/auth/src/index';
import { principals, type AppDependencies } from '../shared';

export const sessionCookie = 'nexa_session';
export const cookieValue = (header: string | undefined, name: string): string | undefined => header?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
export const setSessionCookie = (c: Context, token: string, expiresAt: Date) => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  c.header('Set-Cookie', `${sessionCookie}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure}`);
};
export const clearSessionCookie = (c: Context) => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  c.header('Set-Cookie', `${sessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
};

/** Resolves the session cookie into a principal for the request. Unauthenticated requests pass through. */
export function sessionMiddleware(dependencies: AppDependencies) {
  return async (c: Context, next: Next) => {
    const token = cookieValue(c.req.header('cookie'), sessionCookie);
    if (token && dependencies.db) {
      const digest = digestSessionToken(token);
      const identity = identityRepository(dependencies.db);
      const session = await identity.getActiveSession(digest);
      if (session) {
        const user = await identity.getUser(session.tenantId, session.userId);
        if (user?.status === 'active') {
          const roleIds = await identity.listRoleIds(session.tenantId, session.userId);
          principals.set(c, { userId: user.id, tenantId: user.tenantId, name: user.displayName || null, roleIds, sessionId: session.id });
          await authRepository(dependencies.db, createTenantContext(session.tenantId)).touchSession(session.id);
        }
      }
    }
    await next();
  };
}
